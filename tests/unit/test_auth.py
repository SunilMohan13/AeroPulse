"""JWT encode/decode and RBAC tests."""

import pytest
from aeropulse_auth.jwt import Role, decode_token, encode_token, require_roles
from aeropulse_common.errors import AuthError
from aeropulse_common.settings import Settings


def test_round_trip_token() -> None:
    settings = Settings(jwt_secret="unit-test-secret-must-be-32bytes!")  # type: ignore[arg-type]
    token = encode_token("analyst-1", [Role.ANALYST], settings=settings)
    claims = decode_token(token, settings=settings)
    assert claims.sub == "analyst-1"
    assert Role.ANALYST in claims.roles


def test_invalid_token() -> None:
    settings = Settings(jwt_secret="unit-test-secret-must-be-32bytes!")  # type: ignore[arg-type]
    with pytest.raises(AuthError):
        decode_token("not-a-jwt", settings=settings)


def test_require_roles_forbids_viewer_admin() -> None:
    settings = Settings(jwt_secret="unit-test-secret-must-be-32bytes!")  # type: ignore[arg-type]
    token = encode_token("viewer", [Role.VIEWER], settings=settings)
    claims = decode_token(token, settings=settings)
    with pytest.raises(AuthError) as exc:
        require_roles(claims, Role.ADMIN)
    assert exc.value.status_code == 403
