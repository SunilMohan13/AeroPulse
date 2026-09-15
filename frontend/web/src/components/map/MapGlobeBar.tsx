import { Globe2, Map as MapIcon } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { MapScene } from './MapViewControls'

interface MapGlobeBarProps {
  scene: MapScene
  onSceneChange: (scene: MapScene) => void
  bearing: number
  /** Smaller strip for dashboard preview cards (Overview). */
  compact?: boolean
  className?: string
}

const btn =
  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-all'

export function MapGlobeBar({
  scene,
  onSceneChange,
  bearing,
  compact = false,
  className,
}: MapGlobeBarProps) {
  return (
    <div
      className={cn(
        'pointer-events-auto absolute left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-2',
        compact ? 'bottom-2' : 'bottom-28',
        className,
      )}
    >
      <div
        className={cn(
          'flex items-center gap-1 rounded-lg border border-cyan-500/25 bg-bg-panel/92 shadow-[0_0_28px_rgba(34,211,238,0.12)] backdrop-blur-md',
          compact ? 'p-0.5' : 'p-1',
        )}
        role="group"
        aria-label="Map view mode"
      >
        <button
          type="button"
          className={cn(
            btn,
            scene === 'globe'
              ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/50'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onSceneChange('globe')}
        >
          <Globe2 size={14} aria-hidden />
          Globe
        </button>
        <button
          type="button"
          className={cn(
            btn,
            scene === 'corridor'
              ? 'bg-cyan-500/25 text-cyan-200 ring-1 ring-cyan-400/50'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onSceneChange('corridor')}
        >
          <MapIcon size={14} aria-hidden />
          Corridor
        </button>
      </div>
      {scene === 'globe' && (
        <p
          className={cn(
            'rounded border border-border/60 bg-black/50 px-2 py-0.5 text-center font-mono text-cyan-300/90 backdrop-blur',
            compact ? 'max-w-[220px] text-[9px] leading-tight' : 'text-[10px]',
          )}
        >
          {compact
            ? 'Drag to rotate · Tap Corridor for Punjab data'
            : `Drag to rotate · Scroll to zoom · Bearing ${bearing.toFixed(0)}° · Corridor for Punjab plume`}
        </p>
      )}
    </div>
  )
}
