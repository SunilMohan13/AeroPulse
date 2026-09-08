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

    database_url: str = "postgresql://aeropulse:aeropulse@127.0.0.1:5432/aeropulse"
    redis_url: str = "redis://127.0.0.1:6379/0"
    kafka_bootstrap_servers: str = "127.0.0.1:19092"
    minio_endpoint: str = "127.0.0.1:9000"
    minio_access_key: SecretStr = Field(default=SecretStr("aeropulse"))
    minio_secret_key: SecretStr = Field(default=SecretStr("aeropulse_secret"))
    minio_bucket: str = "aeropulse"
    minio_secure: bool = False

    otel_exporter_otlp_endpoint: str | None = None
    connector_mode: Literal["replay", "live"] = "replay"
    default_h3_resolution: int = 8


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
