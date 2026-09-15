import type { DemoPhase } from '../types'
import { HERO_EVENT_ID } from '../data/mockEvents'

export interface JudgeTourStep {
  route: string
  durationMs: number
  phase: DemoPhase
  caption: string
  /** Copilot auto-send when route is /copilot */
  copilotQuestion?: string
  hourOffset?: number
  layers?: Partial<{
    pollution: boolean
    fires: boolean
    wind: boolean
    forecast: boolean
    industry: boolean
    population: boolean
  }>
}

export const JUDGE_TOUR_STEPS: JudgeTourStep[] = [
  {
    route: '/map?scene=corridor',
    durationMs: 5500,
    phase: 'fire',
    caption: 'Fire detected · FIRMS thermal anomalies · Punjab corridor',
    hourOffset: 0,
    layers: { pollution: true, fires: true, wind: false, forecast: false },
  },
  {
    route: '/map?scene=corridor',
    durationMs: 4500,
    phase: 'plume',
    caption: 'Plume transport · wind-aligned movement toward NCR',
    hourOffset: 3,
    layers: { pollution: true, fires: true, wind: true, forecast: true },
  },
  {
    route: `/events/${HERO_EVENT_ID}`,
    durationMs: 6000,
    phase: 'confirmed',
    caption: 'Event fused · four confidence dimensions · source likelihood',
    hourOffset: 1,
  },
  {
    route: `/evidence?eventId=${HERO_EVENT_ID}`,
    durationMs: 5000,
    phase: 'confirmed',
    caption: 'Evidence graph · independent connectors converge',
  },
  {
    route: '/forecast',
    durationMs: 5500,
    phase: 'forecast',
    caption: 'Nowcast beats persistence baseline · +6h horizon',
    hourOffset: 6,
    layers: { forecast: true, pollution: true, fires: true },
  },
  {
    route: '/risk',
    durationMs: 5000,
    phase: 'risk',
    caption: 'Population exposure · sensitive corridors',
    hourOffset: 4,
    layers: { population: true, forecast: true },
  },
  {
    route: '/copilot',
    durationMs: 8000,
    phase: 'forecast',
    caption: 'Copilot explains retrieved evidence — not the science engine',
    copilotQuestion: 'What evidence supports biomass burning near Delhi?',
  },
  {
    route: '/',
    durationMs: 4000,
    phase: 'complete',
    caption: 'Tour complete · mock UI today · contract-first platform tomorrow',
  },
]

export const JUDGE_TOUR_TOTAL_SEC = Math.round(
  JUDGE_TOUR_STEPS.reduce((s, step) => s + step.durationMs, 0) / 1000,
)
