import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AeroMap } from '../components/map/AeroMap'
import { EventDetectMap } from '../components/events/EventDetectMap'
import { DetectWorkspace } from '../components/events/DetectWorkspace'
import { SceneToggle } from '../components/layout/SceneToggle'
import { useDataMode } from '../context/DataModeContext'
import { fetchEvents } from '../services/eventService'
import { fetchEvidence } from '../services/evidenceService'
import { pickHeroEvent } from '../utils/heroEvent'
import { FallbackBanner } from '../components/common/Provenance'
import { EmptyState, LoadingState } from '../components/common/States'

export function LiveMap() {
  const { mode } = useDataMode()
  const [searchParams] = useSearchParams()
  const sceneParam = searchParams.get('scene')
  const sceneRequest =
    sceneParam === 'corridor' || sceneParam === 'globe' ? sceneParam : undefined
  const globe = sceneRequest === 'globe'
  const operational = sceneRequest === 'corridor'

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['events', mode],
    queryFn: fetchEvents,
  })
  const hero = pickHeroEvent(events)
  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence', hero?.id, mode],
    queryFn: () => fetchEvidence(hero!.id),
    enabled: Boolean(hero?.id) && !globe && !operational,
  })

  if (isLoading) return <LoadingState message="Loading live map..." />

  if (globe || operational) {
    return (
      <div className="flex h-full flex-col bg-black">
        <MapHeader mode={mode} view={globe ? 'globe' : 'corridor'} />
        <div className="relative min-h-0 flex-1">
          <AeroMap
            initialScene={globe ? 'globe' : 'corridor'}
            sceneRequest={globe ? 'globe' : 'corridor'}
          />
        </div>
      </div>
    )
  }

  if (!hero) {
    return (
      <div className="flex h-full flex-col bg-black">
        <MapHeader mode={mode} view="detect" />
        <EmptyState
          title="No live events"
          description="The Detect workspace needs a fused event. Switch to Demo, or open Globe for world context."
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <MapHeader mode={mode} view="detect" />
      <DetectWorkspace
        event={hero}
        evidence={evidence}
        map={<EventDetectMap event={hero} evidence={evidence} />}
      />
    </div>
  )
}

function MapHeader({
  mode,
  view,
}: {
  mode: string
  view: 'detect' | 'corridor' | 'globe'
}) {
  const isDetect = view === 'detect'
  const isGlobe = view === 'globe'
  return (
    <div className="shrink-0 border-b border-cyan-500/20 bg-gradient-to-r from-black via-bg-panel/40 to-black px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300/95">
            Live command map
          </h1>
          <p className="text-[11px] text-text-muted">
            {isDetect
              ? 'Detect workspace · fire radar · evidence arcs · source likelihood'
              : isGlobe
                ? 'Globe · world context'
                : 'Corridor · pollution grid, fires, wind, plume'}
          </p>
          <p className="text-[11px]">
            {mode === 'demo' ? (
              <span className="text-intel">Demo · scripted Punjab episode.</span>
            ) : (
              <span className="text-emerald-300">Live · fused event from GET /api/v1/events.</span>
            )}
          </p>
        </div>
        <SceneToggle
          items={[
            { to: '/map', label: 'Detect', active: isDetect },
            { to: '/map?scene=corridor', label: 'Layers', active: view === 'corridor' },
            { to: '/map?scene=globe', label: 'Globe', active: isGlobe },
          ]}
        />
      </div>
      <FallbackBanner />
    </div>
  )
}
