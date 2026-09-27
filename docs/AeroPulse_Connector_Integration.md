# AeroPulse India — Connector Integration

**Date:** 2026-09-08
**Implements:** LLD §7 (Connector SDK and registry), §9 (integration matrix), §30 (source health), §40 (failure handling).

---

## 1. State of every source

`live_verified` means a real HTTPS request was executed and the response parsed into canonical contracts during this review.

| Source | Connector | Mode | Credential | Live verified |
|---|---|---|---|---|
| **Open-Meteo** (AQ + weather) | `connectors/openmeteo` | **live + replay** | **none required** | **YES** — 2026-09-27 Compose one-shot: `HEALTHY`, 2600 records, 1950 AQ + 325 weather rows persisted. Also 2026-09-08 offline fixture parse |
| CPCB CAAQMS | `connectors/cpcb` | replay | none public | NO — CPCB has no free API; live ground stations go through OpenAQ |
| **OpenAQ** | `connectors/openaq` | live + replay | `AEROPULSE_OPENAQ_API_KEY` | NO in this environment (empty key → `NOT_CONFIGURED`). Replay fixture verified. Never silent-fixtures under a live banner |
| NASA FIRMS | `connectors/firms` | live + replay | `AEROPULSE_FIRMS_MAP_KEY` | NO in this environment (empty key → `NOT_CONFIGURED`). `live_capable=true` |
| IMD | `connectors/imd` | **disabled** | none | Fixture + contract kept. Yaml `enabled: false`; Open-Meteo already emits `meteo.v1` for the same sites |
| Sentinel-5P | `connectors/sentinel5p` | replay (raster) | Copernicus | NO — requires Copernicus account |
| MODIS MAIAC | `connectors/modis` | replay (raster) | Earthdata | NO — requires Earthdata login |
| CAMS | `connectors/cams` | replay (raster) | ADS | NO — requires ADS key |
| INSAT/MOSDAC | `connectors/insat` | replay (geo asset) | MOSDAC | NO — requires MOSDAC registration |
| Bhuvan/NRSC | `connectors/bhuvan` | replay (geo asset) | — | NO |
| ICAR/KRISHI | `connectors/icar` | replay (geo asset) | — | NO |
| Industry/OCEMS | `connectors/industry` | replay (geo asset) | — | NO |
| OSM | `connectors/osm` | replay (geo asset) | — | NO |
| **ERA5** | **none** | — | CDS key | **MISSING** — LLD §9 lists it |
| **Population** | `fixtures/population` + `/api/v1/risk/areas` | reference fixture | REFERENCE ONLY | Integrated plumbing; replace with licensed WorldPop/Census before operations |

Live mode is opt-in: `AEROPULSE_CONNECTOR_MODE` defaults to `replay`, so a test run can never silently reach the network. A unit test pins that default.

**The population gap has teeth.** The risk API now consumes versioned population cells and produces differentiated area scores. The committed values are a deterministic reference fixture, not operational population truth; production requires replacing it with a licensed provider extract and preserving its provenance/license metadata.

---

## 2. Open-Meteo connector

Chosen as the first live integration for one reason: it is the only source in the matrix that needs no credential, so it can be exercised in CI, on a laptop, and in this review. Every other source's live path is blocked on a secret this repository does not hold.

| Property | Value |
|---|---|
| Endpoints | `air-quality-api.open-meteo.com/v1/air-quality`, `api.open-meteo.com/v1/forecast` |
| Auth | none |
| Cadence | hourly; archive supports explicit `start_date`/`end_date` |
| Emits | `observation.v1` (6 pollutants), `meteo.v1`, `raster.v1` (AOD) |
| Sites | 5 corridor cells (Delhi NCR, Gurugram, Karnal, Ludhiana, Amritsar) |
| Rate limit | 3 req/s client-side |
| Timeout | 20 s |
| Measured | 10 requests → 87,360 canonical records in ~21 s |

**Replay and live share one parsing path.** The committed fixture stores **verbatim upstream payloads**, not a hand-simplified shape, so `normalize()` has exactly one implementation and replay cannot drift from live. Regenerate with:

```bash
AEROPULSE_CONNECTOR_MODE=live uv run python scripts/refresh_openmeteo_fixture.py
```

### Transformations, and why each is needed

* **Wind:** Open-Meteo publishes speed + compass direction; the platform's contract carries `wind_u`/`wind_v`. `wind_components()` is the exact inverse of `geometry.wind_direction_from()`. A sign error here would send every advection forecast the wrong way and no forecast unit test would notice, so it is pinned by a round-trip property test plus four hand-computed cardinal cases. `wind_speed_unit=ms` is requested explicitly — the default is km/h.
* **CO unit:** arrives as µg/m³, converted to **mg/m³** to match the CPCB connector's canonical unit. The feature builder reads pollutant values without consulting their unit, so mixing units across sources would silently corrupt the fused vector. A contract test asserts the converted range.
* **AOD:** emitted as `RasterObservation.sample_aod`, **never** as a `Measurement`. LLD §18.1 and caveat §65.5 forbid treating AOD as surface PM2.5; routing it through the raster contract makes that unmistakable by construction, enforced by a test.
* **Timestamps:** `timezone=UTC` is pinned, and naive stamps are *labelled* UTC rather than converted.
* **Missingness:** null upstream hours are skipped, never imputed, so the quality engine still sees the gap.

