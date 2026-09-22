import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Flame, ArrowRight } from 'lucide-react'
import { fetchEvent } from '../services/eventService'
import { fetchEvidence, fetchEventTimeline } from '../services/evidenceService'
import { fetchForecast, fetchObservedHistory } from '../services/forecastService'
import { Pm25Timeline } from '../components/charts/Pm25Timeline'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { StatusBadge, ScientificBadge } from '../components/common/Badge'
import { ConfidenceRing } from '../components/common/ConfidenceRing'
import { SourceLikelihoodBars } from '../components/events/SourceLikelihoodBars'
import { LoadingState } from '../components/common/States'
import { formatDateTimeIST, formatPopulation } from '../utils/format'
import { getBandLabel } from '../utils/aqi'
import { ActionBrief } from '../components/events/ActionBrief'
import { CitizenCorroboration } from '../components/events/CitizenCorroboration'
import { useDataMode } from '../context/DataModeContext'
import { FallbackBanner, MaybeValue, ProvenanceBadge } from '../components/common/Provenance'

export function EventDetail() {
  const { mode } = useDataMode()
  const { eventId } = useParams<{ eventId: string }>()
  const { data: event, isLoading } = useQuery({
    queryKey: ['event', eventId, mode],
    queryFn: () => fetchEvent(eventId!),
    enabled: !!eventId,
  })
  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence', eventId, mode],
    queryFn: () => fetchEvidence(eventId!),
    enabled: !!eventId,
  })
  const { data: timeline = [] } = useQuery({
    queryKey: ['timeline', eventId],
    queryFn: () => fetchEventTimeline(eventId!),
    enabled: !!eventId,
  })
  const { data: history = [] } = useQuery({
    queryKey: ['observedHistory'],
    queryFn: fetchObservedHistory,
  })
  const { data: forecast = [] } = useQuery({ queryKey: ['forecast', mode], queryFn: fetchForecast })

  if (isLoading) return <LoadingState message="Loading event intelligence..." />
  if (!event) return <div className="p-8">Event not found</div>

  return (
    <div className="space-y-4 p-4">
      <FallbackBanner />

      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-fire" />
          <h1 className="text-xl font-semibold">Pollution Event</h1>
        </div>
        <p className="text-lg text-text-primary">{event.title}</p>
        <p className="text-sm text-text-secondary">{event.region}</p>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant="live">{event.status}</StatusBadge>
          <StatusBadge variant="severe">{event.severity} SEVERITY</StatusBadge>
        </div>
        <p className="text-xs text-text-muted">
          Detected {formatDateTimeIST(event.detectedAt)} · Updated {formatDateTimeIST(event.updatedAt)}
        </p>
      </motion.div>

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
            <span className="text-sm font-medium">Confidence</span>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <ConfidenceRing value={event.detectionConfidence} label="Detection" size={72} />
              <ConfidenceRing value={event.sourceConfidence} label="Source" size={72} />
              <ConfidenceRing value={event.forecastConfidence} label="Forecast" size={72} />
              <ConfidenceRing value={event.impactConfidence} label="Impact" size={72} />
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Likely Contributors</span>
            <ScientificBadge label="INFERRED" />
          </CardHeader>
          <CardBody>
            <SourceLikelihoodBars items={event.sourceLikelihood} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Evidence</span>
            <ScientificBadge label="OBSERVED" />
          </CardHeader>
          <CardBody>
            <ul className="space-y-2">
              {evidence.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-sm">
                  <span className="text-emerald-400">✓</span>
                  <div>
                    <span className="font-medium">{e.category}</span>
                    <span className="text-text-muted"> — {e.observation}</span>
                    <p className="text-xs text-text-muted">{e.strength} · {e.confidence}%</p>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <span className="text-sm font-medium">Observed Conditions</span>
          <ScientificBadge label="OBSERVED" />
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-text-muted">PM2.5</p>
              <p className="font-mono text-2xl font-bold">{event.pm25} µg/m³</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">AQI</p>
              <p className="font-mono text-2xl font-bold">{event.aqi} ({getBandLabel(event.pm25)})</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Population at risk</p>
              <p className="font-mono text-2xl font-bold">
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
              <p className="font-mono text-2xl font-bold">{event.fireCount}</p>
            </div>
          </div>
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
          <div className="mt-4 flex gap-2">
            <Link
              to="/forecast"
              className="rounded-md bg-intel/20 px-4 py-2 text-sm font-medium text-intel hover:bg-intel/30"
            >
              View Forecast
            </Link>
            <Link
              to="/copilot"
              className="rounded-md border border-border px-4 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Ask Copilot
            </Link>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
