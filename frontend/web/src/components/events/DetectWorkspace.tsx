import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Camera,
  Flame,
  Search,
  Satellite,
  Sparkles,
  Wind,
} from 'lucide-react'
import { StatusBadge } from '../common/Badge'
import { ConfidenceMeters } from './ConfidenceMeters'
import { SourceLikelihoodBars } from './SourceLikelihoodBars'
import { getBandLabel } from '../../utils/aqi'
import type { EvidenceItem, PollutionEvent } from '../../types'
import { cn } from '../../utils/cn'

const CATEGORY_ICON: Record<string, typeof Flame> = {
  Fire: Flame,
  CPCB: Activity,
  Satellite: Satellite,
  Weather: Wind,
  Citizen: Camera,
}

function MiniBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-text-muted">{label}</span>
        <span className="font-mono text-text-secondary">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-emerald-400"
          style={{ width: `${Math.min(value, 100)}%` }}
        />
      </div>
    </div>
  )
}

/** Three-column Detect chrome: evidence · map · likelihood. Shared by Events, Overview, and Live Map. */
export function DetectWorkspace({
  event,
  evidence,
  map,
  metersOffsetClass,
  detailTo,
}: {
  event: PollutionEvent
  evidence: EvidenceItem[]
  map: ReactNode
  /** Extra bottom padding so meters sit above a timeline (Live Map). */
  metersOffsetClass?: string
  detailTo?: { href: string; label: string }
}) {
  const [query, setQuery] = useState('')
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return evidence
    return evidence.filter(
      (item) =>
        item.category.toLowerCase().includes(q) ||
        item.source.toLowerCase().includes(q) ||
        item.observation.toLowerCase().includes(q),
    )
  }, [evidence, query])

  const selected = evidence.find((item) => item.id === selectedEvidenceId) ?? filtered[0]

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[240px_minmax(0,1fr)_272px]">
      <EvidenceRail
        items={filtered}
        selectedId={selected?.id ?? null}
        query={query}
        onQuery={setQuery}
        onSelect={setSelectedEvidenceId}
      />

      <div className="relative min-h-[420px] border-x border-border/80">
        {map}
        <div
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-0 z-10',
            metersOffsetClass,
          )}
        >
          <ConfidenceMeters
            items={[
              { label: 'Detection', value: event.detectionConfidence },
              { label: 'Source', value: event.sourceConfidence },
              { label: 'Forecast', value: event.forecastConfidence },
              { label: 'Impact', value: event.impactConfidence },
            ]}
          />
        </div>
      </div>

      <EventIntelPanel event={event} selected={selected} detailTo={detailTo} />
    </div>
  )
}

function EvidenceRail({
  items,
  selectedId,
  query,
  onQuery,
  onSelect,
}: {
  items: EvidenceItem[]
  selectedId: string | null
  query: string
  onQuery: (value: string) => void
  onSelect: (id: string) => void
}) {
  return (
    <aside className="flex min-h-0 flex-col border-border bg-bg-panel/30">
      <div className="border-b border-border px-3 py-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-secondary">
          Evidence
        </p>
        <label className="mt-2 flex items-center gap-2 rounded border border-border bg-bg-base/60 px-2 py-1">
          <Search className="h-3.5 w-3.5 text-text-muted" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search evidence"
            className="w-full bg-transparent text-xs text-text-primary outline-none placeholder:text-text-muted"
          />
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-auto">
        {items.map((item) => {
          const Icon = CATEGORY_ICON[item.category] ?? Activity
          const active = item.id === selectedId
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={cn(
                  'flex w-full items-start gap-2 border-b border-border/60 px-3 py-2.5 text-left hover:bg-white/5',
                  active && 'bg-intel/10',
                )}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-text-primary">
                    {item.source}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                    {item.observation}
                  </span>
                  <span className="mt-0.5 block font-mono text-[10px] text-text-muted">
                    {item.strength} · {item.confidence}%
                  </span>
                </span>
              </button>
            </li>
          )
        })}
        {items.length === 0 ? (
          <li className="px-3 py-6 text-xs text-text-muted">No evidence matches.</li>
        ) : null}
      </ul>
    </aside>
  )
}

function EventIntelPanel({
  event,
  selected,
  detailTo,
}: {
  event: PollutionEvent
  selected: EvidenceItem | undefined
  detailTo?: { href: string; label: string }
}) {
  const link = detailTo ?? { href: `/events/${event.id}`, label: 'Event →' }
  return (
    <aside className="flex min-h-0 flex-col overflow-auto border-border bg-bg-panel/40">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
              Event {event.id}
            </p>
            <p className="mt-1 text-sm font-medium text-text-primary">{event.title}</p>
          </div>
          <StatusBadge variant="live">{event.status}</StatusBadge>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">
          {event.pm25} µg/m³ PM2.5 · {getBandLabel(event.pm25)}
        </p>
      </div>

      <div className="space-y-3 border-b border-border px-4 py-3">
        <MiniBar label="Confidence" value={event.detectionConfidence} />
        <MiniBar label="Source" value={event.sourceConfidence} />
        <MiniBar label="Forecast" value={event.forecastConfidence} />
      </div>

      <div className="border-b border-border px-4 py-3">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-secondary">
          Source likelihood
        </p>
        <SourceLikelihoodBars items={event.sourceLikelihood} />
      </div>

      <div className="border-b border-border px-4 py-3">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-200/80">
          Predicted transport
        </p>
        <p className="mt-1 text-xs text-text-secondary">
          Traditional ML owns the numbers. Copilot only explains retrieved evidence. Likelihood is
          not causality.
        </p>
      </div>

      {selected ? (
        <div className="border-b border-border px-4 py-3">
          <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">Selected evidence</p>
          <p className="mt-1 text-sm font-medium">{selected.category}</p>
          <p className="mt-1 text-xs text-text-secondary">{selected.observation}</p>
          <p className="mt-1 font-mono text-[10px] text-text-muted">
            {selected.strength} · {selected.confidence}% · {selected.source}
          </p>
        </div>
      ) : null}

      <div className="mt-auto flex items-center justify-between px-4 py-3">
        <Link
          to="/copilot"
          className="inline-flex items-center gap-1.5 rounded-md border border-intel/30 bg-intel/10 px-2.5 py-1.5 text-xs text-intel hover:bg-intel/20"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Ask Copilot
        </Link>
        <Link to={link.href} className="text-xs text-text-muted hover:text-text-primary">
          {link.label}
        </Link>
      </div>
    </aside>
  )
}
