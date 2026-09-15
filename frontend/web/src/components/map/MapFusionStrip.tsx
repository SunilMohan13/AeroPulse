import { useQuery } from '@tanstack/react-query'
import { fetchSources } from '../../services/sourceService'
import { formatFreshness } from '../../utils/format'
import { cn } from '../../utils/cn'

interface MapFusionStripProps {
  className?: string
}

/** Live-style connector freshness + fusion agreement for the map chrome. */
export function MapFusionStrip({ className }: MapFusionStripProps) {
  const { data: sources = [] } = useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
    staleTime: 15_000,
  })

  const healthy = sources.filter((s) => s.status === 'Healthy' || s.status === 'Delayed').length
  const agreeing = Math.min(healthy, 4)

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-[22] flex justify-center px-2 pt-2 sm:pt-3',
        className,
      )}
    >
      <div
        className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-cyan-500/20 bg-black/70 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wide text-cyan-100/90 backdrop-blur-md sm:text-[10px]"
        aria-live="polite"
      >
        <span className="text-emerald-400/95">
          Fusion {agreeing}/{sources.length || 6} agree · transport signal
        </span>
        <span className="hidden text-border sm:inline">|</span>
        {sources.slice(0, 5).map((s) => (
          <span key={s.id} className="text-text-muted">
            <span
              className={
                s.status === 'Healthy' || s.status === 'Delayed'
                  ? 'text-emerald-400/90'
                  : 'text-amber-400/90'
              }
            >
              {s.name}
            </span>
            {' '}
            {formatFreshness(s.freshnessMinutes)}
          </span>
        ))}
      </div>
    </div>
  )
}
