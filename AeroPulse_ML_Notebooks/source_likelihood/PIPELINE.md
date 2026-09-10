# AeroPulse source likelihood — pipeline

Nine notebooks plus one shared module, replacing the previous three. Each
notebook writes a Parquet table or artifact directory the next one reads, so
any stage can be re-run without repeating the ones before it.

```
pm25_estimator/data/pm25/processed/event_aware/pm25_event_aware_features.parquet
        │
        ▼
01 data quality       ── data/source/processed/base/source_evidence.parquet
   contract, provenance,  + data_quality_report.json
   availability flags
        │
        ▼
02 evidence features  ── data/source/processed/features/source_evidence_features.parquet
   pollutant anomalies,   + station_context.csv
   transport consistency
        │
        ▼
03 labeling functions ── data/source/processed/labels/labeling_function_votes.parquet
   15 independent LFs     + labeling_functions.csv
        │
        ▼
04 weak supervision   ── data/source/processed/labels/weak_labels.parquet
   aggregation,           + events.parquet, conflict_matrix.csv
   conflict, unknown
        │
        ▼
05 classifiers        ── artifacts/source/classifiers/
   4 families x 5 sources
        │
        ▼
06 calibration        ── artifacts/source/calibration/
   sigmoid/isotonic/beta, per-source thresholds
        │
        ├──────────────────────────┐
        ▼                          ▼
07 temporal/spatial/event    08 gold set
   artifacts/source/evaluation/  artifacts/source/gold_set/
        │                          │
        └────────────┬─────────────┘
                     ▼
              09 packaging ── artifacts/source/registry/v{n}/
                 model.joblib, metadata.json, metrics.json,
                 feature_schema.json, label_schema.json, calibration.json
```

## Running

```bash
uv pip install --python ../../.venv/bin/python -r ../requirements.txt
```

Launch Jupyter **from this folder** (so `AEROPULSE_PROJECT_ROOT=.` resolves
here), or set `AEROPULSE_PROJECT_ROOT` explicitly. Run 01 through 09 in
order. No network access is required at any stage.

The shared module carries its own test suite:

```bash
../../.venv/bin/python source_toolkit.py
```

24 checks covering the data contract, evidence availability, abstention
semantics, the multi-label property, leakage exclusion with a positive
control, event splitting, all three calibration methods, registry
immutability, likelihood independence, and the abstention path.

## Notebook responsibilities

| # | Notebook | Plan sections | Produces |
|---|---|---|---|
| 01 | `data_quality` | 9-12, 38 | contract, provenance, availability flags |
| 02 | `evidence_features` | 13-20 | pollutant anomalies, transport consistency, station context |
| 03 | `labeling_functions` | 5, 6, 3.1 | 15 independent LFs with reliability weights |
| 04 | `weak_supervision` | 7, 8, 22, 23 | multi-label targets, conflict, unknown, events |
| 05 | `classifier_training` | 21, 24, 27 | per-source classifiers, family comparison |
| 06 | `probability_calibration` | 25, 26, 32 | calibration comparison, per-source thresholds |
| 07 | `temporal_spatial_evaluation` | 29, 30, 31 | event split, geographic blocks, event agreement |
| 08 | `gold_set_evaluation` | 27, 28 | annotation sheet, scoring harness, tautology analysis |
| 09 | `model_packaging` | 33-40, 45-48 | registry, inference contract, promotion gates |

## Design decisions worth knowing before you change anything

**Labels are multi-label and always were supposed to be.** The previous
implementation assigned one class per row through a priority chain where
later rules overwrote earlier ones, so a row with both fire and transport
evidence emerged as `biomass_burning` alone. Notebook 03 measures the cost:
**88.8% of the rows the old rule labelled had competing evidence that was
discarded**, and `dust` — first in the overwrite order — never survived at
all. Never reintroduce a single `source_label` column.

**`mixed_unknown` is not a class.** It is derived at the end from the
absence of confident source scores. Modelling it as a sixth competing class
teaches the classifier that predicting "unknown" is a winning strategy,
because it is the majority label.

**Abstention is NaN, not 0.5.** A source on which every labeling function
abstained has no opinion. An early version scored it 0, which the logistic
squash mapped to 0.5, which cleared the positive threshold — silence became
support. Every downstream statistic is NaN-aware and the toolkit asserts it.

**Ratios do not work as evidence here; level anomalies do.** Every X/PM2.5
ratio falls 5-8x across concentration bands purely because PM2.5 is the
denominator, so "high NO2:PM2.5" mostly means "PM2.5 is low". Per-station
normalisation does *not* fix it (measured in notebook 02). The labeling
functions read pollutant level anomalies instead, which contain no PM2.5.

**The classifier may not see any labeling-function input**, nor any column
those inputs were derived from. `no2_level_anomaly` is `cams_no2` over a
per-station constant, so leaving `cams_no2` available would hand the model
the same information under a different name. `select_features` excludes
both; `assert_no_label_leakage` fails loudly.

**Co-pollutants come from CAMS, which is model output.** They cover 100% of
rows, so the old optional OpenAQ fetch is unnecessary — but CAMS is driven
by an emissions inventory that already encodes where traffic and industry
are. A traffic likelihood built on `cams_no2` partly reads back CAMS's own
traffic inventory. That discount is carried as a 0.55 reliability weight.

**Events are keyed on `(location_id, event_id)`.** The upstream `event_id`
is not unique across stations — 706 values across 149 stations. Grouping on
it alone produces 706 "events" averaging 257 days long.

**The output statement is a safety control, not presentation.** Never
"caused by", never "identified", never "proven". The contract test enforces
it.

## Known gaps

- **No gold set.** No human-reviewed attribution labels exist, so every
  metric in this pipeline measures agreement with the weak-labeling system,
  not attribution accuracy. Notebook 08 ships the annotation sheet and the
  scoring harness; the promotion gate for it fails, correctly.
- **Regional transport and industrial are barely evaluable** — 7.8% and
  13.2% of rows respectively — because the upwind field is null on 36% of
  rows and the industrial evidence is thin.
- **Several labeling functions cannot issue a contradicting vote**, so their
  evidence only ever accumulates in one direction.
- **No industrial-zone, road-density, population or land-use data**, which
  is what the industrial and traffic hypotheses actually need.
- **Serving `libs/ml` is not updated by these notebooks.**
