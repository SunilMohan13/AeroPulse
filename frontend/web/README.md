# AeroPulse web UI

MapLibre command-center UI for Punjab–Haryana–Delhi NCR. Demo and Live are both first-class.

## Run

```bash
cd frontend/web
npm install
npm run dev
```

Open http://localhost:5173

Demo needs no backend, token, or network. Live needs `VITE_API_TOKEN` in `.env.local` (see `.env.example`) and the API at `VITE_API_BASE` (empty uses the Vite proxy to `:8000`).

## Features

- Dark command-center shell with a **Demo / Live** switch in the top bar
- MapLibre GL (CARTO dark-matter) + deck.gl layers
- 1 km pollution grid, fires, wind, forecast plume, population
- Demo: scripted EVT-1024 Punjab agricultural-burning episode
- Live: FastAPI `/api/v1/*` through one client (`src/api/client.ts`) and one branch (`src/services/resolve.ts`)
- Failed live calls are named in `FallbackBanner`; they never silently substitute demo data
- AI Copilot with evidence citations (deterministic retrieval unless a grounded LLM is configured)

## Build

```bash
npm run build
npm run lint
npm run preview
```
