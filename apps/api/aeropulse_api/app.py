"""FastAPI application factory."""

from time import time

from aeropulse_common.settings import get_settings
from aeropulse_observability.logging import configure_logging
from aeropulse_observability.telemetry import configure_telemetry
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from aeropulse_api.routers import events, health, sources
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
        description="Phase 1-3 BFF: sources, map, events. Forecast/graph stubbed.",
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

    buckets: dict[str, list[float]] = {}

    @app.middleware("http")
    async def rate_limit(request: Request, call_next):
        if request.url.path.startswith("/api/v1/"):
            key = request.client.host if request.client else "unknown"
            now = time()
            window = [t for t in buckets.get(key, []) if now - t < 60]
            if len(window) >= 600:
                return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
            window.append(now)
            buckets[key] = window
        return await call_next(request)

    return app
