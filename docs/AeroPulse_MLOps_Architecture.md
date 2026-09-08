# AeroPulse India — MLOps Architecture

**Date:** 2026-09-08
**Implements:** LLD §19 (registry and lifecycle), §20 (feature store), §45 (scientific validation), §46 (drift — not yet built).

---

## 1. What existed before

`libs/intelligence/model_registry.py`, in full, was a hardcoded list of three pydantic objects with `approval_status` defaulting to `"PRODUCTION"`. No artifact path, no promotion, no rollback, no champion resolution, and the source-likelihood model was absent from the list entirely. Nothing could be registered, compared, or rolled back, and `"PRODUCTION"` was a string literal rather than a state anything had earned.

LLD §19's 11 metadata fields and 6-stage promotion machine were unimplemented, and no metric existed anywhere in any shipped package to promote against.

---

## 2. Lifecycle

```text
                    aeropulse-ml train
                            |
                            v
              [ dataset: canonical observations ]
                            |
                     shared feature spec
                            |
            +---------------+---------------+
            |               |               |
       temporal        spatial         seasonal      <- separate fit per holdout
            |               |               |
            +-------> metrics + skill <-----+
                            |
                     PROMOTION GATE          <- can block; see section 4
                            |
              pass ---------+--------- fail
                |                        |
          TRAINING                  TRAINING
             |                          |
        VALIDATION                 VALIDATION  (terminal until fixed)
             |
          SHADOW
             |
          CANARY
             |
        PRODUCTION  <- exactly one per model family
             |
         RETIRED
```

Transitions are enforced by a table, not by convention (`ALLOWED_TRANSITIONS` in `libs/ml/registry.py`). A freshly trained model **cannot** jump to `PRODUCTION`; attempting it raises `PromotionError`. That is what makes `SHADOW` and `CANARY` meaningful rather than decorative. `RETIRED` is terminal. `force=True` exists for rollback drills and records the override.

Promoting a successor automatically retires the incumbent of the same family, so exactly one champion exists per family at any moment — otherwise serving would be ambiguous. Promotion of one family never touches another.

---

## 3. Registry metadata

Every LLD §19 field is recorded (`ModelRecord`):

| Field | Source |
|---|---|
| `model_id`, `model_name`, `version` | Trainer, timestamped |
| `stage` | Lifecycle state |
| `algorithm` | Estimator class |
| `feature_version` | Serving contract, e.g. `grid-features-0.4.0` |
| `ml_feature_version` | Shared spec, e.g. `ml-features-1.0.0` |
| `feature_names` | **Exact ordered list**, used to refuse mismatched artifacts |
| `training_dataset_version`, `dataset` | Row count, cell count, window, sources |
| `code_commit` | `git rev-parse --short HEAD` at training time |
| `training_time`, `geography`, `season` | Run context; season derived from data coverage |
| `metrics` | Full per-holdout metric tree |
| `artifact_uri` | Local path today, `s3://` when MinIO credentials exist |
| `notes` | Caveats **and** any promotion-gate failure reasons |

The index is a JSON document under the registry root (`$AEROPULSE_MODEL_DIR`, default `./models`). The interface deliberately mirrors MLflow's shape — register, list, transition, resolve champion — so swapping the backend does not touch calling code.

---

## 4. The promotion gate

Metrics are only worth computing if a bad one can stop a release. `evaluate_promotion_gate()` returns blocking reasons; `--promote` honours them.

| Model | Blocks promotion when |
|---|---|
| `pm25_estimator` | Temporal skill vs persistence ≤ 0, or temporal R² ≤ 0, or the temporal holdout was not evaluable |
| `anomaly_detector` | Detection F1 < 0.30 against the CPCB "Very Poor" exceedance label |
| `source_likelihood` | Macro F1 < 0.50, or any class with support is never predicted correctly |
| `propagation_forecast` | Any horizon has temporal skill ≤ 0 |

A blocked model is registered and held at `VALIDATION` — inspectable and comparable, but never served. The reasons are written into `notes` so a later reader learns why without re-running anything.

**This gate is load-bearing, not ornamental.** On the 2026-09-08 run it blocked three of four models:

