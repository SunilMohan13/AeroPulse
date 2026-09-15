"""API auth and source/map contract tests."""

from datetime import UTC, datetime
from pathlib import Path

import pytest
from aeropulse_api.app import create_app
from aeropulse_api.event_store import reset_event_store
from aeropulse_auth.jwt import Role, encode_token
from aeropulse_common.settings import Settings, get_settings
from aeropulse_ml.registry import ModelRecord, ModelRegistry, ModelStage
from fastapi.testclient import TestClient


@pytest.fixture
def client() -> TestClient:
    get_settings.cache_clear()
    reset_event_store()
    return TestClient(create_app())


@pytest.fixture
def settings() -> Settings:
    return get_settings()


def _auth(settings: Settings, *roles: Role) -> dict[str, str]:
    token = encode_token("tester", list(roles) or [Role.VIEWER], settings=settings)
    return {"Authorization": f"Bearer {token}"}


def test_health_unauthenticated(client: TestClient) -> None:
    assert client.get("/health").status_code == 200


def test_metrics_expose_http_count_latency_and_route_templates(
    client: TestClient, settings: Settings
) -> None:
    headers = _auth(settings, Role.VIEWER)
    assert client.get("/api/v1/events/concrete-id", headers=headers).status_code == 404

    response = client.get("/metrics")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/plain")
    body = response.text
    assert "aeropulse_http_requests_total" in body
    assert "aeropulse_http_request_duration_seconds_bucket" in body
    assert 'route="/api/v1/events/{event_id}"' in body
    assert 'route="/api/v1/events/concrete-id"' not in body


def test_sources_requires_auth(client: TestClient) -> None:
    assert client.get("/api/v1/sources").status_code == 401


def test_viewer_can_list_sources(client: TestClient, settings: Settings) -> None:
    response = client.get("/api/v1/sources", headers=_auth(settings, Role.VIEWER))
    assert response.status_code == 200
    body = response.json()
    ids = {item["source_id"] for item in body["items"]}
    assert {"cpcb", "firms", "imd", "sentinel5p", "modis", "cams"} <= ids
    assert body["total"] == len(body["items"])
    assert body["limit"] is None
    assert body["offset"] == 0


