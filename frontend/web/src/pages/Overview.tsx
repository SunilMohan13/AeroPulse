import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { KpiStat } from '../components/common/KpiStat'
import { EmptyState, LoadingState } from '../components/common/States'
import { ScientificBadge, StatusBadge } from '../components/common/Badge'
import { AeroMap } from '../components/map/AeroMap'
import { fetchEvents } from '../services/eventService'
import { fetchTotalExposure } from '../services/riskService'
import { fetchForecastSeries } from '../services/forecastService'
import { fetchSources } from '../services/sourceService'
import { pickHeroEvent } from '../utils/heroEvent'
import { getBandLabel } from '../utils/aqi'
import { formatFreshness } from '../utils/format'
import { useDataMode } from '../context/DataModeContext'
import { FallbackBanner, ModeContextNote, ScreenJobNote } from '../components/common/Provenance'
import type { PollutionEvent } from '../types'

const FORECAST_HOURS = [1, 3, 6, 12]

export function Overview() {
  const { mode } = useDataMode()
  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['events', mode],
    queryFn: fetchEvents,
  })
  const { data: totalExposure } = useQuery({
    queryKey: ['totalExposure', mode],
    queryFn: fetchTotalExposure,
  })
  const { data: forecast = [] } = useQuery({
    queryKey: ['forecastSeries', mode],
    queryFn: () => fetchForecastSeries(),
  })
  const { data: sources = [] } = useQuery({
    queryKey: ['sources', mode],
    queryFn: fetchSources,
  })
  const hero = pickHeroEvent(events)
  const activeCount = events.filter((e) => e.status === 'ACTIVE').length
  const exposureKnown = totalExposure !== null && totalExposure !== undefined
  const topLikelihood = hero?.provenance?.unavailable?.includes('sourceLikelihood')
    ? undefined
    : hero?.sourceLikelihood[0]
  const likelihoodKnown = !hero?.provenance?.unavailable?.includes('sourceLikelihood')

  if (eventsLoading) return <LoadingState message="Loading command overview..." />

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-black">
      <div className="shrink-0 border-b border-cyan-500/20 bg-gradient-to-r from-black via-bg-panel/40 to-black px-4 py-2">
        <h1 className="font-mono text-xs uppercase tracking-[0.22em] text-cyan-300/95">
          Command overview
        </h1>
        <ScreenJobNote
          question="How bad is it, and how many events?"
          serves="catalog KPIs, event list, forecast peek, source freshness"
          notThis="the 1 km grid lab or a single-event Detect workspace"
        />
        <ModeContextNote className="pt-1 text-[11px]" />
        <FallbackBanner />
      </div>

      {hero ? (
        <div className="shrink-0 border-b border-border px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
            Situation
          </p>
          <p className="mt-1 text-sm text-text-primary">
            <span className="font-mono text-intel">{hero.id}</span> {hero.title} is{' '}
            <span className="font-medium">{hero.status}</span>
            {' · '}
            {hero.region}
          </p>
          <p className="mt-1 text-[11px] text-text-secondary">
            {likelihoodKnown && topLikelihood ? (
              <>
                Top likelihood {topLikelihood.source} {topLikelihood.probability}%
                <span className="text-text-muted"> — ranking, not proof of cause. </span>
              </>
            ) : (
              <span>Source likelihood is not on this screen. </span>
            )}
            Live Map shows every fire and 1 km cell. Events shows the evidence that fused this
            episode.
          </p>
          <Link
            to={`/events/${hero.id}`}
            className="mt-2 inline-flex items-center gap-1 text-xs text-intel hover:underline"
          >
            Investigate {hero.id}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}

      <KpiStrip
        aqi={hero && !hero.provenance?.unavailable?.includes('pm25') ? hero.aqi : undefined}
        pm25={hero && !hero.provenance?.unavailable?.includes('pm25') ? hero.pm25 : undefined}
        activeCount={activeCount}
        totalExposure={exposureKnown ? (totalExposure as number) : null}
      />

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
        <aside className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
              Event catalog
            </p>
            <p className="mt-1 text-[11px] text-text-secondary">
              {events.length} fused events · this list is not on Live Map
            </p>
          </div>
          {events.length === 0 ? (
            <EmptyState
              title="No live events"
              description="Switch to Demo for the Punjab episode, or wait for the API to fuse an event."
            />
          ) : (
            <ul className="min-h-0 flex-1 overflow-auto">
              {events.map((event) => (
                <li key={event.id}>
                  <EventRow event={event} featured={event.id === hero?.id} />
                </li>
              ))}
            </ul>
          )}
        </aside>

        <div className="flex min-h-0 flex-col">
          <div className="border-b border-border px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
                Forecast peek
              </p>
              <ScientificBadge label="PREDICTED" />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {FORECAST_HOURS.map((hour) => {
                const point = forecast.find((p) => p.hour === hour)
                return (
                  <div key={hour}>
                    <p className="font-mono text-[10px] text-text-muted">+{hour}h</p>
                    <p className="font-mono text-sm text-text-primary">
                      {point ? `${Math.round(point.pm25)}` : '—'}
                    </p>
                    <p className="text-[10px] text-text-muted">µg/m³</p>
                  </div>
                )
              })}
            </div>
            <Link to="/forecast" className="mt-2 inline-block text-[11px] text-intel hover:underline">
              Open forecast chart →
            </Link>
          </div>

          <div className="border-b border-border px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted">
              Source freshness
            </p>
            <ul className="mt-2 space-y-1">
              {sources.slice(0, 5).map((source) => (
                <li
                  key={source.id}
                  className="flex items-center justify-between gap-2 font-mono text-[11px]"
                >
                  <span className="text-text-secondary">{source.name}</span>
                  <span className="text-text-muted">
                    {source.status} · {formatFreshness(source.freshnessMinutes)}
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/sources" className="mt-2 inline-block text-[11px] text-intel hover:underline">
              Open source health →
            </Link>
          </div>
        </div>
      </div>

      <div className="relative h-48 shrink-0 border-t border-border">
        <AeroMap
          compact
          embedded
          showTimeline={false}
          showGlobeBar={false}
          showControls={false}
          showLegend={false}
          forceLayers={{
            pollution: true,
            fires: true,
            wind: false,
            forecast: false,
            industry: false,
            population: false,
          }}
          initialScene="corridor"
          sceneRequest="corridor"
          className="h-full"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3 py-2">
          <p className="rounded border border-white/10 bg-black/70 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted backdrop-blur">
            Locator · PM2.5 + fires only
          </p>
          <Link
            to="/map"
            className="pointer-events-auto rounded-md border border-cyan-500/30 bg-black/70 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-200 backdrop-blur hover:bg-black/85"
          >
            Open live map →
          </Link>
        </div>
      </div>
    </div>
  )
}

function EventRow({ event, featured }: { event: PollutionEvent; featured: boolean }) {
  const pmKnown = !event.provenance?.unavailable?.includes('pm25')
  return (
    <Link
      to={`/events/${event.id}`}
      className={`block border-b border-border/70 px-4 py-3 hover:bg-white/5 ${
        featured ? 'bg-intel/10' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] text-text-muted">{event.id}</p>
          <p className="mt-0.5 text-sm text-text-primary">{event.title}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">{event.region}</p>
        </div>
        <StatusBadge variant={event.severity === 'SEVERE' ? 'severe' : 'warning'}>
          {event.severity}
        </StatusBadge>
      </div>
      <p className="mt-1 font-mono text-[11px] text-text-secondary">
        {pmKnown ? `${event.pm25} µg/m³ · AQI ${event.aqi}` : 'PM2.5 —'}
        {' · '}
        {event.status}
      </p>
    </Link>
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
