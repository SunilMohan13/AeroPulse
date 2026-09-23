"""Environment-backed application settings.

Secrets are referenced by name only. Never log field values marked as secret.
"""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from ``AEROPULSE_`` environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="AEROPULSE_",
        env_file=".env",
        extra="ignore",
    )

    service_name: str = "aeropulse"
    service_version: str = "0.1.0"
    environment: str = "development"
    log_level: str = "INFO"

    jwt_secret: SecretStr = Field(default=SecretStr("dev-only-change-me-use-32-bytes-min"))
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "aeropulse"
    # Extra CORS origins, comma-separated. Localhost and the Netlify demo
    # host are always allowed; this is for preview URLs and a custom API host.
    cors_origins: str = ""

    # Local Compose defaults only. Override via AEROPULSE_* in every non-dev env.
    database_url: str | None = Field(
        default=None,
        description="Set AEROPULSE_DATABASE_URL (include password). Compose injects it.",
    )
    redis_url: str = "redis://127.0.0.1:6379/0"
    kafka_bootstrap_servers: str = "127.0.0.1:19092"
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: SecretStr | None = None
    minio_secret_key: SecretStr | None = None
    minio_bucket: str = "aeropulse"
    minio_secure: bool = False

    otel_exporter_otlp_endpoint: str | None = None
    connector_mode: Literal["replay", "live"] = "replay"
    default_h3_resolution: int = 8
    openai_api_key: SecretStr | None = None
    oidc_jwks_url: str | None = None
    arangodb_url: str | None = None
    mlflow_tracking_uri: str | None = None
    drift_monitor_interval_seconds: int = Field(default=3600, ge=60)
    drift_monitor_reference_hours: int = Field(default=168, ge=1)
    drift_monitor_current_hours: int = Field(default=24, ge=1)
    drift_monitor_min_samples: int = Field(default=30, ge=10)
    drift_monitor_max_samples: int = Field(default=10000, ge=100)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
