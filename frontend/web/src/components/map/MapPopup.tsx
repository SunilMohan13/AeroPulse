import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import type { GridCell, FireObservation } from '../../types'
import { ScientificBadge } from '../common/Badge'
import { formatNumber, formatTimeIST } from '../../utils/format'
import { getBandLabel } from '../../utils/aqi'
import { distanceKm } from '../../utils/geo'
import { HERO_EVENT_ID } from '../../data/mockEvents'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

export function MapPopup({
  cell,
  fire,
  fires = [],
  onClose,
}: {
  cell: GridCell | null
  fire: FireObservation | null
  fires?: FireObservation[]
  onClose: () => void
}) {
  const nearbyFires = fire
    ? fires.filter((f) => f.id !== fire.id && distanceKm(fire.lat, fire.lon, f.lat, f.lon) < 25)
        .length
    : 0

  return (
    <div className="absolute right-4 top-4 z-20 w-64 rounded-lg border border-border bg-bg-panel/95 p-4 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-start justify-between">
        <h3 className="font-semibold">{fire ? 'Fire Detected' : 'Grid Cell'}</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded text-text-muted hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-intel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {fire && (
        <div className="space-y-2 text-sm">
          <ScientificBadge label="OBSERVED" />
          <p className="text-xs text-text-muted">
            Punjab · {formatTimeIST(fire.timestamp)} IST
          </p>
          <Row label="Fire Radiative Power" value={`${fire.frp.toFixed(0)} MW`} />
          <Row label="Confidence" value={`${Math.round(fire.confidence * 100)}%`} />
          <Row label="Nearby fires" value={String(nearbyFires)} />
          <div className="flex justify-between gap-4">
            <span className="text-text-secondary">Estimated impact</span>
            <span className="font-medium text-pollution-severe">HIGH</span>
          </div>
          <Link
            to={`/events/${HERO_EVENT_ID}`}
            className="mt-3 block w-full rounded-md bg-intel/20 py-2 text-center text-xs font-medium text-intel hover:bg-intel/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-intel"
          >
            Investigate event
          </Link>
        </div>
      )}

      {cell && (
        <div className="space-y-2 text-sm">
          <ScientificBadge label="OBSERVED" />
          <Row label="PM2.5" value={`${cell.pm25} µg/m³`} />
          <Row label="PM10" value={`${cell.pm10} µg/m³`} />
          <Row label="NO₂" value={`${cell.no2} ppb`} />
          <Row label="AQI" value={`${cell.aqi} · ${getBandLabel(cell.pm25)}`} />
          <Row label="Population" value={formatNumber(cell.population)} />
          <div className="flex justify-between gap-4">
            <span className="text-text-secondary">Risk</span>
            <span className="font-medium">{cell.risk}</span>
          </div>
        </div>
      )}
    </div>
  )
}
