import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { ScientificBadge } from '../common/Badge'
import { queryCopilot } from '../../services/copilotService'
import { KM_PER_DEG_LAT } from '../../utils/geo'
import { cn } from '../../utils/cn'
import type { CopilotMessage } from '../../types'

export type DetectScenario = 'now' | 'windShift' | 'contain' | 'grap'

export const DETECT_SCENARIOS: { id: DetectScenario; label: string }[] = [
  { id: 'now', label: 'Now' },
  { id: 'windShift', label: 'Wind +28°' },
  { id: 'contain', label: 'Contain fires' },
  { id: 'grap', label: 'GRAP NCR' },
]

interface NamedPoint {
  name: string
  lat: number
  lon: number
}

/** Rotate a point around origin by degrees (east-north plane). PREDICTED geometry only. */
export function rotateAround(
  origin: { lat: number; lon: number },
  point: { lat: number; lon: number },
  deg: number,
): { lat: number; lon: number } {
  const theta = (deg * Math.PI) / 180
  const lonScale = KM_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180)
  const east = (point.lon - origin.lon) * lonScale
  const north = (point.lat - origin.lat) * KM_PER_DEG_LAT
  const eastR = east * Math.cos(theta) - north * Math.sin(theta)
  const northR = east * Math.sin(theta) + north * Math.cos(theta)
  return {
    lat: origin.lat + northR / KM_PER_DEG_LAT,
    lon: origin.lon + eastR / lonScale,
  }
}

export function applyDetectScenario(
  origin: { lat: number; lon: number },
  dest: NamedPoint,
  scenario: DetectScenario,
): NamedPoint {
  if (scenario === 'windShift') {
    const rotated = rotateAround(origin, dest, 28)
    return { name: 'Shifted intercept', lat: rotated.lat, lon: rotated.lon }
  }
  if (scenario === 'contain') {
    return {
      name: 'Contained front',
      lat: origin.lat + (dest.lat - origin.lat) * 0.42,
      lon: origin.lon + (dest.lon - origin.lon) * 0.42,
    }
  }
  return dest
}

export function scenarioRibbonKm(scenario: DetectScenario): number {
  if (scenario === 'contain') return 9
  if (scenario === 'windShift') return 14
  return 16
}

export function scenarioCaption(scenario: DetectScenario, towardNcr: boolean): string {
  if (scenario === 'windShift') return 'Predicted · wind-shift intercept'
  if (scenario === 'contain') return 'Predicted · contained release'
  if (scenario === 'grap') return 'Recommended · GRAP Stage III NCR'
  return towardNcr ? 'Predicted · toward Delhi NCR' : 'Predicted · downwind advection'
}

export function scenarioNote(scenario: DetectScenario): string {
  if (scenario === 'windShift') {
    return 'What-if: transport bearing +28°. Geometry only — not a new model run.'
  }
  if (scenario === 'contain') {
    return 'What-if: source intensity cut. Plume does not claim the fires are extinguished.'
  }
  if (scenario === 'grap') {
    return 'Recommended operational overlay for NCR. Not an issued government order.'
  }
  return 'Baseline predicted advection from the current wind field.'
}

export function DetectDecisionLab({
  scenario,
  onScenario,
  className,
}: {
  scenario: DetectScenario
  onScenario: (next: DetectScenario) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState<CopilotMessage | null>(null)

  const explain = async () => {
    setOpen(true)
    if (answer || loading) return
    setLoading(true)
    try {
      const response = await queryCopilot('Where is the current plume moving?')
      setAnswer(response)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={cn('pointer-events-auto flex max-w-xl flex-col gap-2', className)}>
      <div className="rounded-lg border border-border bg-bg-panel/90 p-2 backdrop-blur">
        <p className="px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
          Decision lab · predicted scenarios
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {DETECT_SCENARIOS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onScenario(item.id)}
              aria-pressed={scenario === item.id}
              className={cn(
                'rounded px-2 py-1 text-[11px] transition-colors',
                scenario === item.id
                  ? 'bg-intel/20 text-intel'
                  : 'text-text-muted hover:text-text-secondary',
              )}
            >
              {item.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void explain()}
            className="inline-flex items-center gap-1 rounded border border-intel/30 bg-intel/10 px-2 py-1 text-[11px] text-intel hover:bg-intel/20"
          >
            <Sparkles className="h-3 w-3" />
            Explain
          </button>
        </div>
        <p className="mt-1.5 px-1 text-[10px] leading-snug text-text-muted">{scenarioNote(scenario)}</p>
      </div>

      {open ? (
        <div className="max-h-48 overflow-auto rounded-lg border border-intel/25 bg-bg-panel/95 p-3 backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <ScientificBadge label="PREDICTED" />
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                ML numbers · Copilot explains
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-text-muted hover:text-text-secondary"
            >
              Close
            </button>
          </div>
          {loading ? (
            <p className="text-xs text-text-muted">Retrieving evidence…</p>
          ) : (
            <p className="whitespace-pre-line text-xs text-text-secondary">{answer?.content}</p>
          )}
          {answer?.citations ? (
            <div className="mt-2 flex flex-wrap gap-2 border-t border-border pt-2">
              {answer.citations.map((c) => (
                <span key={c.source} className="font-mono text-[10px] text-intel">
                  {c.source} · {c.time}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
