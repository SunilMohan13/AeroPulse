import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { ScientificBadge, StatusBadge } from '../components/common/Badge'
import { KpiStat } from '../components/common/KpiStat'
import { AeroMap } from '../components/map/AeroMap'
import { fetchRiskAreas, fetchTotalExposure } from '../services/riskService'
import { PopulationRiskBars } from '../components/charts/PopulationRiskBars'
import { formatPopulation } from '../utils/format'

export function Risk() {
  const { data: areas = [] } = useQuery({ queryKey: ['riskAreas'], queryFn: fetchRiskAreas })
  const { data: total = 2_400_000 } = useQuery({
    queryKey: ['totalExposure'],
    queryFn: fetchTotalExposure,
  })

  const riskVariant = (risk: string) => {
    if (risk === 'HIGH' || risk === 'SEVERE') return 'severe' as const
    if (risk === 'MEDIUM') return 'warning' as const
    return 'default' as const
  }

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Population Exposure</h1>
        <p className="text-sm text-text-secondary">Who may be affected by current pollution</p>
      </div>

      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <ScientificBadge label="PREDICTED" />
            <KpiStat
              label="People potentially exposed"
              value={total / 1_000_000}
              unit="M"
              className="mt-2"
            />
          </div>
        </CardBody>
      </Card>

      <Card className="overflow-hidden">
        <CardBody className="h-[360px] p-0">
          <AeroMap
            showControls={false}
            showTimeline={false}
            forceLayers={{ population: true }}
            className="h-full"
          />
        </CardBody>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Most Affected Areas</span>
          </CardHeader>
          <CardBody>
            <ol className="space-y-2">
              {areas.map((a) => (
                <li
                  key={a.rank}
                  className="flex items-center justify-between rounded border border-border px-3 py-2"
                >
                  <span className="text-sm">
                    {a.rank}. {a.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-text-muted">
                      {formatPopulation(a.population)}
                    </span>
                    <StatusBadge variant={riskVariant(a.risk)}>{a.risk}</StatusBadge>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-4 border-t border-border pt-4">
              <PopulationRiskBars areas={areas} />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Sensitive Populations</span>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Children', count: '840K' },
                { label: 'Elderly', count: '620K' },
                { label: 'Hospitals', count: '142' },
                { label: 'Schools', count: '1,240' },
              ].map((item) => (
                <div key={item.label} className="rounded border border-border p-3 text-center">
                  <p className="text-2xl font-mono font-bold">{item.count}</p>
                  <p className="text-xs text-text-muted">{item.label}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-text-muted">
              Exposure estimates combine predicted PM2.5 severity with gridded population data.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