def test_source_health_uses_real_connector_status(client: TestClient, settings: Settings) -> None:
    response = client.post(
        "/api/v1/sources/cpcb/test",
        headers=_auth(settings, Role.ADMIN),
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["source_id"] == "cpcb"
    assert payload["healthy"] is True
    assert payload["mode"] == "replay"
    assert payload["connector_id"] == "cpcb_caaqms"


def test_sources_pagination(client: TestClient, settings: Settings) -> None:
    headers = _auth(settings, Role.VIEWER)
    full = client.get("/api/v1/sources", headers=headers).json()
    paged = client.get("/api/v1/sources?limit=2&offset=1", headers=headers).json()
    assert paged["total"] == full["total"]
    assert paged["limit"] == 2
    assert paged["offset"] == 1
    assert paged["items"] == full["items"][1:3]


def test_viewer_cannot_create_source(client: TestClient, settings: Settings) -> None:
    response = client.post(
        "/api/v1/sources",
        headers=_auth(settings, Role.VIEWER),
        json={
            "source_id": "x",
            "provider": "x",
            "connector_id": "x",
            "display_name": "x",
            "data_type": "air_quality",
        },
    )
    assert response.status_code == 403


def test_admin_can_create_source(client: TestClient, settings: Settings) -> None:
    response = client.post(
        "/api/v1/sources",
        headers=_auth(settings, Role.ADMIN),
        json={
            "source_id": "openaq",
            "provider": "OpenAQ",
            "connector_id": "openaq",
            "display_name": "OpenAQ",
            "data_type": "air_quality",
        },
    )
    assert response.status_code == 201


def test_map_air_quality(client: TestClient, settings: Settings) -> None:
    response = client.get(
        "/api/v1/map/air-quality",
        headers=_auth(settings, Role.VIEWER),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert len(body["features"]) >= 1


def test_events_empty(client: TestClient, settings: Settings) -> None:
    response = client.get("/api/v1/events", headers=_auth(settings, Role.VIEWER))
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["limit"] is None
    assert body["offset"] == 0


def test_events_rejects_invalid_pagination_params(client: TestClient, settings: Settings) -> None:
    headers = _auth(settings, Role.VIEWER)
    assert client.get("/api/v1/events?limit=0", headers=headers).status_code == 422
    assert client.get("/api/v1/events?offset=-1", headers=headers).status_code == 422


def test_missing_event_forecast_and_graph_are_404(client: TestClient, settings: Settings) -> None:
    headers = _auth(settings, Role.VIEWER)
    assert client.get("/api/v1/events/evt_x/forecast", headers=headers).status_code == 404
    assert client.get("/api/v1/events/evt_x/graph", headers=headers).status_code == 404


def test_openapi_includes_forecast_and_graph(client: TestClient) -> None:
    spec = client.get("/openapi.json").json()
    paths = spec["paths"]
    assert "/api/v1/events/{event_id}/forecast" in paths
    assert "/api/v1/events/{event_id}/graph" in paths
    assert "/api/v1/map/forecast" in paths
    assert "/api/v1/copilot/explain-event" in paths
    assert "/api/v1/citizen/reports" in paths
    assert "/api/v1/alerts" in paths
    assert "/api/v1/risk" in paths


def test_models_lists_runtime_baselines_and_registered_challengers(
    client: TestClient,
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    artifact = tmp_path / "challenger.joblib"
    artifact.write_bytes(b"test-artifact")
    registry = ModelRegistry(tmp_path)
    registry.register(
        ModelRecord(
            model_id="pm25-challenger-v1",
            model_name="pm25_forecast",
            version="v1",
            stage=ModelStage.VALIDATION,
            algorithm="LightGBM",
            feature_names=["pm25", "pm25_lag_1h"],
            training_time=datetime(2026, 9, 13, tzinfo=UTC),
            artifact_uri=str(artifact),
        )
    )
    monkeypatch.setenv("AEROPULSE_MODEL_DIR", str(tmp_path))

    response = client.get("/api/v1/models", headers=_auth(settings, Role.VIEWER))

    assert response.status_code == 200
    body = response.json()
    challenger = next(item for item in body["items"] if item["model_id"] == "pm25-challenger-v1")
    assert challenger["approval_status"] == "VALIDATION"
    assert challenger["runtime_role"] == "REGISTERED_ONLY"
    assert challenger["artifact_available"] is True
    assert any(item["runtime_role"] == "PRIMARY_BASELINE" for item in body["items"])
    assert body["total"] == len(body["items"])


def test_citizen_report_round_trip(client: TestClient, settings: Settings) -> None:
    headers = _auth(settings, Role.CITIZEN)
    created = client.post(
        "/api/v1/citizen/reports",
        headers=headers,
        json={"lat": 28.6, "lon": 77.2, "observation_type": "haze"},
    )
    assert created.status_code == 201
    report_id = created.json()["report_id"]
    fetched = client.get(f"/api/v1/citizen/reports/{report_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["cv_class"] == "haze"
    assert fetched.json()["moderation"] == "pending"


def test_copilot_does_not_invent_event(client: TestClient, settings: Settings) -> None:
    headers = _auth(settings, Role.VIEWER)
    response = client.post(
        "/api/v1/copilot/explain-event",
        headers=headers,
        json={"event_id": "does-not-exist"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["llm_used"] is False
    assert body["observed_facts"] == []


def test_risk_endpoint(client: TestClient, settings: Settings) -> None:
    response = client.get(
        "/api/v1/risk", params={"pm25": 180}, headers=_auth(settings, Role.VIEWER)
    )
    assert response.status_code == 200
    assert "pollution_severity" in response.json()
    assert "population_risk" in response.json()
