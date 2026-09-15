export type EventType = 'biomass' | 'industrial' | 'traffic' | 'dust' | 'transport'
export type EventSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE'
export type EventStatus =
  | 'DETECTED'
  | 'VALIDATING'
  | 'CONFIRMED'
  | 'FORECASTING'
  | 'ACTIVE'
  | 'DECLINING'
  | 'RESOLVED'
  | 'REJECTED'

export type ScientificLabel = 'OBSERVED' | 'INFERRED' | 'PREDICTED' | 'RECOMMENDED'

export interface PollutionEvent {
  id: string
  title: string
  type: EventType
  severity: EventSeverity
  status: EventStatus
  lat: number
  lon: number
  pm25: number
  pm10: number
  aqi: number
  detectionConfidence: number
  sourceConfidence: number
  forecastConfidence: number
  impactConfidence: number
  populationAtRisk: number
  region: string
  detectedAt: string
  updatedAt: string
  fireCount: number
  frpMw: number
  sourceLikelihood: SourceLikelihood[]
  recommendedActions: string[]
}

export interface SourceLikelihood {
  source: string
  probability: number
}

export interface GridCell {
  gridId: string
  lat: number
  lon: number
  pm25: number
  pm10: number
  no2: number
  aqi: number
  population: number
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE'
  /** Cell edge length in degrees; the polygon is derived at render time.
   *  Storing the four corners per cell cost ~6 extra objects each, which
   *  dominated memory once tens of thousands of cells were cached. */
  stepDeg: number
  /** Smoke contribution from the fire source alone, in µg/m³. */
  plume: number
  /** 0 at the corridor edge, 1 inland — used to fade the layer boundary. */
  edgeFade: number
}

export interface FireObservation {
  id: string
  lat: number
  lon: number
  frp: number
  confidence: number
  timestamp: string
}

export interface WindObservation {
  lat: number
  lon: number
  u: number
  v: number
  speed: number
  direction: number
}

export interface ForecastPoint {
  hour: number
  timestamp: string
  pm25: number
  confidenceLow: number
  confidenceHigh: number
  /** Persistence baseline: hold last observed PM2.5 (honest comparison for promotion). */
  baselinePm25?: number
}

export interface EvidenceItem {
  id: string
  category: string
  source: string
  observation: string
  time: string
  confidence: number
  supports: string
  strength: 'Weak' | 'Moderate' | 'Strong'
}

export interface EvidenceNode {
  id: string
  label: string
  type: 'event' | 'fire' | 'cpcb' | 'satellite' | 'weather' | 'cams' | 'forecast'
  x: number
  y: number
  item?: EvidenceItem
}

export interface EvidenceEdge {
  from: string
  to: string
}

export interface SourceHealth {
  id: string
  name: string
  status: 'Healthy' | 'Delayed' | 'Degraded' | 'Offline'
  freshnessMinutes: number
  quality: number
  recordsToday: number
  lastIngestion: string
  latencySec: number
  errorRate: number
  connector: string
}

export interface CitizenReport {
  id: string
  type: string
  location: string
  lat: number
  lon: number
  reportedAt: string
  confidence: number
  classification: string
  corroboration: number
  status: 'PENDING' | 'CORROBORATED' | 'REJECTED'
  relatedEventId?: string
}

export interface PopulationRiskArea {
  rank: number
  name: string
  risk: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE'
  population: number
  lat: number
  lon: number
}

export interface IndustrySite {
  id: string
  name: string
  lat: number
  lon: number
  type: string
}

export interface Notification {
  id: string
  title: string
  message: string
  time: string
  route: string
  icon: 'fire' | 'forecast' | 'warning'
}

export interface TimelineEvent {
  id: string
  time: string
  label: string
  icon: string
}

export interface CopilotMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: { source: string; time: string }[]
}

export interface MapLayerVisibility {
  pollution: boolean
  fires: boolean
  wind: boolean
  forecast: boolean
  industry: boolean
  population: boolean
}

export type DemoPhase =
  | 'idle'
  | 'fire'
  | 'anomaly'
  | 'wind'
  | 'plume'
  | 'confirmed'
  | 'forecast'
  | 'risk'
  | 'complete'
