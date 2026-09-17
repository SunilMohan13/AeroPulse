"""FastAPI application factory."""

from time import perf_counter, time

from aeropulse_common.settings import get_settings
from aeropulse_observability.logging import configure_logging
from aeropulse_observability.metrics import (
    CACHE_REQUESTS,
    HTTP_DURATION,
    HTTP_IN_FLIGHT,
    HTTP_REQUESTS,
    route_label,
)
from aeropulse_observability.telemetry import configure_telemetry
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from aeropulse_api import cache
from aeropulse_api.routers import (
    alerts,
    citizen,
    copilot,
    drift,
    events,
    grid,
    health,
    models,
    risk,
    sources,
)
from aeropulse_api.routers import map as map_router


def create_app() -> FastAPI:
    """Build the AeroPulse API with routers and CORS for the local UI."""
    settings = get_settings()
    settings.service_name = "aeropulse-api"  # type: ignore[misc]
    configure_logging(settings)
    configure_telemetry(settings)

    app = FastAPI(
        title="AeroPulse API",
        version=settings.service_version,
        description="AeroPulse India API v1: map, sources, events, forecast, evidence graph.",
        openapi_tags=[
            {"name": "health", "description": "Liveness and readiness"},
            {"name": "sources", "description": "Data source registry and backfill"},
            {"name": "map", "description": "GeoJSON layers for the operational map"},
            {"name": "events", "description": "Pollution events, evidence, forecast, lineage"},
            {"name": "grid-intelligence", "description": "Persisted grid features and predictions"},
            {"name": "drift", "description": "Feature and prediction distribution drift"},
            {"name": "copilot", "description": "Evidence-grounded reasoning (no LLM invention)"},
            {"name": "citizen", "description": "Citizen reports (corroborative, no CV)"},
            {"name": "alerts", "description": "Canonical alerts (log channel)"},
            {"name": "risk", "description": "Exposure vs pollution severity"},
        ],
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health.router)
    app.include_router(sources.router)
    app.include_router(map_router.router)
    app.include_router(events.router)
    app.include_router(grid.router)
    app.include_router(drift.router)
    app.include_router(copilot.router)
    app.include_router(citizen.router)
    app.include_router(alerts.router)
    app.include_router(risk.router)
    app.include_router(models.router)

    @app.get("/metrics", include_in_schema=False)
    def metrics() -> Response:
        """Expose Prometheus metrics for local/collector scraping."""
        return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    buckets: dict[str, list[float]] = {}

    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        started = perf_counter()
        HTTP_IN_FLIGHT.inc()
        response = None
        try:
            if request.url.path.startswith("/api/v1/"):
                key = request.client.host if request.client else "unknown"
                now = time()
                window = [t for t in buckets.get(key, []) if now - t < 60]
                if len(window) >= 600:
                    response = JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
                else:
                    window.append(now)
                    buckets[key] = window
            cacheable = response is None and cache.is_cacheable(request.method, request.url.path)
            cache_key = None
            if cacheable:
                cache_key = cache.cache_key(str(request.url), request.headers.get("authorization"))
                cached, outcome = await cache.get_cached(cache_key)
                CACHE_REQUESTS.labels(request.url.path, outcome).inc()
                if cached is not None:
                    response = Response(
                        content=cached["body"].encode("utf-8"),
                        status_code=cached["status_code"],
                        media_type=cached["media_type"],
                        headers={"X-AeroPulse-Cache": "HIT"},
                    )
            if response is None:
                response = await call_next(request)
                if (
                    cacheable
                    and cache_key is not None
                    and response.status_code == 200
                    and response.headers.get("content-type", "").startswith("application/json")
                ):
                    body = b"".join([chunk async for chunk in response.body_iterator])
                    payload = {
                        "body": body.decode("utf-8"),
                        "status_code": response.status_code,
                        "media_type": "application/json",
                    }
                    stored = await cache.set_cached(cache_key, payload)
                    CACHE_REQUESTS.labels(
                        request.url.path, "stored" if stored else "write_error"
                    ).inc()
                    response = Response(
                        content=body,
                        status_code=response.status_code,
                        headers={
                            key: value
                            for key, value in response.headers.items()
                            if key.lower() not in {"content-length", "content-type"}
                        }
                        | {"X-AeroPulse-Cache": "MISS" if stored else "BYPASS"},
                        media_type="application/json",
                        background=response.background,
                    )
            return response
        finally:
            route = route_label(request)
            status = str(response.status_code) if response is not None else "500"
            HTTP_REQUESTS.labels(request.method, route, status).inc()
            HTTP_DURATION.labels(request.method, route).observe(perf_counter() - started)
            HTTP_IN_FLIGHT.dec()

    return app
