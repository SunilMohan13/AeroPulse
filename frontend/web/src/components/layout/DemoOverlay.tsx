import { useApp } from '../../context/AppContext'

const phaseMessages: Record<string, string> = {
  fire: '🔥 FIRE DETECTED',
  anomaly: 'PM2.5 ANOMALY DETECTED',
  wind: 'WIND ALIGNMENT CONFIRMED',
  plume: 'POLLUTION MOVEMENT FORECAST',
  confirmed: 'EVENT CONFIRMED — Confidence 94%',
  forecast: 'FORECAST PLUME ACTIVE',
  risk: 'POPULATION RISK — 2.4M',
  complete: 'SIMULATION COMPLETE',
}

export function DemoOverlay() {
  const { demoPhase, demoRunning, skipDemo } = useApp()

  if (!demoRunning && demoPhase !== 'complete') return null
  if (demoPhase === 'idle') return null

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-intel/40 bg-bg-panel/95 px-4 py-2 shadow-lg backdrop-blur">
        <span className="text-sm font-semibold text-intel">
          {phaseMessages[demoPhase] ?? 'DEMO MODE'}
        </span>
        {demoRunning && (
          <button
            type="button"
            onClick={skipDemo}
            className="text-xs text-text-muted hover:text-text-primary"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  )
}