### Scientific caveat

Open-Meteo air quality is **CAMS-derived model output**, not ground reference measurement. `provenance.provider` records `"Open-Meteo (CAMS-derived model output)"` so the distinction survives into the evidence graph and the model registry. Legitimate as a background/prior input under LLD §9 and for pipeline validation; **not** a substitute for CPCB.

Licensing: CC-BY-4.0 for non-commercial use, attribution *"Weather and air quality data by Open-Meteo.com"* carried in the fixture and metadata. Commercial deployment requires review per LLD caveat §65.1.

---

## 3. Reliability primitives

All of these existed in the SDK before this pass and **none was wired into any execution path** — `retry_http`, `CircuitBreaker` and `fetch_json` were referenced only by their own definitions and unit tests. Setting `AEROPULSE_CONNECTOR_MODE=live` changed nothing, because every `fetch()` called `load_fixture` unconditionally.

`LiveHttpClient` now composes them in order: **rate limiter → circuit breaker → jittered retry → timeout**.

| Primitive | Status | Notes |
|---|---|---|
| Timeout | Wired | Per-request, asserted by test |
| Retry | Wired | 5 attempts max |
| Exponential backoff | Wired | `wait_exponential_jitter(initial=0.5, max=16)` |
| **Jitter** | **Added** | Previously absent — a thundering-herd risk when many workers recover from one outage together |
| Circuit breaker | **Wired** | One breaker per source, so a FIRMS outage cannot open CPCB's (LLD §5.2) |
| **Rate limiting** | **Added** | `rate_limit.py`, token bucket with burst; LLD §7.1 lists this file and it did not exist |
| Retry classification | **Fixed** | Previously retried **all** `HTTPError` including 4xx despite its docstring saying "5xx/429", so a `401` burned 5 attempts. Now only 408/425/429/5xx and transport faults |
| Dead-letter | Wired (worker layer) | Postgres `connector_dead_letter`, not the declared `aero.dlq.*` Kafka topic |
| Idempotency | Wired (worker layer) | SHA-256 `dedup_key` + `ON CONFLICT DO NOTHING` |
| Checkpointing | **Missing** | `FetchRequest.cursor` exists; no connector reads or writes it |
| Pagination | **Missing** | No connector implements it |

Coverage: `tests/unit/test_live_http.py`, 14 tests — breaker opens after repeated failures and then blocks calls without touching the network, success resets it, 404 is not retried, 429/503/transport faults are, timeout propagates, limiter bursts then throttles and refills.

---

## 4. Failure behaviour

| Failure | Behaviour |
|---|---|
| Source returns 5xx/429 | Retried with jittered backoff, up to 5 attempts |
| Source returns 401/404 | **Not** retried; fails fast to the dead-letter path |
| Source down repeatedly | Breaker opens after 5 consecutive failures; subsequent calls fail immediately without a network round trip; half-open probe after 30 s |
| Source slow | 20 s timeout |
| Rate budget exhausted | Client-side limiter blocks and records `throttled_seconds` |
| Partial data | Null hours skipped; `missing_feature_count` and `quality_score` carry the degradation forward |
| Schema change | Pydantic `extra=forbid` rejects at the boundary; record dead-lettered rather than corrupting the store |
| Duplicate delivery | `dedup_key` uniqueness makes ingestion idempotent |
| Live mode requested but disabled | `LiveModeDisabledError`, no silent fixture substitution |

Health: `health_check()` performs a **real single-site probe** in live mode and reports fixture presence in replay mode, rather than returning a hardcoded `True` as `POST /api/v1/sources/{id}/test` still does.

---

## 5. Adding a source

Unchanged from the LLD §7.3 contract, which is the architecture's genuine strength — the core platform does not change:

1. Create `connectors/<name>/` implementing `DataConnector`.
2. Map payloads to `libs/contracts`; never leak source shapes past `normalize()`.
3. Obtain a `LiveHttpClient` for hardened transport, or read a fixture for replay.
4. Commit a fixture holding a **verbatim** upstream payload, plus a contract test.
5. Register in `config/sources.yaml` (`auth_ref` only, never a secret).
6. Add the workspace member to `pyproject.toml`.

**Known defect:** step 5 is currently decorative. `apps/connector/aeropulse_connector_app/runner.py` hardcodes its job list and never reads `config/sources.yaml`, so registering a source there has no effect. The registry must be made load-bearing — tracked as P1-11.

---

## 6. Secrets

Verified clean: no credential appears in the working tree or in git history (`git log -S` across `api_key`, `password`, `secret`, `token`, `MAP_KEY`, `bearer` returns only labelled dev placeholders). All credentials are read via `os.getenv` with empty defaults. `.gitignore` covers `.env`, `*.pem`, `*.key`, `infrastructure/docker/secrets/*`.

**One issue found and fixed:** httpx logs every request at INFO including the full URL with query string. FIRMS and OpenAQ both carry their API key as a query parameter, so leaving that enabled would have written credentials into logs, against LLD §35.2. The `httpx`/`httpcore` loggers are now raised to WARNING in the CLI entry point. Prefer header-based auth for any new keyed connector.
