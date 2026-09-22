import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { StatusBadge, ScientificBadge } from '../components/common/Badge'
import { fetchCitizenStats } from '../services/citizenService'
import { CitizenReportMap } from '../components/map/CitizenReportMap'
import type { CitizenReport } from '../types'
import { LiveCaveatNotice } from '../components/common/DemoOnlyNotice'
import { CITIZEN_LIVE_CAVEAT } from '../services/citizenService'

export function CitizenReports() {
  const [searchParams] = useSearchParams()
  const highlightId = searchParams.get('highlight')
  const { data } = useQuery({ queryKey: ['citizenStats'], queryFn: fetchCitizenStats })
  const [selected, setSelected] = useState<CitizenReport | null>(null)

  const reports = data?.reports ?? []

  useEffect(() => {
    if (!highlightId || reports.length === 0) return
    const match = reports.find((r) => r.id === highlightId)
    if (match) setSelected(match)
  }, [highlightId, reports])

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Citizen Intelligence</h1>
        <p className="text-sm text-text-secondary">Crowdsourced environmental observations</p>
      </div>

      <LiveCaveatNotice reason={CITIZEN_LIVE_CAVEAT} />

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardBody className="text-center">
            <p className="font-mono text-2xl font-bold">{data?.totalToday ?? 312}</p>
            <p className="text-xs text-text-muted">reports today</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="font-mono text-2xl font-bold">{data?.awaiting ?? 27}</p>
            <p className="text-xs text-text-muted">awaiting verification</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="text-center">
            <p className="font-mono text-2xl font-bold">{data?.correlated ?? 84}</p>
            <p className="text-xs text-text-muted">correlated with events</p>
          </CardBody>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader>
          <span className="text-sm font-medium">Report Locations</span>
        </CardHeader>
        <CardBody className="h-[300px] p-0">
          <CitizenReportMap
            reports={reports}
            selectedId={selected?.id}
            onSelect={setSelected}
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Recent Reports</span>
          </CardHeader>
          <CardBody className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(r)}
                className={`w-full rounded-md border p-3 text-left transition-colors ${
                  selected?.id === r.id || r.id === highlightId
                    ? 'border-intel/40 bg-intel/5 ring-1 ring-intel/30'
                    : 'border-border hover:bg-bg-elevated'
                }`}
              >
                <p className="text-sm font-medium">{r.type}</p>
                <p className="text-xs text-text-muted">
                  {r.location} · {new Date(r.reportedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <p className="text-xs text-text-secondary">Confidence {r.confidence}%</p>
              </button>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Report Detail</span>
            <ScientificBadge label="OBSERVED" />
          </CardHeader>
          <CardBody>
            {selected ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-text-muted">Location</p>
                  <p className="font-medium">{selected.location}</p>
                </div>
                <div>
                  <p className="text-text-muted">Reported</p>
                  <p>
                    {new Date(selected.reportedAt).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div>
                  <p className="text-text-muted">Type</p>
                  <p>{selected.type}</p>
                </div>
                <div>
                  <p className="text-text-muted">AI classification</p>
                  <p>{selected.classification}</p>
                </div>
                <div>
                  <p className="text-text-muted">Corroboration</p>
                  <p>{selected.corroboration} independent signals</p>
                </div>
                <div>
                  <p className="text-text-muted">Status</p>
                  <StatusBadge variant={selected.status === 'CORROBORATED' ? 'success' : 'warning'}>
                    {selected.status}
                  </StatusBadge>
                </div>
                {selected.relatedEventId && (
                  <p className="text-xs text-intel">
                    Linked event {selected.relatedEventId} · corroboration only
                  </p>
                )}
                <p className="text-xs text-text-muted">
                  Citizen reports corroborate events; a single photo alone does not create high-severity alerts.
                </p>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Select a report to view details.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
