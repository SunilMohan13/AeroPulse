import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { KpiStat } from '../components/common/KpiStat'
import { EmptyState, LoadingState } from '../components/common/States'
import { AeroMap } from '../components/map/AeroMap'
import { EventDetectMap } from '../components/events/EventDetectMap'
import { DetectWorkspace } from '../components/events/DetectWorkspace'
import { SceneToggle } from '../components/layout/SceneToggle'
import { fetchEvents } from '../services/eventService'
import { fetchEvidence } from '../services/evidenceService'
import { fetchTotalExposure } from '../services/riskService'
import { pickHeroEvent } from '../utils/heroEvent'
import { getBandLabel } from '../utils/aqi'
import { useDataMode } from '../context/DataModeContext'
import { FallbackBanner, ModeContextNote } from '../components/common/Provenance'

export function Overview() {
  const { mode } = useDataMode()
  const [searchParams] = useSearchParams()
  const view = searchParams.get('view') === 'globe' ? 'globe' : 'detect'

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', mode],
    queryFn: fetchEvents,
  })
  const { data: totalExposure } = useQuery({
    queryKey: ['totalExposure', mode],
    queryFn: fetchTotalExposure,
  })
  const hero = pickHeroEvent(events)
  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence', hero?.id, mode],
    queryFn: () => fetchEvidence(hero!.id),
    enabled: Boolean(hero?.id),
  })

  const activeCount = events.filter((e) => e.status === 'ACTIVE').length
  const exposureKnown = totalExposure !== null && totalExposure !== undefined

  if (eventsLoading) return <LoadingState message="Loading command overview..." />

  const map =
    view === 'globe' ? (
      <AeroMap
        compact
        embedded
        showTimeline={false}
        showGlobeBar={false}
        showControls={false}
        showLegend={false}
        initialScene="globe"
        sceneRequest="globe"
        className="h-full"
      />
    ) : hero ? (
      <EventDetectMap event={hero} evidence={evidence} />
    ) : null

  return (
    <div className="flex h-full min-h-0 flex-col bg-black">
      <div className="shrink-0 border-b border-cyan-500/20 bg-gradient-to-r from-black via-bg-panel/40 to-black px-4 py-2">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300/95">
              Air quality overview
            </h1>
            <p className="text-[11px] text-text-muted">
              {view === 'globe'
                ? 'Globe · world context · same evidence, likelihood, and confidence'
                : 'Detect · fire radar · evidence arcs · source likelihood'}
            </p>
            <ModeContextNote className="pt-1 text-[11px]" />
          </div>
          <SceneToggle
            items={[
              { to: '/', label: 'Detect', active: view === 'detect' },
              { to: '/?view=globe', label: 'Globe', active: view === 'globe' },
            ]}
          />
        </div>
        <FallbackBanner />
      </div>

      <KpiStrip
        aqi={hero && !hero.provenance?.unavailable?.includes('pm25') ? hero.aqi : undefined}
        pm25={hero && !hero.provenance?.unavailable?.includes('pm25') ? hero.pm25 : undefined}
        activeCount={activeCount}
        totalExposure={exposureKnown ? (totalExposure as number) : null}
      />

      {hero && map ? (
        <DetectWorkspace event={hero} evidence={evidence} map={map} />
      ) : view === 'globe' ? (
        <div className="relative min-h-0 flex-1">
          <AeroMap
            compact
            showTimeline={false}
            showGlobeBar
            initialScene="globe"
            sceneRequest="globe"
            className="h-full"
          />
        </div>
      ) : (
        <EmptyState
          title="No live events"
          description="Detect needs a fused event. Switch to Globe for world context, or Demo for the Punjab episode."
        />
      )}
    </div>
  )
}

function KpiStrip({
  aqi,
  pm25,
  activeCount,
  totalExposure,
}: {
  aqi: number | undefined
  pm25: number | undefined
  activeCount: number
  totalExposure: number | null
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="grid shrink-0 grid-cols-2 border-b border-border lg:grid-cols-4"
    >
      <div className="border-b border-border px-4 py-2.5 lg:border-b-0 lg:border-r">
        {aqi != null && pm25 != null ? (
          <KpiStat
            label="AQI"
            value={aqi}
            sublabel={getBandLabel(pm25)}
            className="[&_span.font-mono]:text-2xl"
          />
        ) : (
          <MutedKpi label="AQI" />
        )}
      </div>
      <div className="border-b border-border px-4 py-2.5 lg:border-b-0 lg:border-r">
        {pm25 != null ? (
          <KpiStat
            label="PM2.5"
            value={pm25}
            unit="µg/m³"
            trend="up"
            className="[&_span.font-mono]:text-2xl"
          />
        ) : (
          <MutedKpi label="PM2.5" />
        )}
      </div>
      <div className="border-b border-border px-4 py-2.5 lg:border-b-0 lg:border-r">
        <KpiStat label="Active Events" value={activeCount} className="[&_span.font-mono]:text-2xl" />
      </div>
      <div className="px-4 py-2.5">
        {totalExposure != null ? (
          <KpiStat
            label="At Risk"
            value={Math.round(totalExposure / 100_000) / 10}
            unit="M people"
            decimals={1}
            className="[&_span.font-mono]:text-2xl"
          />
        ) : (
          <div title="No population cells were returned, so exposure cannot be summed.">
            <MutedKpi label="At Risk" />
          </div>
        )}
      </div>
    </motion.div>
  )
}

function MutedKpi({ label }: { label: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="font-mono text-2xl font-bold text-text-muted">&mdash;</p>
    </div>
  )
}
