# AeroPulse Bruno Collection

This collection mirrors every operation in `docs/openapi/openapi.v1.json`.

1. Open `bruno/aeropulse` in Bruno.
2. Select the `local` environment.
3. Set `token` to a valid JWT. The Docker development viewer token is supplied through `AEROPULSE_WEB_TOKEN` or the Compose default.
4. Set `eventId`, `gridId`, and `reportId` from API responses before calling dependent requests.

The collection targets `http://127.0.0.1:8000` by default. It includes health, source administration, all map layers, events, grid intelligence, drift, copilot, citizen reports, alerts, risk, population risk areas, industry assets, and models.
