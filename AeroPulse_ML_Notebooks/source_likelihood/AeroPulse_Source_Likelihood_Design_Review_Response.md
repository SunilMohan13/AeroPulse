# AeroPulse Source Likelihood — Design Review Response

Response to `AeroPulse_Source_Likelihood_ML_Improvement_Plan.md`, written
after implementing it. Every number here comes from an executed notebook in
this folder; nothing is projected.

**The plan's central judgement is correct and its diagnosis was
understated.** Section 3.1 identifies the priority-overwrite labeller as the
biggest architectural problem, and calls fixing the target definition — not
the model — the highest-value change. That is right. Measured cost is in
section 1.1 below: the old rule discarded competing evidence on 88.8% of the
rows it labelled, and made one of its five classes structurally unreachable.

The implementation also contradicts the plan in four places, recorded here
rather than quietly worked around.

---

## 1. Findings that change the plan

### 1.1 The overwrite chain was worse than "inconsistent"

The plan says the priority chain means the system "is not genuinely
modelling independent source likelihoods". True, and the measurement adds
two things:

- Of 245,508 rows the legacy rule assigned to a source, **217,962 (88.8%)
  had at least one other source with supporting evidence** that the
  overwrite silently destroyed.
- **`dust` never appeared at all** — 0.00% of rows. Not because dust
  evidence is rare (`LF_DUST_CAMS` alone fires on 18.1% of rows) but because
  dust is *first* in the overwrite order, so every dust row that also looked
  industrial, windy or fiery was relabelled. The old pipeline could not
  produce a dust label under any circumstances, and no downstream modelling
  could have recovered it.

With independent labeling functions, 30.0% of rows support two or more
sources.

### 1.2 The co-pollutant fetch was never needed, and the data it would have
fetched is not what the plan assumes

Sections 12-13 treat NO2/CO/SO2/O3/PM10 as an optional OpenAQ acquisition,
default off, with a warning that traffic labels are weak without it. In fact
the upstream table already carries all five as **CAMS fields at 0.00%
missingness**, plus `cams_dust`, which is a better dust indicator than the
meteorological proxy section 16 proposes.

So the network dependency is gone. But CAMS is chemical-transport *model*
output driven by an emissions inventory that already encodes where traffic
and industry are. Using `cams_no2` as traffic evidence partly reads back
CAMS's own traffic inventory — it is not independent confirmation. This is
carried as a reliability weight of 0.55 (against 0.95 for a PM2.5
measurement and 0.90 for a FIRMS detection) so the discount propagates into
the aggregated label rather than living in a comment.

### 1.3 The plan's section 13 ratios do not work, and per-station
normalisation does not fix them

Section 13 asks for `no2_pm25_ratio`, `co_pm25_ratio`, `so2_pm25_ratio`,
`pm10_pm25_ratio`. Measured across concentration bands, **every one of them
falls 5-8x as PM2.5 rises** — NO2:PM2.5 goes 0.488 → 0.071 from the <30
band to the >250 band. That is arithmetic: PM2.5 is the denominator. A
labeling function reading "high NO2:PM2.5 means traffic" fires
preferentially on clean air.

The obvious correction — divide by each station's own median ratio — was
implemented and **did not work**: enrichment still decayed 1.47 → 0.23
across the same bands. Recorded because it is the kind of fix that looks
convincing and is not.

What works is the **pollutant level anomaly**, which has no PM2.5 in it:
each pollutant against its own station-median level. NO2 then rises 0.76 →
1.66 with concentration, ozone falls (NOx titration), and the coarse
fraction collapses 1.55 → 0.23. All three ratio labeling functions were
repointed accordingly.

That last number is a substantive finding for the product: **severe PM2.5
episodes in this dataset are fine-dominated, i.e. combustion, not dust.**

### 1.4 "Unknown" cannot be a class, and abstention cannot be 0.5

Section 8 says `mixed_unknown` should be an uncertainty state rather than an
ordinary class, and the implementation confirms why. Under the old scheme
`mixed_unknown` was 85.6% of rows — a classifier trained on that learns
that predicting "unknown" is the winning strategy.

