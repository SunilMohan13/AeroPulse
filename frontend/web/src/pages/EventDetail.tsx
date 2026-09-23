import { useParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { fetchEvent, fetchEvents } from '../services/eventService'
import { fetchEvidence, fetchEventTimeline } from '../services/evidenceService'
import { fetchForecast, fetchObservedHistory } from '../services/forecastService'
import { Pm25Timeline } from '../components/charts/Pm25Timeline'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { ScientificBadge } from '../components/common/Badge'
import { EventDetectMap } from '../components/events/EventDetectMap'
import { DetectWorkspace } from '../components/events/DetectWorkspace'
import { EmptyState, LoadingState } from '../components/common/States'
import { pickHeroEvent } from '../utils/heroEvent'
import { formatDateTimeIST, formatPopulation } from '../utils/format'
import { ActionBrief } from '../components/events/ActionBrief'
import { CitizenCorroboration } from '../components/events/CitizenCorroboration'
import { useDataMode } from '../context/DataModeContext'
import { FallbackBanner, MaybeValue, ProvenanceBadge } from '../components/common/Provenance'

export function EventsIndex() {
  const { mode } = useDataMode()
  const { data: events, isLoading } = useQuery({
    queryKey: ['events', mode],
    queryFn: fetchEvents,
  })
  const hero = pickHeroEvent(events)
  if (isLoading) return <LoadingState message="Loading event intelligence..." />
  if (!hero) {
    return (
      <EmptyState
        title="No live events"
        description="The API has not fused a pollution event yet. Switch to Demo for the Punjab episode, or wait for the worker to persist observations."
      />
    )
  }
  return <Navigate to={`/events/${hero.id}`} replace />
}

export function EventDetail() {
  const { mode } = useDataMode()
  const { eventId } = useParams<{ eventId: string }>()

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['events', mode],
    queryFn: fetchEvents,
  })
  const listed = Boolean(eventId && events?.some((item) => item.id === eventId))
  const liveHero = pickHeroEvent(events)
  const queriesEnabled = Boolean(eventId) && (mode === 'demo' || listed)

  const { data: event, isLoading } = useQuery({
    queryKey: ['event', eventId, mode],
    queryFn: () => fetchEvent(eventId!),
    enabled: queriesEnabled,
  })
  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence', eventId, mode],
    queryFn: () => fetchEvidence(eventId!),
    enabled: queriesEnabled,
  })
  const { data: timeline = [] } = useQuery({
    queryKey: ['timeline', eventId, mode],
    queryFn: () => fetchEventTimeline(eventId!),
    enabled: queriesEnabled,
  })
  const { data: history = [] } = useQuery({
    queryKey: ['observedHistory', mode],
    queryFn: fetchObservedHistory,
  })
  const { data: forecast = [] } = useQuery({
    queryKey: ['forecast', eventId, mode],
    queryFn: () => fetchForecast(eventId),
    enabled: queriesEnabled,
  })

  if (mode === 'live' && eventsLoading) {
    return <LoadingState message="Loading event intelligence..." />
  }
  if (mode === 'live' && eventId && events && !listed) {
    if (liveHero) return <Navigate to={`/events/${liveHero.id}`} replace />
    return (
      <EmptyState
        title="Event not in live catalog"
        description={`${eventId} is not in the live event list. Open Events after the API has fused an episode, or switch to Demo.`}
      />
    )
  }

  if (isLoading || (queriesEnabled && event === undefined)) {
    return <LoadingState message="Loading event intelligence..." />
  }
  if (!event) return <div className="p-8">Event not found</div>

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-3 pt-2">
        <FallbackBanner />
      </div>

      <DetectWorkspace
        event={event}
        evidence={evidence}
        detailTo={{ href: '/forecast', label: 'Forecast →' }}
        map={<EventDetectMap event={event} evidence={evidence} />}
      />

      <details className="border-t border-border bg-bg-base">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-2 text-xs text-text-secondary hover:text-text-primary [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5" />
          Narrative, trajectory, and actions
        </summary>
        <div className="space-y-4 p-4">
          <ActionBrief event={event} />
          <CitizenCorroboration eventId={event.id} />

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <span className="text-sm font-medium">Event Timeline</span>
              </CardHeader>
              <CardBody>
                <div className="space-y-4">
                  {timeline.map((t, i) => (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className="flex gap-4 border-l-2 border-intel/40 pl-4"
                    >
                      <span className="font-mono text-sm text-intel">{t.time}</span>
                      <span className="text-sm">{t.label}</span>
                    </motion.div>
                  ))}
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <span className="text-sm font-medium">Observed Conditions</span>
                <ScientificBadge label="OBSERVED" />
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-text-muted">PM2.5</p>
                    <p className="font-mono text-xl font-bold">{event.pm25} µg/m³</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">AQI</p>
                    <p className="font-mono text-xl font-bold">{event.aqi}</p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Population at risk</p>
                    <p className="font-mono text-xl font-bold">
                      <MaybeValue
                        field="populationAtRisk"
                        unavailable={event.provenance?.unavailable}
                        reason="The API reports population density per km², never a headcount at risk."
                        value={formatPopulation(event.populationAtRisk)}
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Fire detections</p>
                    <p className="font-mono text-xl font-bold">{event.fireCount}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-medium">PM2.5 Trajectory</span>
              <div className="flex gap-2">
                <ScientificBadge label="OBSERVED" />
                <ScientificBadge label="PREDICTED" />
              </div>
            </CardHeader>
            <CardBody>
              <Pm25Timeline history={history} forecast={forecast} />
              <p className="mt-2 text-xs text-text-muted">
                Solid line is observed CPCB data. Dashed line is the model forecast; the gap between
                them widens with horizon.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <span className="text-sm font-medium">Recommended Actions</span>
              <ScientificBadge label="RECOMMENDED" />
              <ProvenanceBadge provenance={event.provenance} />
            </CardHeader>
            <CardBody>
              {event.recommendedActions.length > 0 ? (
                <ul className="space-y-2">
                  {event.recommendedActions.map((action, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-text-secondary">
                      <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-intel" />
                      {action}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                  No API route supplies recommended actions for an event, so none are shown. The demo
                  narrative carries an authored action list; showing it here while reading live data
                  would present a script as a system recommendation.
                </p>
              )}
              <p className="mt-3 text-xs text-text-muted">
                Detected {formatDateTimeIST(event.detectedAt)} · Updated{' '}
                {formatDateTimeIST(event.updatedAt)} · {event.region}
              </p>
            </CardBody>
          </Card>
        </div>
      </details>
    </div>
  )
}

