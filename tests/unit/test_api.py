"""API auth and source/map contract tests."""

import pytest
from aeropulse_api.app import create_app
from aeropulse_api.event_store import reset_event_store
from aeropulse_auth.jwt import Role, encode_token
from aeropulse_common.settings import Settings, get_settings
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


def test_sources_requires_auth(client: TestClient) -> None:
    assert client.get("/api/v1/sources").status_code == 401


def test_viewer_can_list_sources(client: TestClient, settings: Settings) -> None:
    response = client.get("/api/v1/sources", headers=_auth(settings, Role.VIEWER))
    assert response.status_code == 200
    ids = {item["source_id"] for item in response.json()["items"]}
    assert {"cpcb", "firms", "imd"} <= ids


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
    assert response.json()["items"] == []


def test_event_forecast_and_graph_are_not_implemented(
    client: TestClient, settings: Settings
) -> None:
    headers = _auth(settings, Role.VIEWER)
    assert client.get("/api/v1/events/evt_x/forecast", headers=headers).status_code == 501
    assert client.get("/api/v1/events/evt_x/graph", headers=headers).status_code == 501
