import { useApp } from '../../context/AppContext'
import { formatDateTimeIST } from '../../utils/format'

export function FooterStatus() {
  const { lastLiveUpdate } = useApp()

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border bg-bg-elevated/80 px-4 text-[11px] text-text-muted">
      <span>AeroPulse Intelligence Engine · ● All systems operational</span>
      <div className="flex gap-4">
        <span>Data freshness: 2 min</span>
        <span>Models: Production</span>
        <span>Last update: {formatDateTimeIST(lastLiveUpdate.toISOString())} IST</span>
      </div>
    </footer>
  )
}