A subtler version of the same error appeared during implementation and is
worth recording. The first aggregation gave a source score 0 when all its
functions abstained; the logistic squash mapped 0 to probability 0.5; and
0.5 cleared the positive threshold. **Silence was being counted as
support.** It produced an `is_unknown` rate of exactly 0.0% and a median
conflict score of 1.0. Abstention is now NaN and propagates NaN-aware
through every statistic, with an assertion in the test suite.

---

## 2. Plan coverage

| Plan section | Status | Where |
|---|---|---|
| 4 multi-label source scores | done | nb 04 — 24.4% of rows support 2+ sources |
| 5 independent labeling functions | done — 15 functions | nb 03 |
| 6 labeling-function reliability | done | `st.LABELING_FUNCTIONS` |
| 7 conflict detection | done | nb 04 §3 |
| 8 unknown as a state, not a class | done — derived, never modelled | `aggregate_weak_labels` |
| 9 source provenance | done | `st.EVIDENCE_PROVENANCE`, nb 01 |
| 10 availability timestamps | partial — latency per family, not per row | nb 01 §4 |
| 11 observed vs forecast namespaces | n/a — this table contains no forecasts | nb 01 |
| 12 co-pollutant availability flags | done | `add_evidence_availability` |
| 13 pollutant ratios and interactions | **superseded** — ratios do not work here | nb 02 §2 |
| 14 traffic improvements | done — diurnal, NO2 anomaly, rolling correlation | nb 03 |
| 15 biomass improvements | already upstream (upwind fire) | nb 02 §1 |
| 16 dust improvements | done — CAMS dust + coarse fraction | nb 03 |
| 17 regional transport | done — upwind PM2.5, wind, local excess | nb 02-03 |
| 18 multi-hour transport consistency | done | `add_transport_features` |
| 19 industrial improvements | partial — SO2 and behaviour; no zone data | nb 03 |
| 20 station context | done as a behavioural proxy | `add_station_context` |
| 21 model comparison | done — LR / LGBM / XGB / CatBoost per source | nb 05 §3 |
| 22 multi-label training target | done | nb 04 |
| 23 weak-supervision aggregation | done — reliability-weighted vote | `aggregate_weak_labels` |
| 24 label model / classifier boundary | done and enforced by a test | `assert_no_label_leakage` |
| 25 calibration comparison | done — sigmoid / isotonic / beta | nb 06 §1 |
| 26 calibration metrics | done — PR-AUC, Brier, ECE, MCE, reliability | `calibration_metrics` |
| 27 evaluation caveat | done — and quantified | nb 08 §3 |
| 28 gold set | harness only — no expert labels exist | nb 08 |
| 29 event-level sampling | done — 44,563 events | `build_events` |
| 30 temporal event validation | done | nb 07 §1 |
| 31 geographic generalization | done — 5 k-means blocks | nb 07 §2 |
| 32 source-specific thresholds | done | nb 06 §3 |
| 33 abstention | done | `SourceLikelihoodPredictor` |
| 34 output contract | done | nb 09 §2 |
| 35 explainability | done — evidence phrases per source | `EVIDENCE_PHRASES` |
| 36 source evidence score | done as `attribution_confidence` | `aggregate_weak_labels` |
| 37 evidence quality HIGH/MED/LOW | done | `evidence_quality` |
| 38 missing vs negative evidence | done and tested | nb 09 §3 |
| 39 model versioning | done | nb 09 §1 |
| 40 model registry | done, immutable | `SourceRegistry` |
| 41 notebook structure | done — 9 notebooks as specified | this folder |
| 42 reusable package | done as one module, not a package tree | `source_toolkit.py` |
| 43-44 training / inference architecture | done | PIPELINE.md |
| 45 production fallback | done | nb 09 §3 |
| 46 monitoring | reference distributions only | nb 09 §6 |
| 47 safety wording rule | done and enforced by a test | `_statement` |
| 48 promotion gates | done — 10 gates, 4 failing | nb 09 §5 |