```text
anomaly_detector      detection F1 0.086, recall 0.046 -> most exceedances missed
source_likelihood     class 'traffic' never predicted correctly
propagation_forecast  24h skill -0.1192
```

And on the small offline fixture it blocked the fourth as well (`skill -2.6697`, `R² -0.4376`), preventing a model that overfits 144 rows from ever serving. Coverage: `tests/unit/test_promotion_gate.py`, 15 tests, each pinned to a failure actually observed on real data.

---

## 5. Feature store (LLD §20)

LLD §20 advises against a heavyweight feature-store product for the MVP. Current state:

| Layer | LLD §20 | Implemented |
|---|---|---|
| Offline | Parquet + object storage | `save_parquet()`; **falls back to CSV without pyarrow** (`data/training/grid_features.csv`) |
| Historical queries | TimescaleDB | **Not wired** — `grid_feature` hypertable exists, nothing writes to it |
| Hot features | Redis | **Not wired** — Redis is in compose and in deps, never instantiated |
| Feature metadata | TimescaleDB | Written alongside the dataset as `*_metadata.json` |

The property LLD §20 actually cares about — *"training and inference use the SAME feature definitions"* — **is** satisfied, by `aeropulse_contracts.feature_spec` plus the load-time contract check. The storage tiers are the gap, not the definition.

---

## 6. Training → serving path

```text
aeropulse-ml train ---> joblib bundle ---> registry index
                                              |
                                        champion(model_name)
                                              |
                                    ModelBundleCache.get()
                                              |
                                  validate_feature_contract()
                                        /            \
                                    pass              fail
                                      |                 |
                             model.predict()    degrade + record why
```

`validate_feature_contract()` rejects an artifact whose feature list differs in **name, order, or count**, or whose `ml_feature_version` differs from the runtime. Order matters because a serialised tree model is positional; a silent reordering would return confident nonsense. Failure is never fatal: the loader records the reason in `load_errors` and the caller degrades (LLD §40). `predict_latest()` surfaces `degraded_models` in its output so partial degradation is visible rather than quiet.

Artifacts are memoised per process, so champion loading does not dominate inference latency — measured 0.056 s for 5 cells including first load.

**Trust boundary.** `joblib.load` is pickle-based and executes arbitrary code from its payload. This is safe only because the registry root is deployment-controlled and written solely by this package's training runs. `AEROPULSE_MODEL_DIR` must never point at a directory accepting third-party uploads. If artifacts ever become externally supplied, replace the loader with a schema-validated format such as ONNX first. Documented in the `inference.py` module docstring.

---

## 7. Reproducibility

| Concern | Status |
|---|---|
| Fixed seed | `RANDOM_STATE = 42` in every estimator |
| Code provenance | `code_commit` on every record |
| Data provenance | Row/cell counts, window, source list per artifact |
| Feature provenance | `feature_version` + `ml_feature_version` + exact `feature_names` |
| Deterministic splits | Spatial holdout picks cells deterministically so retrains stay comparable |
| Dataset snapshot | `--save-dataset` writes the frame plus metadata |
| Environment | `uv.lock` pins every dependency |
| Data drift over time | **Partial** — the live window is trailing, so metrics move with fetch date. A pinned archive range is available via `--fixture` or explicit dates |

---

## 8. Gaps

| Gap | LLD | Severity |
|---|---|---|
| No drift monitoring (feature/prediction/error drift, PSI/KS) | §46 | P1 |
| Features and predictions never persisted, so no offline/online consistency check and no post-hoc error tracking once labels arrive | §13, §20 | P1 |
| No model-metadata table in SQL; the registry is a JSON index, not queryable alongside predictions | §13 | P2 |
| Artifacts local-only; MinIO writes silently no-op without credentials | §11 | P2 |
| No shadow-traffic mechanism — `SHADOW`/`CANARY` are recorded stages but nothing routes live traffic to a challenger for comparison | §19 | P2 |
| No ML job in CI; nothing retrains or re-validates automatically | §46 | P2 |
| No automated retraining trigger | §46 | P3 |

The highest-value next step is persisting `grid_feature` and `grid_prediction`. It unblocks the feature store, the API read path, post-hoc error measurement once ground truth arrives, and drift detection — four gaps from one change.
