import { cn } from '../../utils/cn'
import type { BasemapFlavor } from './mapAtmosphere'

export type MapScene = 'globe' | 'corridor'

interface MapViewControlsProps {
  scene: MapScene
  onSceneChange: (scene: MapScene) => void
  basemap: BasemapFlavor
  onBasemapChange: (flavor: BasemapFlavor) => void
  dayNight: boolean
  onDayNightChange: (on: boolean) => void
  dimension3d: boolean
  onDimension3dChange: (on: boolean) => void
  showOrbit: boolean
  onShowOrbitChange: (on: boolean) => void
  className?: string
}

const chip =
  'rounded px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors'

export function MapViewControls({
  scene,
  onSceneChange,
  basemap,
  onBasemapChange,
  dayNight,
  onDayNightChange,
  dimension3d,
  onDimension3dChange,
  showOrbit,
  onShowOrbitChange,
  className,
}: MapViewControlsProps) {
  return (
    <div
      className={cn(
        'pointer-events-auto absolute bottom-28 left-4 z-20 w-52 rounded-lg border border-cyan-500/20 bg-bg-panel/88 p-3 backdrop-blur-md shadow-[0_0_24px_rgba(34,211,238,0.08)]',
        className,
      )}
    >
      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-cyan-400/90">
        Display
      </p>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          className={cn(
            chip,
            scene === 'globe'
              ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onSceneChange('globe')}
        >
          Globe
        </button>
        <button
          type="button"
          className={cn(
            chip,
            scene === 'corridor'
              ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onSceneChange('corridor')}
        >
          Corridor
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1 border-t border-border/80 pt-2">
        <button
          type="button"
          className={cn(
            chip,
            basemap === 'intel'
              ? 'bg-slate-700/50 text-text-primary ring-1 ring-border'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onBasemapChange('intel')}
        >
          Map
        </button>
        <button
          type="button"
          className={cn(
            chip,
            basemap === 'satellite'
              ? 'bg-slate-700/50 text-text-primary ring-1 ring-border'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onBasemapChange('satellite')}
        >
          Sat
        </button>
        <button
          type="button"
          className={cn(
            chip,
            dimension3d
              ? 'bg-slate-700/50 text-text-primary ring-1 ring-border'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onDimension3dChange(!dimension3d)}
        >
          3D
        </button>
        <button
          type="button"
          className={cn(
            chip,
            !dimension3d
              ? 'bg-slate-700/50 text-text-primary ring-1 ring-border'
              : 'text-text-muted hover:text-text-secondary',
          )}
          onClick={() => onDimension3dChange(false)}
        >
          2D
        </button>
      </div>

      <label className="mt-2 flex cursor-pointer items-center justify-between gap-2 border-t border-border/80 pt-2 text-[11px] text-text-secondary">
        <span>Day / night cycle</span>
        <input
          type="checkbox"
          checked={dayNight}
          onChange={(e) => onDayNightChange(e.target.checked)}
          className="accent-cyan-400"
        />
      </label>
      <label className="mt-1.5 flex cursor-pointer items-center justify-between gap-2 text-[11px] text-text-secondary">
        <span>Orbital shell</span>
        <input
          type="checkbox"
          checked={showOrbit}
          onChange={(e) => onShowOrbitChange(e.target.checked)}
          className="accent-cyan-400"
        />
      </label>
    </div>
  )
}
