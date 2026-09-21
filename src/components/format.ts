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

/** Levels named for what they mean in every run. Only one qualifies: the
 *  level beneath everything submitted, which only decayed work reaches. The
 *  pipeline stages are not levels — every job is a pick whose priority the
 *  scenario's mix drew — so naming P50 "locate" showed locate jobs where a
 *  scenario had none, and P0 is pick work on the calibrated day. Stage names
 *  belong to a scenario that really runs the stages, and should come from it. */
const PRIORITY_NAMES: Record<string, string> = {
  '-1': 'decayed',
}

export function priorityLabel(priority: string): string {
  const shown = priority.replace(/^-/, '\u2212')
  const name = PRIORITY_NAMES[priority]
  return name ? `P${shown} ${name}` : `P${shown}`
}

const ENTITY_KINDS: [prefix: string, name: string][] = [
  ['autonomous-vehicle-', 'Autonomous'],
  ['crewed-vehicle-', 'Crewed vehicle'],
  ['person-', 'Person'],
]

/** A person or vehicle as an operator would name it: "Person 3" rather than
 *  "person-03". */
export function entityName(id: string): string {
  for (const [prefix, name] of ENTITY_KINDS) {
    if (id.startsWith(prefix)) {
      const number = Number(id.slice(prefix.length))
      if (Number.isInteger(number)) return `${name} ${number}`
    }
  }
  return id
}
