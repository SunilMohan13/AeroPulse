import { useSearchParams } from 'react-router-dom'
import { AeroMap } from '../components/map/AeroMap'
import { useDataMode } from '../context/DataModeContext'

export function LiveMap() {
  const { mode } = useDataMode()
  const [searchParams] = useSearchParams()
  const sceneParam = searchParams.get('scene')
  const sceneRequest =
    sceneParam === 'corridor' || sceneParam === 'globe' ? sceneParam : undefined
  return (
    <div className="flex h-full flex-col bg-black">
      <div className="border-b border-cyan-500/20 bg-gradient-to-r from-black via-bg-panel/40 to-black px-4 py-2">
        <h1 className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300/95">
          Live command map
        </h1>
        <p className="text-[11px] text-text-muted">
          Globe for world context · Corridor for Punjab plume and layers
        </p>
        <p className="text-[11px]">
          {mode === 'demo' ? (
            <span className="text-intel">
              Demo · scripted episode. The timeline scrubs through the narrative.
            </span>
          ) : (
            <span className="text-emerald-300">
              Live · latest persisted grid-hour. The API serves one snapshot, so the timeline
              scrubber does not move live data.
            </span>
          )}
        </p>
      </div>
      <div className="relative min-h-0 flex-1">
        <AeroMap initialScene={sceneRequest ?? 'globe'} sceneRequest={sceneRequest} />
      </div>
    </div>
  )
}
