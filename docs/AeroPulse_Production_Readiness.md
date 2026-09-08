# AeroPulse India — Production Readiness

**Date:** 2026-09-08
**Verdict: not production ready.** Suitable for a technical demonstration of the ML pipeline via the CLI. Not suitable for operational air-quality decisions.

---

## 1. Readiness by area

| Area | Ready | Blocking issues |
|---|---|---|
| Contracts & schema versioning | **Yes** | — |
| Connector extension model | **Yes** | — |
| Idempotency & dedup | **Yes** | — |
| ML training & evaluation | **Yes (methodology)** | Trained on model output, not ground truth |
| Model registry & promotion gate | **Yes** | No shadow-traffic routing |
| Live ingestion | **Partial** | 1 of 15 sources live; 3 have no connector |
| Feature pipeline | **Partial** | Features never persisted |
| API | **No** | Not database-backed |
| UI | **No** | Mock data only |
| Observability | **No** | No metrics, no `trace_id`, traces export nowhere |
| Drift monitoring | **No** | Not implemented |
| Security | **Partial** | Dev-only JWT by design; no OIDC |
| Disaster recovery | **Partial** | Documented; untested |
| SLO monitoring | **No** | Nothing measurable |

---

## 2. Sequenced remediation

Dependency-ordered. Each item states why it comes when it does.

### Stage 1 — make the pipeline observable end to end

**1.1 Persist `grid_feature` and `grid_prediction`.** Both hypertables exist and nothing writes to them. Highest leverage change in the backlog: it unblocks the feature store (LLD §20), the API read path, post-hoc error measurement once labels arrive, and drift detection (LLD §46) — four gaps from one change. Write from the worker after `process_snapshot`, keyed on `(time, grid_id, model_version)` which the schema already supports.

**1.2 Give the API a database read path.** Replace the process-local `EVENT_STORE` with a repository reading TimescaleDB, keeping the in-memory store as the test double. Until this lands, `GET /api/v1/events` returns `[]` under Compose no matter what the worker does, and neither the HTTP nor the UI demo can work. Delete or invert `test_events_empty`, which currently encodes the broken behaviour as correct.

**1.3 Wire OTel export and add the metrics of LLD §33.2.** Set `AEROPULSE_OTEL_EXPORTER_OTLP_ENDPOINT` in compose, add a structlog processor binding `trace_id`, and add the counters and histograms for ingestion latency, quality-failure rate, ML inference latency and API latency. Without this no SLO in LLD §59 is measurable, so no SLO can be claimed.

### Stage 2 — make the science defensible

**2.1 Obtain CPCB ground truth and retrain.** Every current metric describes reconstruction of CAMS-derived model output. This is the single highest-value scientific action; no modelling change substitutes for it. Only after this can the PM2.5 estimator's accuracy be stated operationally.

**2.2 Calibrate the anomaly alert threshold.** Measured recall is 0.046 against the CPCB "Very Poor" exceedance label — roughly 95% of exceedances missed — with a false-alert rate of 0.003. The residual model is sound (R² 0.84); the alert rule is not. Tune the margin against an explicit false-alert budget agreed with operators, then re-run the gate. Requires no retraining.

**2.3 Per-horizon forecast promotion.** 3/6/12 h show real skill (+0.17 to +0.46); 24 h is worse than persistence (−0.119). Promote per horizon rather than per model so the useful horizons ship. Do not tune until the aggregate looks acceptable — that hides the 24 h regression.

**2.4 Source attribution needs labels, not a better model.** `traffic` scores F1 = 0.000. The labels are heuristics; a larger model would reproduce the heuristic with more parameters. Either obtain labelled attribution data or reduce scope to the classes that validate (`regional_transport`, F1 0.84) and state the limitation. Per LLD §5.4, complexity is not the missing ingredient.

**2.5 Add a population source.** `DEFAULT_POPULATION_DENSITY = 5000.0` applies uniformly to every cell, so exposure numbers are undifferentiated by construction. LLD §18.5 separates severity from population risk; that separation is currently nominal.

### Stage 3 — harden

**3.1 Implement drift monitoring** (LLD §46): feature drift, prediction drift, error drift, PSI/KS. Depends on 1.1.
**3.2 Make `config/sources.yaml` load-bearing.** The runner ignores it and hardcodes its job list, so the source registry of LLD §7.2 is decorative.
**3.3 Fix the MinIO silent no-op.** `put_raw_json` returns a synthetic `s3://` URI without writing when credentials are absent, and swallows all exceptions, so `provenance.raw_object_uri` points at nothing. Either fail loudly or record that no raw copy was retained.
**3.4 Add checkpointing.** `FetchRequest.cursor` exists and no connector reads it, so every fetch is a full window re-pull.
**3.5 Add an ML job to CI.** Nothing retrains or re-validates automatically; a leakage regression would not be caught.
**3.6 Wire Redis** for the hot-feature and API-response caching of LLD §20/§32, or remove it from compose and dependencies.
**3.7 Complete the confidence model.** `forecast_confidence` and `impact_confidence` are hardcoded `0.0` while the forecast module computes its own per-cell confidence that is discarded.

### Stage 4 — operational
Frontend-to-API wiring, OIDC, DR rehearsal, load testing against a populated database, security testing, then SLO monitoring.

---

## 3. Risks if deployed as-is

| Risk | Severity | Why |
|---|---|---|
| Accuracy claims based on model output | **High** | Metrics describe CAMS reconstruction, not station accuracy. Publishing them as air-quality accuracy would be misleading |
| Anomaly detector missing 95% of exceedances | **High** | If force-promoted, an operator would reasonably infer "no alert" means "no exceedance" |
| Source attribution read as causal | **High** | Weak labels; one class undetectable. LLD caveat §65.4 exists precisely for this |
| Undifferentiated exposure numbers | Medium | Uniform population density makes impact ranking meaningless |
| No drift detection | Medium | Seasonal shift into the burning season would degrade the model silently |
| No observability | Medium | Failures would be discovered by users rather than by monitoring |
| Raw provenance URIs pointing at nothing | Medium | Breaks the audit chain LLD §5.3 requires |
| Dev-only symmetric JWT | Medium | Documented and intentional; still not production identity |

---

## 4. What is genuinely safe to demonstrate now

* The connector extension model, including a real live source with no credential.
* Point-in-time-correct feature engineering on a real 90-day window, with the shared spec preventing train/serve skew.
* Four models trained on real data with temporal, spatial and seasonal holdouts and skill scores against honest baselines.
* A model registry with a promotion gate that **demonstrably refuses** three of four models on measured quality.
* Champion inference with feature-contract validation and graceful degradation, at 0.056 s for 5 cells.
* An honest metrics story, including the negative results.

The last point is the most defensible thing in this repository. A reviewer can see which models work, which do not, and precisely why — which is considerably more valuable than four models all reported as passing.
