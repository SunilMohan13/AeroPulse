# ADR-0003: Development HS256 JWT with RBAC stubs

## Status

Accepted

## Context

LLD §35 specifies OIDC/OAuth2. That would add Keycloak to the local stack.

## Decision

HS256 JWT via `AEROPULSE_JWT_SECRET`, roles from LLD §35.1, FastAPI dependencies. OIDC can replace `decode_token` without changing routers.

## Consequences

Not production identity. Tokens are for local and CI only.
