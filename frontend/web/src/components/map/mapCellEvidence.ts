import type { GridCell, ScientificLabel } from '../../types'
import { getBandLabel } from '../../utils/aqi'
import { distanceKm, PUNJAB_FIRE_CENTER } from '../../utils/geo'

export interface CellEvidenceLine {
  source: string
  text: string
  label: ScientificLabel
}

export function evidenceForCell(cell: GridCell, hourOffset: number): CellEvidenceLine[] {
  const distFire = distanceKm(cell.lat, cell.lon, PUNJAB_FIRE_CENTER.lat, PUNJAB_FIRE_CENTER.lon)
  const lines: CellEvidenceLine[] = [
    {
      source: 'CPCB',
      text: `Ground PM2.5 ${cell.pm25} µg/m³ · ${getBandLabel(cell.pm25)} band`,
      label: 'OBSERVED',
    },
  ]
  if (cell.plume > 10) {
    lines.push({
      source: 'FIRMS + transport model',
      text: `Smoke field strength ${Math.round(cell.plume)} · aligned with +${hourOffset}h horizon`,
      label: hourOffset > 0 ? 'PREDICTED' : 'INFERRED',
    })
  }
  if (distFire < 120) {
    lines.push({
      source: 'NASA FIRMS',
      text: `${Math.round(distFire)} km from Punjab thermal cluster`,
      label: 'OBSERVED',
    })
  }
  lines.push({
    source: 'IMD',
    text: 'NW transport corridor winds supporting advection toward NCR',
    label: 'OBSERVED',
  })
  if (cell.population > 5000) {
    lines.push({
      source: 'Exposure model',
      text: `${cell.population.toLocaleString()} people in 1 km cell · risk ${cell.risk}`,
      label: 'INFERRED',
    })
  }
  return lines
}

export function copilotQuestionForCell(cell: GridCell): string {
  return `What evidence explains PM2.5 ${cell.pm25} µg/m³ near ${cell.lat.toFixed(2)}°N, ${cell.lon.toFixed(2)}°E including fire and transport signals?`
}
