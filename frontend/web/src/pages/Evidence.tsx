import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Network } from 'lucide-react'
import { ScientificBadge } from '../components/common/Badge'
import { LoadingState } from '../components/common/States'
import { EvidenceDetailPanel } from '../components/evidence/EvidenceDetailPanel'
import { EvidenceGraphView } from '../components/evidence/EvidenceGraphView'
import { fetchEvidenceGraph } from '../services/evidenceService'
import type { EvidenceNode } from '../types'
import { HERO_EVENT_ID } from '../data/mockEvents'

export function Evidence() {
  const [searchParams] = useSearchParams()
  const eventHint = searchParams.get('eventId')
  const { data, isLoading } = useQuery({
    queryKey: ['evidenceGraph'],
    queryFn: fetchEvidenceGraph,
  })
  const [selected, setSelected] = useState<EvidenceNode | null>(null)

  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []
  const sourceNodes = useMemo(() => nodes.filter((n) => n.type !== 'event'), [nodes])

  useEffect(() => {
    if (nodes.length === 0) return
    if (eventHint === HERO_EVENT_ID && !selected) {
      setSelected(nodes.find((n) => n.id === 'cpcb') ?? nodes.find((n) => n.item) ?? null)
    }
  }, [eventHint, nodes, selected])

  if (isLoading) return <LoadingState message="Loading evidence graph..." />

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-400" />
            <h1 className="text-xl font-semibold tracking-tight">Evidence Explorer</h1>
          </div>
          <p className="mt-1 text-sm text-text-secondary">
            Multi-source fusion for {eventHint ?? HERO_EVENT_ID} · investigation graph
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScientificBadge label="OBSERVED" />
          <ScientificBadge label="INFERRED" />
          <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] text-emerald-300">
            {sourceNodes.length}/{sourceNodes.length} linked
          </span>
        </div>
      </motion.header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06 }}
        className="grid min-h-0 flex-1 gap-4 lg:grid-cols-5"
      >
        <div className="flex min-h-[420px] flex-col gap-2 lg:col-span-3">
          <div className="flex items-center justify-between px-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-cyan-300/85">
              Fusion graph
            </p>
            <p className="text-[10px] text-text-muted">Hub = pollution event · spokes = connectors</p>
          </div>
          <EvidenceGraphView
            nodes={nodes}
            edges={edges}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
          />
        </div>

        <div className="lg:col-span-2">
          <EvidenceDetailPanel
            selected={selected}
            linkedCount={sourceNodes.length}
            totalSources={sourceNodes.length}
          />
        </div>
      </motion.div>
    </div>
  )
}
