import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Flame, Cloud, Factory } from 'lucide-react'
import { KpiStat } from '../components/common/KpiStat'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { StatusBadge, ScientificBadge } from '../components/common/Badge'
import { EmptyState } from '../components/common/States'
import { AeroMap } from '../components/map/AeroMap'
import { fetchEvents } from '../services/eventService'
import { fetchTotalExposure } from '../services/riskService'
import { fetchForecast } from '../services/forecastService'
import { fetchSources } from '../services/sourceService'
import { formatFreshness } from '../utils/format'
import { getBandLabel } from '../utils/aqi'
import { HERO_EVENT_ID } from '../data/mockEvents'
import { useDataMode } from '../context/DataModeContext'
import { FallbackBanner, ModeContextNote } from '../components/common/Provenance'

export function Overview() {
  const { mode } = useDataMode()
  const { data: events = [] } = useQuery({ queryKey: ['events', mode], queryFn: fetchEvents })
  const { data: forecast = [] } = useQuery({
    queryKey: ['forecast', mode],
    queryFn: () => fetchForecast(),
  })
  const { data: sources = [] } = useQuery({ queryKey: ['sources', mode], queryFn: fetchSources })
  const { data: totalExposure } = useQuery({
    queryKey: ['totalExposure', mode],
    queryFn: fetchTotalExposure,
  })

  const hero = events.find((e) => e.id === HERO_EVENT_ID) ?? events[0]
  const activeCount = events.filter((e) => e.status === 'ACTIVE').length
  // Null means the API cannot supply a headcount, which is different from
  // zero people being at risk. Rendering 0.0M would be a false claim, so the
  // tile shows an explicit dash instead.
  const exposureKnown = totalExposure !== null && totalExposure !== undefined

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-1"
      >
        <h1 className="text-xl font-semibold tracking-tight">Air Quality Overview</h1>
        <p className="text-sm text-text-secondary">Punjab–Haryana–Delhi NCR</p>
        <ModeContextNote className="pt-1" />
      </motion.div>

      <FallbackBanner />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        <Card>
          <CardBody>
            <KpiStat label="AQI" value={hero?.aqi ?? 290} sublabel={getBandLabel(hero?.pm25 ?? 185)} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <KpiStat label="PM2.5" value={hero?.pm25 ?? 185} unit="µg/m³" trend="up" />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <KpiStat label="Active Events" value={activeCount} sublabel={`↑ ${activeCount}`} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            {exposureKnown ? (
              <KpiStat
                label="At Risk"
                value={Math.round((totalExposure as number) / 100_000) / 10}
                unit="M people"
                sublabel="population exposure"
                decimals={1}
              />
            ) : (
              <div title="No population cells were returned, so exposure cannot be summed.">
                <p className="text-xs text-text-muted">At Risk</p>
                <p className="font-mono text-3xl font-bold text-text-muted">&mdash;</p>
                <p className="text-[10px] text-amber-400/80">no population cells returned</p>
              </div>
            )}
          </CardBody>
        </Card>
      </motion.div>

      <Card className="min-h-[320px] flex-1 overflow-hidden">
        <CardHeader className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Live Intelligence Map</span>
          <Link
            to="/map"
            className="text-xs text-intel hover:underline"
          >
            Open full map
          </Link>
        </CardHeader>
        <CardBody className="h-[340px] p-0">
          <AeroMap
            compact
            showTimeline={false}
            showGlobeBar
            initialScene="globe"
            className="h-full"
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Active Events</span>
          </CardHeader>
          <CardBody className="space-y-2">
            {events.length === 0 && (
              <EmptyState
                title="No active pollution events"
                description="Environmental conditions are currently within normal operating ranges."
              />
            )}
            {events.slice(0, 3).map((event) => (
              <Link
                key={event.id}
                to={`/events/${event.id}`}
                className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:border-intel/30 hover:bg-bg-elevated"
              >
                {event.type === 'biomass' ? (
                  <Flame className="h-4 w-4 text-fire" />
                ) : event.type === 'industrial' ? (
                  <Factory className="h-4 w-4 text-text-muted" />
                ) : (
                  <Cloud className="h-4 w-4 text-text-muted" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-text-muted">{event.region}</p>
                </div>
                <StatusBadge variant={event.severity === 'SEVERE' ? 'severe' : 'warning'}>
                  {event.severity}
                </StatusBadge>
              </Link>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Forecast</span>
            <ScientificBadge label="PREDICTED" />
          </CardHeader>
          <CardBody>
            <div className="space-y-2">
              {forecast.slice(0, 4).map((f) => (
                <div key={f.hour} className="flex justify-between text-sm">
                  <span className="text-text-secondary">{f.hour === 0 ? 'Now' : `${f.hour}h`}</span>
                  <span className="font-mono font-medium">{f.pm25} µg/m³</span>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <span className="text-sm font-medium">Source Health</span>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {sources.map((s) => (
              <div key={s.id} className="rounded border border-border p-2 text-center">
                <p className="text-xs font-medium">{s.name}</p>
                <p className="text-[10px] text-text-muted">
                  {s.status} · {formatFreshness(s.freshnessMinutes)}
                </p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
