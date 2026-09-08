import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { DemoPhase, MapLayerVisibility, Notification } from '../types'
import { mockNotifications } from '../data/mockPopulation'
import { bumpLivePm25 } from '../services/eventService'
import { bumpSourceFreshness } from '../services/sourceService'

interface AppContextValue {
  hourOffset: number
  setHourOffset: Dispatch<SetStateAction<number>>
  layers: MapLayerVisibility
  toggleLayer: (key: keyof MapLayerVisibility) => void
  livePaused: boolean
  setLivePaused: (v: boolean) => void
  lastLiveUpdate: Date
  notifications: Notification[]
  demoPhase: DemoPhase
  demoRunning: boolean
  demoPaused: boolean
  startDemo: () => void
  pauseDemo: () => void
  skipDemo: () => void
  exitDemo: () => void
  demoIntensity: number
  commandPaletteOpen: boolean
  setCommandPaletteOpen: (v: boolean) => void
  notificationsOpen: boolean
  setNotificationsOpen: (v: boolean) => void
  selectedFireId: string | null
  setSelectedFireId: (id: string | null) => void
  selectedGridId: string | null
  setSelectedGridId: (id: string | null) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  mobileNavOpen: boolean
  setMobileNavOpen: (v: boolean) => void
}

const AppContext = createContext<AppContextValue | null>(null)

const DEMO_PHASES: DemoPhase[] = [
  'fire',
  'anomaly',
  'wind',
  'plume',
  'confirmed',
  'forecast',
  'risk',
  'complete',
]

const PHASE_DURATION = 2200

export function AppProvider({ children }: { children: ReactNode }) {
  const [hourOffset, setHourOffset] = useState(0)
  const [layers, setLayers] = useState<MapLayerVisibility>({
    pollution: true,
    fires: true,
    wind: true,
    forecast: true,
    industry: false,
    population: false,
  })
  const [livePaused, setLivePaused] = useState(false)
  const [lastLiveUpdate, setLastLiveUpdate] = useState(new Date())
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [demoPhase, setDemoPhase] = useState<DemoPhase>('idle')
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoPaused, setDemoPaused] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [selectedFireId, setSelectedFireId] = useState<string | null>(null)
  const [selectedGridId, setSelectedGridId] = useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [, setPhaseIndex] = useState(0)

  const toggleLayer = useCallback((key: keyof MapLayerVisibility) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const demoIntensity = useMemo(() => {
    if (demoPhase === 'idle') return 1
    if (demoPhase === 'fire') return 0.3
    if (demoPhase === 'anomaly') return 0.6
    if (demoPhase === 'wind') return 0.7
    if (demoPhase === 'plume') return 0.85
    return 1
  }, [demoPhase])

  const startDemo = useCallback(() => {
    setDemoRunning(true)
    setDemoPaused(false)
    setPhaseIndex(0)
    setDemoPhase('fire')
    setHourOffset(0)
    setNotifications(mockNotifications)
    setLayers((l) => ({ ...l, fires: true, wind: false, forecast: false, pollution: true }))
  }, [])

  const exitDemo = useCallback(() => {
    setDemoRunning(false)
    setDemoPaused(false)
    setDemoPhase('idle')
    setPhaseIndex(0)
    setHourOffset(0)
  }, [])

  const skipDemo = useCallback(() => {
    setDemoPhase('complete')
    setPhaseIndex(DEMO_PHASES.length - 1)
    setHourOffset(3)
    setLayers({ pollution: true, fires: true, wind: true, forecast: true, industry: false, population: true })
  }, [])

  const pauseDemo = useCallback(() => setDemoPaused((p) => !p), [])

  useEffect(() => {
    if (!demoRunning || demoPaused) return
    const timer = setInterval(() => {
      setPhaseIndex((i) => {
        const next = i + 1
        if (next >= DEMO_PHASES.length) {
          setDemoRunning(false)
          setDemoPhase('complete')
          return i
        }
        const phase = DEMO_PHASES[next]
        setDemoPhase(phase)
        if (phase === 'wind') setLayers((l) => ({ ...l, wind: true }))
        if (phase === 'plume' || phase === 'forecast') {
          setLayers((l) => ({ ...l, forecast: true }))
          setHourOffset(2)
        }
        if (phase === 'risk') {
          setLayers((l) => ({ ...l, population: true }))
          setHourOffset(4)
          setNotifications((current) =>
            current.some((n) => n.id === 'demo-alert')
              ? current
              : [
                  {
                    id: 'demo-alert',
                    title: 'Population risk threshold exceeded',
                    message: '2.4M people in projected plume path — Delhi NCR',
                    time: 'just now',
                    route: '/risk',
                    icon: 'warning',
                  },
                  ...current,
                ],
          )
        }
        if (phase === 'confirmed') setHourOffset(1)
        return next
      })
    }, PHASE_DURATION)
    return () => clearInterval(timer)
  }, [demoRunning, demoPaused])

  useEffect(() => {
    if (livePaused) return
    const timer = setInterval(() => {
      bumpLivePm25()
      bumpSourceFreshness()
      setLastLiveUpdate(new Date())
    }, 12000)
    return () => clearInterval(timer)
  }, [livePaused])

  const value: AppContextValue = {
    hourOffset,
    setHourOffset,
    layers,
    toggleLayer,
    livePaused,
    setLivePaused,
    lastLiveUpdate,
    notifications,
    demoPhase,
    demoRunning,
    demoPaused,
    startDemo,
    pauseDemo,
    skipDemo,
    exitDemo,
    demoIntensity,
    commandPaletteOpen,
    setCommandPaletteOpen,
    notificationsOpen,
    setNotificationsOpen,
    selectedFireId,
    setSelectedFireId,
    selectedGridId,
    setSelectedGridId,
    sidebarCollapsed,
    setSidebarCollapsed,
    mobileNavOpen,
    setMobileNavOpen,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
