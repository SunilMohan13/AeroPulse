import { Info } from 'lucide-react'
import { useDataMode } from '../../context/DataModeContext'

/**
 * Marks a screen that stays on demo data even while the app is in live mode.
 *
 * Two surfaces need this and both for concrete reasons: the API has no
 * citizen-report list route, and `graph.v1` carries lineage edges without
 * the layout coordinates this hand-drawn diagram needs. Without the notice a
 * reader on "Live" would take a curated illustration for real lineage, which
 * is exactly the substitution the rest of this work exists to prevent.
 */
export function DemoOnlyNotice({ reason }: { reason: string }) {
  const { mode } = useDataMode()
  if (mode !== 'live') return null

  return (
    <div className="flex items-start gap-2 rounded-md border border-intel/30 bg-intel/10 px-3 py-2 text-xs text-intel">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        <span className="font-medium">This screen is showing demo data.</span> {reason}
      </p>
    </div>
  )
}
