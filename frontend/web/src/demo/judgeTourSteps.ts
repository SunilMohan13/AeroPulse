import type { DemoPhase } from '../types'
import { heroEventPath } from '../utils/heroEvent'
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

export function judgeTourSteps(heroEventId: string): JudgeTourStep[] {
  return [
    {
      route: '/',
      durationMs: 5000,
      phase: 'confirmed',
      caption: 'Overview · KPIs and event list — not the investigation map',
      hourOffset: 0,
    },
    {
      route: '/map',
      durationMs: 5000,
      phase: 'fire',
      caption: 'Live Map · 1 km corridor · FIRMS + CPCB fuse',
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
      route: heroEventPath(heroEventId),
      durationMs: 6000,
      phase: 'plume',
      caption: 'Events · Detect workspace · predicted transport toward Delhi NCR',
      hourOffset: 1,
    },
    {
      route: heroEventId ? `/evidence?eventId=${heroEventId}` : '/evidence',
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
      caption: 'Tour complete · Demo or Live from the header toggle',
    },
  ]
}

export const JUDGE_TOUR_STEPS = judgeTourSteps(HERO_EVENT_ID)

export const JUDGE_TOUR_TOTAL_SEC = Math.round(
  JUDGE_TOUR_STEPS.reduce((s, step) => s + step.durationMs, 0) / 1000,
)
