import type { CopilotMessage } from '../types'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

const responses: Record<string, { content: string; citations: { source: string; time: string }[] }> =
  {
    default: {
      content: `The strongest current signal is biomass burning in Punjab.

I found:
• 42 FIRMS fire detections
• 82 MW aggregate FRP
• strong CPCB PM2.5 increase
• wind alignment toward Haryana
• supporting CAMS regional transport

The system estimates:
Biomass burning     78%
Regional transport  62%

This is probabilistic source attribution, not proof of causality.`,
      citations: [
        { source: 'CPCB', time: '14:00' },
        { source: 'FIRMS', time: '14:02' },
        { source: 'IMD', time: '14:00' },
        { source: 'CAMS', time: '13:45' },
      ],
    },
    plume: {
      content: `PREDICTED plume movement indicates southeast-to-northwest transport at ~14 km/h.

The pollution field is expected to reach Delhi NCR within 3–6 hours, with peak PM2.5 around 230–260 µg/m³ in the highest-exposure corridor.

Forecast confidence: 89%

Limitations: Sentinel-5P data is 2h delayed; forecast uses available ground and meteorological evidence.`,
      citations: [
        { source: 'IMD', time: '14:00' },
        { source: 'AeroPulse Forecast', time: '14:05' },
        { source: 'CAMS', time: '13:45' },
      ],
    },
    confidence: {
      content: `This event is considered high confidence based on converging independent evidence:

OBSERVED: CPCB PM2.5 +68% across 6 stations
OBSERVED: 42 FIRMS detections with 82 MW FRP
OBSERVED: IMD wind alignment 0.88
INFERRED: Biomass burning likelihood 78%

Detection confidence: 94%
Overall event confidence: 89%`,
      citations: [
        { source: 'CPCB', time: '14:00' },
        { source: 'FIRMS', time: '14:02' },
        { source: 'IMD', time: '14:00' },
      ],
    },
  }

function matchResponse(query: string) {
  const q = query.toLowerCase()
  if (q.includes('plume') || q.includes('moving') || q.includes('affected')) return responses.plume
  if (q.includes('confidence') || q.includes('why')) return responses.confidence
  return responses.default
}

export async function queryCopilot(query: string): Promise<CopilotMessage> {
  await delay(400)
  const matched = matchResponse(query)
  return {
    id: `msg_${Date.now()}`,
    role: 'assistant',
    content: matched.content,
    citations: matched.citations,
  }
}

export const suggestedQuestions = [
  'What is causing the pollution near Delhi?',
  'Where is the current plume moving?',
  'Which areas will be affected in the next 3 hours?',
  'Why is this event considered high confidence?',
  'What evidence supports biomass burning?',
]