Two deliberate departures. **Section 42** asked for an eight-directory
package; this is one module, matching the precedent already set by
`anomaly_detector/anomaly_toolkit.py` and the propagation pipeline in this
repository. **Section 13's ratio set** is implemented and then replaced,
for the reason measured in 1.3 above.

---

## 3. Results

### 3.1 What the classifiers achieve

Test period, per-source binary classifiers on 56 leak-safe features.
PR-AUC lift (PR-AUC divided by prevalence) is the only figure comparable
across sources, because prevalence ranges from 0.07% to 36%.

| source | PR-AUC | lift | ROC-AUC | ECE | calibration |
|---|---|---|---|---|---|
| dust | 0.709 | 1.95x | 0.823 | 0.036 | isotonic |
| traffic | 0.613 | 2.86x | 0.810 | 0.017 | isotonic |
| industrial | 0.145 | 3.51x | 0.769 | 0.021 | sigmoid |
| regional_transport | 0.015 | 3.28x | 0.783 | 0.001 | beta |
| biomass_burning | 0.007 | 10.83x | 0.851 | 0.012 | sigmoid |

All five beat a constant-prevalence null and a shuffled-label control.
Calibration improves ECE 3x to 45x, and **all three methods win somewhere**
— a single global choice would be wrong for two of five sources.

Geographic blocks hold up better than expected given that `lat`/`lon`
dominate the feature importances: every source keeps positive lift on all
five held-out blocks (worst cell: dust at 1.45x).

Event-based splitting costs a great deal. Biomass burning falls from 10.8x
on a row split to **1.95x** on an event split — hours within one episode
are near-duplicates, and holding out whole episodes removes that crutch.

### 3.2 Why nothing is promoted

Four of ten gates fail: temporal validation (1.95x vs 2.0 required),
spatial validation (1.45x vs 1.5), one source below the lift floor, and the
gold set. Three of those four are dust, which is the most predictable source
in absolute terms and the least impressive in lift terms because its
prevalence is 36%.

**Served behaviour today: 48.3% of requests abstain**, and of those that
resolve only dust and traffic are ever served. Mean attribution confidence
is 0.171. For a source-attribution product that is the correct failure mode
and an uncomfortable headline.

### 3.3 The finding that matters most

The tautology analysis (notebook 08) compares a leak-safe classifier
against one allowed to see the labeling-function inputs, measuring how much
of each weak label is a restatement of its own definition:

| source | leak-safe PR-AUC | with label inputs | % explained only by its own inputs |
|---|---|---|---|
| dust | 0.720 | 1.000 | 28.0% |
| traffic | 0.621 | 1.000 | 37.9% |
| industrial | 0.145 | 1.000 | 85.5% |
| regional_transport | 0.014 | 1.000 | 98.6% |
| biomass_burning | 0.011 | 0.999 | 98.9% |

**Dust and traffic are largely learnable from independent evidence** —
roughly two thirds of what defines them is recoverable from weather,
calendar, terrain and CAMS CO/O3. Those hypotheses have some claim to be
about the atmosphere.

**Biomass burning and regional transport are, on this evidence, nearly
definitional.** "Biomass burning" here *means* "upwind fire radiative power
is high and PM2.5 is elevated". A classifier denied both has nothing left
(PR-AUC 0.011); one given both scores 0.999 and has learned nothing.

The practical consequence is a recommendation the plan does not contain:
**for biomass burning and regional transport, serve the labeling function
directly with its reliability weight rather than a classifier that pretends
to have learned it.** The ML layer earns its place for dust and traffic and
does not for the other two.

### 3.4 Label drift makes the test period a different question

| source | train | test | ratio |
|---|---|---|---|
| biomass_burning | 8.01% | 0.07% | 0.008 |
| regional_transport | 5.47% | 0.46% | 0.084 |
| industrial | 16.42% | 4.12% | 0.251 |
| traffic | 43.50% | 21.45% | 0.493 |
| dust | 29.65% | 36.27% | 1.223 |

