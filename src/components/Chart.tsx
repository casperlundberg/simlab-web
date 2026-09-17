import { useEffect, useRef } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
import { cssVar, withAlpha } from './theme'
import { count } from './format'
import { stack } from './stack'

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
  /** Draw the series as layers of one total, the first at the bottom. The
   *  tooltip still reports each layer's own value, not the running total. */
  stacked?: boolean
}

/**
 * A small uPlot wrapper.
 *
 * uPlot rather than a React charting library because a run is thousands of
 * points and it redraws them without dropping frames, which matters when the
 * chart is following a live run rather than showing a finished one.
 */
export function Chart({ x, series, height = 210, yLabel, stacked = false }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const tooltip = useRef<HTMLDivElement>(null)
  const plot = useRef<uPlot | null>(null)

  // Data is held in a ref so an update reuses the existing plot instead of
  // rebuilding it; rebuilding on every event would make a live run flicker.
  const data = useRef<uPlot.AlignedData>(plotted(x, series, stacked))
  data.current = plotted(x, series, stacked)

  // The tooltip reads the latest values when the cursor moves, which may be
  // many data updates after the plot was built.
  const latest = useRef({ x, series })
  latest.current = { x, series }

  useEffect(() => {
    if (!container.current) return

    // Stacked layers are drawn top of the stack first, each filled solid down
    // to the axis, so every lower layer paints over the one above it and only
    // its own band stays visible. A surface-coloured edge separates them.
    const drawn = stacked ? [...series].reverse() : series
    const surface = cssVar('--surface')

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
        ...drawn.map((s) => stacked
          ? { label: s.label, stroke: surface, width: 1.5, fill: s.colour, points: { show: false } }
          : {
            label: s.label,
            stroke: s.colour,
            width: 1.6,
            ...(s.dashed ? { dash: [4, 4] } : {}),
            ...(s.fill ? { fill: withAlpha(s.colour, 0.15) } : {}),
            points: { show: false },
          }),
      ],
      hooks: {
        setCursor: [(u) => showTooltip(u, tooltip.current, latest.current)],
      },
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
  }, [height, yLabel, stacked, series.length, series.map((s) => s.label + s.colour).join('|')])

  useEffect(() => {
    plot.current?.setData(data.current)
  }, [x, series])

  return (
    <div className="chart">
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i className={stacked ? 'swatch block' : 'swatch'} style={{ background: s.colour }} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </div>
      <div ref={container} style={{ position: 'relative' }}>
        <div ref={tooltip} className="chart-tooltip" hidden />
      </div>
    </div>
  )
}

function plotted(x: number[], series: Series[], stacked: boolean): uPlot.AlignedData {
  if (!stacked) return [x, ...series.map((s) => s.values)] as uPlot.AlignedData
  return [x, ...stack(series.map((s) => s.values)).reverse()] as uPlot.AlignedData
}

function showTooltip(
  u: uPlot,
  element: HTMLDivElement | null,
  { x, series }: { x: number[]; series: Series[] },
) {
  if (!element) return
  const index = u.cursor.idx
  const left = u.cursor.left ?? -1
  if (index === null || index === undefined || left < 0 || x[index] === undefined) {
    element.hidden = true
    return
  }

  // Built from text nodes rather than markup: labels come from priority levels
  // and other data, and none of it should ever be parsed as HTML.
  element.replaceChildren()
  const at = document.createElement('div')
  at.className = 'at'
  at.textContent = formatElapsed(x[index] ?? 0)
  element.append(at)
  for (const s of series) {
    const row = document.createElement('div')
    row.className = 'row'
    const swatch = document.createElement('i')
    swatch.className = 'swatch block'
    swatch.style.background = s.colour
    const label = document.createElement('span')
    label.textContent = s.label
    const value = document.createElement('span')
    value.className = 'value'
    const raw = s.values[index]
    value.textContent = raw === undefined ? '—' : count(raw)
    row.append(swatch, label, value)
    element.append(row)
  }

  element.hidden = false
  // Beside the cursor, flipped to its left near the right-hand edge so it is
  // never cut off by the card.
  const plotLeft = u.bbox.left / devicePixelRatio
  const width = element.offsetWidth
  const room = u.over.clientWidth - left
  element.style.left = `${plotLeft + (room > width + 24 ? left + 14 : left - width - 14)}px`
  element.style.top = '8px'
}

function formatElapsed(seconds: number): string {
  if (seconds < 90) return `${Math.round(seconds)}s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(0)}m`
  return `${(seconds / 3600).toFixed(1)}h`
}
