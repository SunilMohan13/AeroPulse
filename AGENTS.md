# AeroPulse — agent notes

## Commands

```bash
uv sync
uv run ruff check .
uv run ruff format .
uv run pyright
uv run pytest tests/unit tests/contract -q
docker compose -f infrastructure/docker/compose.yaml config
docker compose -f infrastructure/docker/compose.yaml up --build
```

Switch ingestion to live upstreams (OpenAQ + Open-Meteo + FIRMS):

```bash
cp .env.example .env          # fill AEROPULSE_OPENAQ_API_KEY and AEROPULSE_FIRMS_MAP_KEY
echo 'AEROPULSE_CONNECTOR_MODE=live' >> .env
docker compose -f infrastructure/docker/compose.yaml up --build
```

The connector is a scheduled loop, not a one-shot job: each source runs on its own
`interval_seconds` from `config/sources.yaml`. There is no `--profile connectors`; no service ever
declared a profile, so passing it was always a no-op.

Mint a local JWT:

```bash
uv run python -c "from aeropulse_auth import encode_token, Role; print(encode_token('dev', [Role.ADMIN]))"
```

## Conventions

- Google-style docstrings on public functions.
- structlog JSON; never log secrets or raw PII. Bind `correlation.id`; `trace_id`/`span_id` bind automatically from the active OTel span (`libs/observability/aeropulse_observability/logging.py`), no manual wiring needed.
- Canonical contracts live in `libs/contracts`. Connectors must not leak source shapes past `normalize()`.
- A served prediction must state its own provenance: `model_version`, and `degraded` when it came
  from a deterministic fallback. A hazard score also carries `calibrated`, because an
  uncalibrated score ranks but is not a probability. Never render an unlabelled number.
- New sources: implement `DataConnector`, add a fixture + contract test, add a `SourceSpec` to
  `apps/connector/.../registry.py`, and register in `config/sources.yaml` (`enabled: false` really
  does skip it). Topic is derived from the contract a connector returns, so one source may emit
  several. Do not change the event engine or UI unless the data type is new.
- Live ingestion: `AEROPULSE_CONNECTOR_MODE=live`. Open-Meteo needs no key; OpenAQ and FIRMS each
  need a free one (`.env.example`). A live-capable source whose credential is absent reports
  `NOT_CONFIGURED` and publishes nothing — it never silently serves a fixture under a live banner.
- IMD is `enabled: false` on purpose: no public API, no credential, and Open-Meteo already emits
  the same `meteo.v1` for the same sites. Two source ids carrying identical numbers would inflate
  `sensor_coverage` on every event.
- Auth: HS256 JWT in development (`AEROPULSE_JWT_SECRET`). OIDC later.
- H3 resolution 8 is the 1 km grid.
- Phase 3 scoring is deterministic (`libs/intelligence`). Do not call an LLM from the event path.
  Detection, anomaly, source likelihood and forecast must stay LLM-free. The copilot is the only
  LLM surface and lives in its own package (`libs/copilot`) so this boundary is structural, not a
  convention: `libs/intelligence` has no LLM dependency. See ADR-0007.
- Source likelihoods are independent, not a softmax.
- The copilot may only obtain a number by calling a tool in `libs/copilot/tools.py`, and every
  answer passes `grounding.validate_answer` before it is returned. `llm_used` is true only when a
  model produced the text and its numbers traced to tool results; a missing key, an upstream
  error or a grounding failure all degrade to deterministic retrieval with a stated reason.
- Air quality bands are the CPCB National Air Quality Index, never US EPA. The same concentration
  maps to a different label on each scale, so the wrong table misstates public risk.
- Ground-station measurements outrank model output for the same cell-hour
  (`snapshot.MODEL_DERIVED_SOURCES`). Open-Meteo corridor sites share H3 cells with CPCB stations,
  and without that rule a CAMS-derived value silently replaces a real measurement.
- List endpoints (`GET /api/v1/events`, `GET /api/v1/sources`) take `limit`/`offset`; keep new list endpoints consistent with that shape (`items`, `total`, `limit`, `offset`).

## ML rules

- `libs/contracts/aeropulse_contracts/feature_spec.py` is the ONLY place a model feature may be
  named. Training and serving both import it. Never write a feature list by hand.
- A feature DERIVED from a set's target is as much a leak as the target itself. Record every
  derived feature's inputs in `feature_spec.DERIVED_FROM`; the import-time assertion walks that
  graph. `pm25_delta_1h` is the worked example — a different name, the same information.
- Changing any feature set means bumping `ML_FEATURE_VERSION`. `validate_feature_contract`
  compares it exactly, which is what invalidates stale artifacts instead of silently feeding them
  a vector that no longer means the same thing.
- Run `uv run aeropulse-ml parity` after touching `features.py` or `feature_spec.py`. It is the
  gate that makes offline metrics mean anything; it exits non-zero on divergence.
- Random train/test splits are forbidden (LLD §19). Use `temporal_split`, `spatial_split` or
  `seasonal_split` from `libs/ml/evaluation.py`.
