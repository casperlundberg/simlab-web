/** Formatting helpers, in one place so a number reads the same everywhere in
 *  the app. */

export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
  if (seconds < 90) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`
  if (seconds < 5400) return `${(seconds / 60).toFixed(1)}m`
  if (seconds < 172800) return `${(seconds / 3600).toFixed(1)}h`
  return `${(seconds / 86400).toFixed(1)}d`
}

export function count(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString()
}

export function percent(fraction: number): string {
  if (!Number.isFinite(fraction)) return '—'
  // No breaches at all is a headline result and should read as one, not as
  // "0.0%" sitting next to a rate that happens to be small.
  if (fraction === 0) return '0%'
  // Small breach rates are the interesting ones, so they keep their
  // significant digits instead of all rounding away to nothing.
  if (fraction < 0.001) return '<0.1%'
  return `${(fraction * 100).toFixed(fraction < 0.1 ? 1 : 0)}%`
}

/** Executor-seconds are the cost side, and hours are what a person compares. */
export function executorHours(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—'
  return (seconds / 3600).toFixed(1)
}

export function timestamp(iso?: string): string {
  if (!iso) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return at.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

export function clockTime(iso?: string): string {
  if (!iso) return '—'
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** The priority levels this workload uses, named for what they mean in
 *  seismic processing. */
const PRIORITY_NAMES: Record<string, string> = {
  '400': 'relocate',
  '100': 'associate',
  '50': 'locate',
  '25': 'pick',
  '0': 'decayed',
}

export function priorityLabel(priority: string): string {
  const name = PRIORITY_NAMES[priority]
  return name ? `P${priority} ${name}` : `P${priority}`
}
