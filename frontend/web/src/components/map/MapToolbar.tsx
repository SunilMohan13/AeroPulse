import { Crosshair, Maximize2, Minimize2, Minus, Plus } from 'lucide-react'

interface MapToolbarProps {
  zoom: number
  minZoom: number
  maxZoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  expanded: boolean
  onToggleExpand: () => void
}

const button =
  'flex h-8 w-8 items-center justify-center text-text-secondary transition-colors ' +
  'hover:bg-bg-elevated hover:text-intel disabled:cursor-not-allowed disabled:opacity-35 ' +
  'disabled:hover:bg-transparent disabled:hover:text-text-secondary'

export function MapToolbar({
  zoom,
  minZoom,
  maxZoom,
  onZoomIn,
  onZoomOut,
  onReset,
  expanded,
  onToggleExpand,
}: MapToolbarProps) {
  return (
    <div className="absolute right-4 top-4 z-20 flex flex-col items-end gap-2">
      <div className="flex flex-col overflow-hidden rounded-md border border-border bg-bg-panel/90 backdrop-blur">
        <button
          type="button"
          onClick={onZoomIn}
          disabled={zoom >= maxZoom}
          className={button}
          title="Zoom in"
          aria-label="Zoom in"
        >
          <Plus size={15} />
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          onClick={onZoomOut}
          disabled={zoom <= minZoom}
          className={button}
          title="Zoom out"
          aria-label="Zoom out"
        >
          <Minus size={15} />
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          onClick={onReset}
          className={button}
          title="Reset view"
          aria-label="Reset view to the Punjab–Haryana–Delhi corridor"
        >
          <Crosshair size={14} />
        </button>
        <div className="h-px bg-border" />
        <button
          type="button"
          onClick={onToggleExpand}
          className={button}
          title={expanded ? 'Exit full screen (Esc)' : 'Full screen'}
          aria-label={expanded ? 'Exit full screen' : 'Expand map to full screen'}
          aria-pressed={expanded}
        >
          {expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
      </div>
      <span className="rounded border border-border bg-bg-panel/80 px-1.5 py-0.5 font-mono text-[10px] text-text-muted backdrop-blur">
        z{zoom.toFixed(1)}
      </span>
    </div>
  )
}
