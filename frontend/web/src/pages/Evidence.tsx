import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { ScientificBadge } from '../components/common/Badge'
import { fetchEvidenceGraph } from '../services/evidenceService'
import type { EvidenceNode } from '../types'

export function Evidence() {
  const { data } = useQuery({ queryKey: ['evidenceGraph'], queryFn: fetchEvidenceGraph })
  const [selected, setSelected] = useState<EvidenceNode | null>(null)

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-semibold">Evidence Explorer</h1>
        <p className="text-sm text-text-secondary">Intelligence investigation interface</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <span className="text-sm font-medium">Evidence Graph</span>
            <ScientificBadge label="OBSERVED" />
          </CardHeader>
          <CardBody>
            <svg viewBox="0 0 800 400" className="w-full h-[400px]">
              {edges.map((e) => {
                const from = nodes.find((n) => n.id === e.from)
                const to = nodes.find((n) => n.id === e.to)
                if (!from || !to) return null
                return (
                  <line
                    key={`${e.from}-${e.to}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke="#334155"
                    strokeWidth={2}
                  />
                )
              })}
              {nodes.map((node) => (
                <g
                  key={node.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  className="cursor-pointer"
                  onClick={() => setSelected(node)}
                >
                  <circle
                    r={node.type === 'event' ? 36 : 28}
                    fill={node.type === 'event' ? '#0891b2' : '#1e293b'}
                    stroke={selected?.id === node.id ? '#22d3ee' : '#334155'}
                    strokeWidth={selected?.id === node.id ? 3 : 1}
                  />
                  <text
                    textAnchor="middle"
                    dy={4}
                    fill="#f1f5f9"
                    fontSize={11}
                    fontWeight={node.type === 'event' ? 600 : 400}
                  >
                    {node.label}
                  </text>
                </g>
              ))}
            </svg>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <span className="text-sm font-medium">Evidence Details</span>
          </CardHeader>
          <CardBody>
            {selected?.item ? (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-text-muted">Source</p>
                  <p className="font-medium">{selected.item.source}</p>
                </div>
                <div>
                  <p className="text-text-muted">Observation</p>
                  <p>{selected.item.observation}</p>
                </div>
                <div>
                  <p className="text-text-muted">Time</p>
                  <p>{new Date(selected.item.time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <div>
                  <p className="text-text-muted">Confidence</p>
                  <p className="font-mono">{selected.item.confidence}%</p>
                </div>
                <div>
                  <p className="text-text-muted">Supports</p>
                  <p>Pollution Event #{selected.item.supports}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-text-muted">Click a node to view evidence details.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