Biomass burning is **120x rarer** in the test period. The dataset holds one
stubble-burning season and the chronological split puts it entirely on the
training side. Consequence: biomass has the best ranking of any source
(ROC-AUC 0.851) and an **F1 of exactly zero**, because a threshold frozen on
a period 75x richer fires on nothing. Promoting on F1 would be the wrong
call; this is also why thresholds must be revisited whenever prevalence
shifts.

---

## 4. Defects found by implementing

Six, all of which would have shipped:

1. **The overwrite chain erased an entire class.** `dust` appeared on 0.00%
   of rows despite its evidence firing on 18.1%.
2. **Abstention counted as support.** An all-abstaining source scored 0,
   squashed to probability 0.5, which cleared the positive threshold —
   producing an `is_unknown` rate of exactly 0.0% and a median conflict
   score of 1.0.
3. **Leakage exclusion was too narrow.** Naming the exact labeling-function
   inputs but not their families let the classifier read
   `upwind_fire_count_50km`, `pm25_lag_1h` and `n_sources_evaluated` (a
   label output). It produced PR-AUC 0.9999 on biomass — a number that
   looked like success and was a leakage report.
4. **Calibration was selected on its own fitting data.** Isotonic scored
   ECE exactly 0.00000 on all five sources and won every time. With a
   held-out selection slice, three different methods win.
5. **Events merged across stations.** The upstream `event_id` is not unique
   per station — 706 values across 149 stations — so grouping on it alone
   produced 706 "events" averaging 257 days long.
6. **Ratios are anti-correlated with concentration by construction**, and
   per-station normalisation does not fix it.

Items 2, 3 and 4 share a shape: each produced a *better-looking* number.
That is the failure mode this pipeline is built to resist, and each now has
a test that fails loudly.

---

## 5. What to do next, in order

1. **Build the gold set.** 100-500 reviewed events using the sheet and
   protocol in notebook 08. Until it exists, no number here measures
   attribution accuracy, and the promotion gate correctly refuses.
2. **Serve the labeling functions directly for biomass burning and regional
   transport.** The classifier adds nothing measurable over them (98.9% and
   98.6% definitional) while adding a layer that can drift.
3. **Give every labeling function a contradicting condition.** Six can only
   ever vote +1, so their evidence accumulates in one direction and their
   conflict score is structurally zero.
4. **Coverage-weight the event-level dominance** before scoring it. The 6.2%
   event agreement in notebook 07 compares two different aggregations, not
   two answers.
5. **Re-tune thresholds seasonally, or per regime.** A threshold frozen on a
   period 75x richer in biomass fires on nothing.
6. **Acquire industrial-zone, road-density and land-use data.** The
   industrial and traffic hypotheses are inferring land use from time of
   day, which is the weakest evidence in the system.
7. **Do not add a GNN or a Transformer** (plan section 49 P2). The binding
   constraint is that two of five labels are tautologies and none has ever
   been checked against a human.

---

## 6. Definition of Done (plan section 50)

```
[x] True multi-label source schema
[x] Independent source likelihoods
[x] Labeling functions separated
[x] Weak-label aggregation implemented
[x] Evidence provenance implemented
[~] Feature availability timestamps      (per family, not per row)
[x] Missing evidence distinguished from negative evidence
[x] Temporal leakage tests implemented
[x] Event-level dataset implemented
[x] Geographic holdout implemented
[ ] Human-reviewed gold dataset          (harness only — no expert labels)
[x] Source-specific metrics implemented
[x] PR-AUC implemented
[x] Brier score implemented
[x] Calibration curves implemented
[x] Abstention implemented
[x] Conflict detection implemented
[x] Explainability implemented
[x] Model versioning implemented
[x] Production inference API implemented
[x] Fallback implemented
[~] Drift monitoring implemented         (reference distributions only)
[x] Model registry implemented
[x] Automated promotion gates implemented
```

21 of 24 complete, 2 partial, 1 not started.

The pipeline is production-ready. **The model is not**, and the pipeline is
what tells you so — including the part that says two of its five hypotheses
are currently definitions rather than findings.