- A `FeatureSet` must never contain its own target; an import-time assertion enforces this.
- Any statistic used to build a target or label is fitted on TRAINING ROWS ONLY, then applied to
  held-out rows. Fitting before the split is the leakage bug this layer was built to remove.
- Every metric must be reported against an honest baseline (persistence for regression,
  majority-class for classification). A model that cannot beat its baseline must not be promoted.
- The promotion gate in `libs/ml/train.py` is load-bearing. Do not relax a threshold to make a
  model pass; fix the model or leave it at VALIDATION. Adding a gate is fine; removing one is not.
- A withheld model belongs at `SHADOW`, not in a response. Shadow scoring runs after the served
  answer exists and catches everything: a challenger must never be able to affect, delay or fail
  what a user sees.
- Model artifacts are pickle-based. `AEROPULSE_MODEL_DIR` must stay deployment-controlled.
- Open-Meteo air quality is CAMS-derived model output, not ground truth. Never state its metrics
  as station accuracy.

## Frontend (`frontend/web`)

The UI has a **Demo / Live** switch in the top bar. Both are first-class:

- **Demo** serves `src/data/mock*.ts` — a scripted Punjab stubble-burning episode transporting
  into Delhi NCR. It is a product feature, not a stub: it must keep working with no backend, no
  token and no network. Do not degrade it to wire something up.
- **Live** reads the API. Needs `VITE_API_TOKEN` in `frontend/web/.env.local` (see
  `.env.example`); without it the Live button is disabled and says why.

Rules that matter more than the wiring:

- **Never render a demo value while the header says Live.** Every service call goes through
  `services/resolve.ts`, which records a fallback so `FallbackBanner` can name the endpoint and
  the reason. Silent substitution is the worst failure this app can have.
- **The API supplies strictly less than the demo.** No recommended actions, no population
  headcount, no source telemetry, no citizen list. Those render as "—" with a reason, never as
  demo values. `DataProvenance.unavailable` carries the list; `MaybeValue` renders it.
- **A baseline is not a model.** Hazard and peak currently answer from a persistence rule.
  `ProvenanceBadge` marks them `degraded`, and `CalibrationNote` marks uncalibrated scores —
  0.80 is a ranking, not an 80% chance.
- New nullable API fields go in the UI type as `| null`, not as a sentinel. `-1 min` reaching an
  operator is the bug that pattern causes.
- Add `mode` to every React Query key so a fast toggle cannot serve the other mode's cache.
- One HTTP client (`src/api/client.ts`) and one demo/live branch (`services/resolve.ts`). A
  second client with different fallback semantics is how the two halves silently diverge.
- Wrap a parameterised service in `queryFn: () => fn(id)`. React Query passes a context object
  to a bare reference, which arrives as the first argument.
- Checks: `npm run build` (tsc + vite) and `npm run lint`.

## Out of this pass

Copilot LLM, citizen CV, ArangoDB client, MLflow, Sentinel/MODIS/CAMS live, SigNoz, Kubernetes.
The event API reads TimescaleDB when `AEROPULSE_DATABASE_URL` is configured and falls back to the
in-memory test double otherwise.
Export OpenAPI with `uv run python scripts/export_openapi.py`.

## Remaining work (honest backlog)

These are the next real tasks that still matter for a production-grade delivery, without pretending
there are large hidden gaps in the already-implemented backend:

- Quantile (P50/P90) fitting for the propagation and peak models. `forecast.v1` already carries
  `p10`/`p90`; the squared-error point forecast is why extreme recall collapses at longer
  horizons.
- Calibration for `pm25_hazard_24h`, so its score can be presented as a probability. It currently
  reports `calibration: "none"` and `calibrated: false`, which is accurate but limits the UI.
- Worker-side materialisation of champion hazard/peak predictions, so those routes can serve a
  promoted model rather than the deterministic baseline.
- Provider-aware resume semantics beyond the shared `FetchRequest.cursor` contract.
- OIDC / production auth hardening and secret-store integration.
- Layout coordinates on `graph.v1`, or a UI force layout, so the Evidence graph can render live.
  This is now the only screen still demo-only in live mode.
- A licensed WorldPop or Census extract to replace `fixtures/population/density.json`. It is the
  single population source — both `/api/v1/risk/areas` and the `score_risk(lat, lon)` lookup read
  it — and it ships licensed `replace-before-production` with five corridor cells, so Punjab
  resolves as unmeasured.
- Operator-agreed exposure bands. `risk_band()` thresholds are presentation values calibrated to
  the index's real range, not a validated classification.
- A per-cell observed-history route, so the forecast chart's observed leg can leave demo data.
- Source health telemetry on `GET /api/v1/sources` (freshness, latency, quality, record counts).
- Default OTLP exporter wiring. Domain metrics exist and increment; nothing exports them.
- Error drift (as opposed to distribution drift), which needs delayed ground truth to be
  persisted first.
- Load testing, SLOs, and operational dashboards for API and worker paths.
- Live connector expansion beyond the credential-free Open-Meteo path.

These remain explicit follow-ups; they are not hidden defects in the current backend pass.
