# AeroPulse Bruno Collection

Mirrors `docs/openapi/openapi.v1.json`. Worker scrape (`http://127.0.0.1:9090/metrics`) is not in this collection — different port, no JWT.

1. Open `bruno/aeropulse` in Bruno.
2. Select the `local` environment.
3. Set `token` to a VIEWER JWT (`uv run python -c "from aeropulse_auth import encode_token, Role; print(encode_token('ui', [Role.VIEWER]))"`). Compose already injects one into the web container; do not commit it here.
4. Set `eventId`, `gridId`, and `reportId` from list responses before calling detail routes.

Default base: `http://127.0.0.1:8000`.

List routes take `limit`/`offset`. `GET /api/v1/grid-features/{gridId}/history` is the per-cell observed PM2.5 series. Hazard and peak items are persistence baselines until a champion is promoted — read `degraded` / `calibrated` on the body.
