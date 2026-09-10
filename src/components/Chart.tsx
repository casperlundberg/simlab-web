import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

export interface Series {
  label: string
  values: number[]
  colour: string
  /** Filled series read as volume — a queue, a fleet. Line series read as a
   *  rate or a level. */
  fill?: boolean
  dashed?: boolean
}

interface Props {
  /** Seconds from the start of the run, one per sample. */
  x: number[]
  series: Series[]
  height?: number
  yLabel?: string
}

/**
 * A small uPlot wrapper.
 *
 * uPlot rather than a React charting library because a run is thousands of
 * points and it redraws them without dropping frames, which matters when the
 * chart is following a live run rather than showing a finished one.
 */
export function Chart({ x, series, height = 210, yLabel }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)

  // Data is held in a ref so an update reuses the existing plot instead of
  // rebuilding it; rebuilding on every event would make a live run flicker.
  const data = useRef<uPlot.AlignedData>([x, ...series.map((s) => s.values)] as uPlot.AlignedData)
  data.current = [x, ...series.map((s) => s.values)] as uPlot.AlignedData

  useEffect(() => {
    if (!container.current) return

    const options: uPlot.Options = {
      width: container.current.clientWidth,
      height,
      // The chart already has a legend above it, drawn in the app's own type.
      legend: { show: false },
      cursor: { y: false },
      scales: { x: { time: false } },
      axes: [
        {
          stroke: cssVar('--text-faint'),
          grid: { stroke: cssVar('--border'), width: 1 },
          ticks: { stroke: cssVar('--border') },
          values: (_, ticks) => ticks.map(formatElapsed),
          font: '11px system-ui, sans-serif',
        },
        {
          stroke: cssVar('--text-faint'),
          grid: { stroke: cssVar('--border'), width: 1 },
          ticks: { stroke: cssVar('--border') },
          // Spread rather than assigned: with exactOptionalPropertyTypes an
          // explicit undefined is not the same as an absent property.
          ...(yLabel ? { label: yLabel } : {}),
          labelFont: '11px system-ui, sans-serif',
          font: '11px system-ui, sans-serif',
          size: 52,
        },
      ],
      series: [
        { label: 'elapsed', value: (_, raw) => formatElapsed(raw ?? 0) },
        ...series.map((s) => ({
          label: s.label,
          stroke: s.colour,
          width: 1.6,
          ...(s.dashed ? { dash: [4, 4] } : {}),
          ...(s.fill ? { fill: withAlpha(s.colour, 0.15) } : {}),
          points: { show: false },
        })),
      ],
    }

    plot.current = new uPlot(options, data.current, container.current)

    const resize = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      plot.current?.setSize({ width: entry.contentRect.width, height })
    })
    resize.observe(container.current)

    return () => {
      resize.disconnect()
      plot.current?.destroy()
      plot.current = null
    }
    // Rebuilt only when the shape of the chart changes, never when the data
    // does.
  }, [height, yLabel, series.length, series.map((s) => s.label).join('|')])

  useEffect(() => {
    plot.current?.setData(data.current)
  }, [x, series])

  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i className="swatch" style={{ background: s.colour }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={container} />
    </div>
  )
}

function formatElapsed(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(0)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}

/** Reads a palette token so the chart follows the theme rather than carrying
 *  a second, divergent set of colours. */
function cssVar(name: string): string {
  if (typeof window === 'undefined') return '#888'
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
}

function withAlpha(colour: string, alpha: number): string {
  if (colour.startsWith('#') && colour.length === 7) {
    const value = Number.parseInt(colour.slice(1), 16)
    // eslint-disable-next-line no-bitwise
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
  }
  return colour
}
