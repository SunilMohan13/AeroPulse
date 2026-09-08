import { AeroMap } from '../components/map/AeroMap'

export function LiveMap() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <h1 className="text-lg font-semibold">Live Map</h1>
        <p className="text-sm text-text-secondary">
          Primary geospatial intelligence experience
        </p>
      </div>
      <div className="relative min-h-0 flex-1">
        <AeroMap />
      </div>
    </div>
  )
}
