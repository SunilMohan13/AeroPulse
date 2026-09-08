import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
  },
  optimizeDeps: {
    // MapLibre spawns its tile-decoding worker via `new Worker(new URL(...))`.
    // Dependency pre-bundling rewrites that specifier to a file it never
    // emits, so the worker 404s and MapLibre aborts every style, sprite and
    // tile request — the basemap silently stays blank. Serving MapLibre
    // unbundled keeps the worker URL resolvable.
    exclude: ['maplibre-gl'],
  },
})
