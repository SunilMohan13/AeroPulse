import { useState, useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Play, Pause, RotateCcw } from 'lucide-react'
import {
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  ComposedChart,
  ReferenceLine,
  CartesianGrid,
} from 'recharts'
import { AeroMap } from '../components/map/AeroMap'
import { Card, CardBody, CardHeader } from '../components/common/Card'
import { ScientificBadge } from '../components/common/Badge'
import { fetchForecastSeries } from '../services/forecastService'
import { useApp } from '../context/AppContext'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { getPollutionSwatch, getBandLabel } from '../utils/aqi'

const horizons = [0, 1, 3, 6, 12, 24, 48]

export function Forecast() {
  const { data: series = [] } = useQuery({
    queryKey: ['forecastSeries'],
    queryFn: fetchForecastSeries,
  })
  const { hourOffset, setHourOffset } = useApp()
  const [playing, setPlaying] = useState(false)
  const reducedMotion = useReducedMotion()
  const playRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!playing || reducedMotion) return
    playRef.current = setInterval(() => {
      setHourOffset((h) => (h >= 12 ? 0 : h + 1))
    }, 1100)
    return () => {
      if (playRef.current) clearInterval(playRef.current)
    }
  }, [playing, reducedMotion, setHourOffset])

  // A true range area (tuple dataKey) draws the confidence band directly,
  // rather than masking a stacked area against a hardcoded page colour.
  const chartData = useMemo(
    () =>
      series.map((p) => ({
        hour: p.hour,
        pm25: p.pm25,
        band: [p.confidenceLow, p.confidenceHigh] as [number, number],
      })),
    [series],
  )

  const current = useMemo(
    () =>
      series.reduce(
        (best, p) =>
          Math.abs(p.hour - hourOffset) < Math.abs(best.hour - hourOffset) ? p : best,
        series[0] ?? { hour: 0, pm25: 0, confidenceLow: 0, confidenceHigh: 0, timestamp: '' },
      ),
    [series, hourOffset],
  )

  const peak = useMemo(
    () => series.reduce((a, b) => (b.pm25 > a.pm25 ? b : a), series[0]),
    [series],
  )

  const yDomain = useMemo(() => {
    if (series.length === 0) return { min: 0, max: 100 }
    const lows = series.map((p) => p.confidenceLow)
    const highs = series.map((p) => p.confidenceHigh)
    const pad = 12
    return {
      min: Math.max(0, Math.floor((Math.min(...lows) - pad) / 10) * 10),
      max: Math.ceil((Math.max(...highs) + pad) / 10) * 10,
    }
  }, [series])

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Forecast</h1>
          <p className="text-sm text-text-secondary">Where pollution will move</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              Delhi NCR · {hourOffset === 0 ? 'now' : `+${hourOffset}h`}
            </p>
            <div className="flex items-baseline gap-2">
              <motion.span
                key={current?.pm25}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="font-mono text-2xl font-bold tabular-nums"
                style={{ color: getPollutionSwatch(current?.pm25 ?? 0) }}
              >
                {current?.pm25 ?? 0}
              </motion.span>
              <span className="text-xs text-text-muted">
                µg/m³ · {getBandLabel(current?.pm25 ?? 0)}
              </span>
            </div>
          </div>
          <ScientificBadge label="PREDICTED" />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="group"
          aria-label="Forecast horizon"
          className="flex overflow-hidden rounded-lg border border-border"
        >
          {horizons.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHourOffset(h)}
              aria-pressed={hourOffset === h}
              className={`relative px-3.5 py-1.5 text-sm transition-colors ${
                hourOffset === h
                  ? 'text-intel'
                  : 'text-text-secondary hover:bg-bg-panel hover:text-text-primary'
              }`}
            >
              {hourOffset === h && (
                <motion.span
                  layoutId="horizon-pill"
                  className="absolute inset-0 -z-10 bg-intel/15"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              {h === 0 ? 'Now' : `${h}h`}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-1">
          <button
            type="button"
            onClick={() => setPlaying(!playing)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-intel/40 hover:text-intel"
          >
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {playing ? 'Pause' : 'Play forecast'}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false)
              setHourOffset(0)
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        </div>
      </div>

      <Card className="min-h-[300px] flex-1 overflow-hidden">
        <CardBody className="h-full p-0">
          <AeroMap
            showControls={false}
            forceLayers={{ forecast: true }}
            className="h-full w-full"
          />
        </CardBody>
      </Card>

      {/* Kept below the map rather than in a side column so the trajectory is
          always on screen, not pushed off at narrow widths. */}
      <div className="grid shrink-0 gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="flex items-center justify-between py-2">
            <span className="text-xs font-medium">PM2.5 trajectory · Delhi NCR</span>
            <span className="text-[10px] text-text-muted">shaded band = 80% confidence</span>
          </CardHeader>
          <CardBody className="h-[150px] p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="#151f30" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  tickFormatter={(h: number) => (h === 0 ? 'Now' : `+${h}h`)}
                  stroke="#1e293b"
                />
                {/* Domain follows the data so the rise is legible instead of
                    being flattened against a 0-based axis. */}
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  stroke="#1e293b"
                  domain={[yDomain.min, yDomain.max]}
                  allowDataOverflow
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#151d2e',
                    border: '1px solid #1e293b',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  labelFormatter={(h) => (h === 0 ? 'Now' : `+${h}h`)}
                  formatter={(value, name) =>
                    name === 'pm25'
                      ? [`${value} µg/m³`, 'Predicted']
                      : [
                          `${(value as [number, number])[0]}–${(value as [number, number])[1]}`,
                          'Confidence',
                        ]
                  }
                />
                <Area
                  dataKey="band"
                  stroke="none"
                  fill="rgba(34,211,238,0.20)"
                  isAnimationActive={!reducedMotion}
                />
                <ReferenceLine
                  x={hourOffset}
                  stroke="#22d3ee"
                  strokeDasharray="3 3"
                  strokeOpacity={0.8}
                />
                <Line
                  type="monotone"
                  dataKey="pm25"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={!reducedMotion}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>

        <Card>
          <CardHeader className="py-2">
            <span className="text-xs font-medium">Outlook</span>
          </CardHeader>
          <CardBody className="space-y-2 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-text-secondary">Peak expected</span>
              <span className="font-mono font-medium">
                {peak?.pm25 ?? 0} µg/m³ · +{peak?.hour ?? 0}h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Confidence range</span>
              <span className="font-mono">
                {current?.confidenceLow ?? 0}–{current?.confidenceHigh ?? 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Forecast confidence</span>
              <span className="font-mono">89%</span>
            </div>
            <p className="border-t border-border pt-2 text-text-muted">
              Smoke is advecting southeast from the Punjab fire cluster at ~22 km/h. Values are
              model output, not measurements.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
