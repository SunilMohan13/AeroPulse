# AeroPulse — Claude Code entry point

Answer questions from the **knowledge graph and the docs below first**. Read source only to
change it, or when the graph and docs genuinely do not settle the question. `graphify-out/` was
rebuilt on 2026-09-23 and covers 4,726 nodes across code, config, and docs.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

Worked examples for this repo, strongest first:

```bash
# Best signal: name a real symbol. Returns call sites, callers, and rationale nodes.
graphify explain "_assert_no_target_leakage"
graphify explain "process_snapshot"

# Relationships — always pass --undirected, the directed search usually finds nothing.
graphify path "DataConnector" "PollutionEvent" --undirected

# Natural language works, but use repo vocabulary (file names, class names).
# Generic words like "rules" or "feature" collide with MapLibre and lint config.
graphify query "feature_spec leakage assertion" --budget 3000
```

Community labels in `graphify-out/GRAPH_REPORT.md` are named (e.g. "Feature Spec & Leakage
Guards", "Shadow Scoring Pipeline", "Plume Advection Geometry"), so scanning that report's
community list is usually faster than `find`/`grep` for "where does X live".

Known graph gaps: the 38 changed markdown/YAML docs from the 2026-09-23 pass were **not**
semantically re-extracted (doc extraction was skipped). Their nodes reflect the Sep 8 state.
Code nodes are current. Run `/graphify --update` and allow the doc subagents to close this.
`.playwright-mcp/` snapshots are deliberately excluded as transient noise.

## Where things live

| Area | Path | What it holds |
|---|---|---|
| API service | `apps/api/aeropulse_api/` | FastAPI app factory (`app.py`), stores (`event_store`, `grid_store`, `hazard_store`, `map_store`, `drift_store`), `demo_seed.py` |
| API routes | `apps/api/aeropulse_api/routers/` | `events`, `grid`, `map`, `risk`, `alerts`, `citizen`, `copilot`, `drift`, `models`, `sources`, `health` |
| Worker | `apps/worker/aeropulse_worker/` | Kafka consume → quality → grid mapping → Timescale persistence (`db.py`) |
| Connector runner | `apps/connector/aeropulse_connector_app/` | Replay fixtures, publish canonical envelopes |
| Contracts | `libs/contracts/aeropulse_contracts/` | Canonical schemas: `observation`, `event`, `alert`, `prediction`, `hazard`, `citizen`, `copilot`, **`feature_spec.py`** |
| Intelligence | `libs/intelligence/aeropulse_intelligence/` | Deterministic Phase 3: `detect`, `engine` (state machine), `anomaly`, `features`, `forecast`, `geometry`, `snapshot`, `copilot` |
| ML | `libs/ml/aeropulse_ml/` | `train`, `inference`, `evaluation`, `parity`, `registry`, `shadow`, `drift`, `drift_monitor`, `cli` |
| Connector SDK | `libs/connector_sdk/aeropulse_connector_sdk/` | `DataConnector` base, `live_http`, `circuit`, `rate_limit`, `retry` |
| Other libs | `libs/` | `auth` (HS256 JWT), `geospatial` (H3 grid, population), `observability` (structlog/OTel), `common` (errors) |
| Connectors | `connectors/<source>/` | 13 packages: bhuvan, cams, cpcb, firms, icar, imd, industry, insat, modis, openaq, openmeteo, osm, sentinel5p |
| Frontend | `frontend/web/src/` | `api/client.ts` (one HTTP client), `services/resolve.ts` (one demo/live branch), `pages`, `components`, `hooks`, `data/mock*.ts` |
| Bruno | `bruno/aeropulse/` | HTTP collection mirroring OpenAPI (`local` env) |
| Notebooks | `AeroPulse_ML_Notebooks/` | `anomaly_detector`, `pm25_estimator`, `propagation_forecast`, `source_likelihood` — each with a `*_toolkit.py` |
| Migrations | `infrastructure/db/migrations/` | `0001_init` → `0007_source_health_run` |
| Tests | `tests/unit`, `tests/contract`, `tests/load` | Contract tests pin connector output shapes |

## Which document answers what

| Question | Read |
|---|---|
| Conventions, ML rules, frontend rules, honest backlog | **`AGENTS.md`** — canonical, read before changing anything |
| System architecture + ADR index | `docs/architecture.md`, `docs/adr/0001`–`0006` |
| Endpoint shapes, auth | `docs/api.md`, `docs/openapi/`, `bruno/aeropulse/` |
| Payload schemas per source | `docs/data-contracts.md` |
| Adding a source | `docs/AeroPulse_Connector_Integration.md` |
| ML design / MLOps / notebook→prod | `docs/AeroPulse_ML_Architecture.md`, `docs/AeroPulse_MLOps_Architecture.md`, `docs/AeroPulse_Notebook_to_Production_ML_Integration_Plan.md` |
| What is unfinished | `docs/AeroPulse_Implementation_Gap_Analysis.md`, `docs/AeroPulse_Production_Readiness.md`, `AGENTS.md` backlog |
| Ops | `docs/runbook.md`, `docs/disaster-recovery.md` |
| Full low-level design | `AeroPulse_India_Low_Level_Design.md` (LLD §refs appear throughout the code) |

## Commands

```bash
uv sync
uv run ruff check . && uv run pyright
uv run pytest tests/unit tests/contract -q
uv run aeropulse-ml parity          # required after touching features.py / feature_spec.py
cd frontend/web && npm run build && npm run lint
graphify update .                   # refresh the graph after code changes (AST-only, free)
```

## Non-negotiables (full detail in AGENTS.md)

- `libs/contracts/.../feature_spec.py` is the only place a model feature may be named.
- No LLM on the event path; Phase 3 scoring is deterministic.
- Random train/test splits are forbidden — use `temporal_split` / `spatial_split` / `seasonal_split`.
- Never relax a promotion gate to pass a model.
- Never render a demo value while the UI header says Live.
- Every served prediction states `model_version` and `degraded`; hazard scores also state `calibrated`.
