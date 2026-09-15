import { useMemo, useState } from 'react'
import { useApp } from '../../context/AppContext'
import type { MapLayerVisibility } from '../../types'
import { searchLocations, type NamedLocation } from '../../utils/geo'
import type { MapScene } from './MapViewControls'

const layerOptions: { key: keyof MapLayerVisibility; label: string }[] = [
  { key: 'pollution', label: 'Pollution' },
  { key: 'fires', label: 'Fires' },
  { key: 'wind', label: 'Wind' },
  { key: 'forecast', label: 'Forecast' },
  { key: 'industry', label: 'Industry' },
  { key: 'population', label: 'Population' },
]

export function MapControls({
  scene = 'corridor',
  onZoomToFire,
  onSelectLocation,
}: {
  scene?: MapScene
  onZoomToFire?: () => void
  onSelectLocation?: (location: NamedLocation) => void
}) {
  const { layers, toggleLayer } = useApp()
  const [query, setQuery] = useState('')
  const results = useMemo(() => searchLocations(query), [query])

  const choose = (location: NamedLocation) => {
    onSelectLocation?.(location)
    setQuery('')
  }

  return (
    <>
      <div
        className={`absolute left-4 z-10 flex flex-col gap-1 ${
          scene === 'globe' ? 'top-14 sm:top-12' : 'top-4'
        }`}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) choose(results[0])
            if (e.key === 'Escape') setQuery('')
          }}
          placeholder="Search location..."
          aria-label="Search location"
          className="w-40 rounded-md border border-cyan-500/20 bg-black/55 px-3 py-1.5 text-sm backdrop-blur placeholder:text-text-muted sm:w-48"
        />
        {results.length > 0 && (
          <ul className="w-40 overflow-hidden rounded-md border border-border bg-bg-panel/95 backdrop-blur sm:w-48">
            {results.map((location) => (
              <li key={location.name}>
                <button
                  type="button"
                  onClick={() => choose(location)}
                  className="w-full px-3 py-1.5 text-left text-xs text-text-secondary hover:bg-bg-elevated hover:text-text-primary"
                >
                  {location.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {scene === 'corridor' && (
        <div className="absolute bottom-32 left-1/2 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 flex-wrap justify-center gap-1 rounded-lg border border-border bg-bg-panel/90 p-2 backdrop-blur">
          {layerOptions.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => toggleLayer(key)}
              aria-pressed={layers[key]}
              className={`rounded px-2.5 py-1 text-xs transition-colors ${
                layers[key] ? 'bg-intel/20 text-intel' : 'text-text-muted hover:text-text-secondary'
              }`}
            >
              {layers[key] ? '☑' : '☐'} {label}
            </button>
          ))}
        </div>
      )}

      {onZoomToFire && (
        <button
          type="button"
          onClick={onZoomToFire}
          // Clears the zoom/expand toolbar pinned to the right edge.
          className={`absolute right-16 z-10 rounded-md border border-cyan-500/20 bg-black/55 px-3 py-1.5 text-xs text-text-secondary backdrop-blur hover:text-intel ${
            scene === 'globe' ? 'top-14 sm:top-12' : 'top-4'
          }`}
        >
          Zoom to Punjab fires
        </button>
      )}
    </>
  )
}
