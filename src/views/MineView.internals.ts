import type { Cycle, Entity, Layout, Location, Point, RiskLevel, SeismicEvent } from '../api/types'

/**
 * What the virtual mine shows at a moment in a run.
 *
 * Everything that decides what is drawn lives here rather than in the scene,
 * so it can be tested: a 3D view that is subtly wrong — an event drawn where
 * the mine had no location for it yet — looks exactly like one that is right.
 *
 * The rule the whole view keeps is the one the backend keeps: the mine is
 * drawn from what the mine knew. An event it has not located has no position,
 * and the ground truth is a separate layer, never a stand-in.
 */

/** The longest side of any mine, in scene units. */
export const SCENE_SIZE = 10

/**
 * A mine position in scene coordinates: centred on the origin, scaled so the
 * longest side is SCENE_SIZE, with elevation as up.
 *
 * three.js is y-up and right-handed. Mine z is elevation, so it becomes scene
 * y; mine y is north, which becomes scene -z so that north points away from a
 * camera looking down -z. Swapping the axes without the sign would mirror the
 * mine, and nothing about a mirrored mine looks wrong until someone compares
 * it with the plan.
 */
export function toScene(point: Point, extent: Layout['extent']): Point {
  const spanX = extent.max.x - extent.min.x
  const spanY = extent.max.y - extent.min.y
  const spanZ = extent.max.z - extent.min.z
  const scale = SCENE_SIZE / Math.max(spanX, spanY, spanZ, 1e-9)
  return {
    x: (point.x - (extent.min.x + spanX / 2)) * scale,
    y: (point.z - (extent.min.z + spanZ / 2)) * scale,
    // Subtracted from zero rather than negated, so the centre is +0 and not
    // -0, which a deep comparison tells apart.
    z: 0 - (point.y - (extent.min.y + spanY / 2)) * scale,
  }
}

export type EventState = 'future' | 'awaiting' | 'located' | 'processed' | 'unlocatable'

export function stateAt(event: SeismicEvent, t: number): EventState {
  if (t < event.origin_seconds) return 'future'
  const processed = event.processed_at_seconds !== null && event.processed_at_seconds <= t
  const located = event.located_at_seconds !== null && event.located_at_seconds <= t
  if (processed) return located || event.final ? 'processed' : 'unlocatable'
  return located ? 'located' : 'awaiting'
}

/** Where the mine had placed an event by t: its final location once every
 *  pick was processed, its first before that, nothing before it was located. */
export function positionAt(event: SeismicEvent, t: number): Location | null {
  switch (stateAt(event, t)) {
    case 'processed': return event.final ?? event.located
    case 'located': return event.located
    default: return null
  }
}

/** How far the mine's location at t was from where the event really was. */
export function errorMetres(event: SeismicEvent, t: number): number | null {
  const position = positionAt(event, t)
  if (!position) return null
  const { x, y, z } = position.at
  return Math.hypot(x - event.truth.x, y - event.truth.y, z - event.truth.z)
}

export interface VisibleEvent {
  event: SeismicEvent
  state: EventState
  position: Location | null
  /** 0 when it last changed, 1 when it is about to leave the scene. Always 0
   *  for an event still awaiting a location. */
  age: number
}

export interface SceneAt {
  visible: VisibleEvent[]
  counts: { happened: number; awaiting: number; located: number; unlocatable: number }
  /** Sensors with a pick not yet processed, and how many they are waiting on. */
  busySensors: Map<string, number>
  /** Over every event located by t, in seconds from origin to location. */
  timeToLocate: { median: number; max: number } | null
}

/**
 * The mine at t.
 *
 * A located event stays in the scene for `window` seconds after it last
 * changed and fades as it goes, so the scene shows recent activity rather
 * than a run's whole history piled on top of itself. An event still waiting
 * for a location never leaves: that wait is what an operator is living
 * through, and it is the part of the picture the autoscaler is responsible
 * for.
 */
export function sceneAt(events: SeismicEvent[], t: number, window: number): SceneAt {
  const visible: VisibleEvent[] = []
  const counts = { happened: 0, awaiting: 0, located: 0, unlocatable: 0 }
  const busySensors = new Map<string, number>()
  const delays: number[] = []

  for (const event of events) {
    const state = stateAt(event, t)
    if (state === 'future') continue
    counts.happened++

    if (state === 'awaiting') counts.awaiting++
    if (state === 'located' || state === 'processed') counts.located++
    if (state === 'unlocatable') counts.unlocatable++

    const picks = event.picks_processed_at_seconds
    event.sensors.forEach((sensor, i) => {
      // Each pick's own time when it was recorded; the event's otherwise,
      // for runs recorded before pick times were.
      const done = picks ? picks[i] ?? null : event.processed_at_seconds
      if (done === null || done > t) busySensors.set(sensor, (busySensors.get(sensor) ?? 0) + 1)
    })
    if (event.located_at_seconds !== null && event.located_at_seconds <= t) {
      delays.push(event.located_at_seconds - event.origin_seconds)
    }

    let age = 0
    if (state !== 'awaiting') {
      const changed = state === 'located' ? event.located_at_seconds! : event.processed_at_seconds!
      const since = t - changed
      if (since > window) continue
      age = Number.isFinite(window) && window > 0 ? since / window : 0
    }
    visible.push({ event, state, position: positionAt(event, t), age })
  }

  delays.sort((a, b) => a - b)
  const median = delays[Math.floor(delays.length / 2)]
  const max = delays.at(-1)
  return {
    visible, counts, busySensors,
    timeToLocate: median === undefined || max === undefined ? null : { median, max },
  }
}

/** Seconds from the start of the scenario to a cycle. */
export function scenarioSeconds(cycle: Cycle, start: string): number {
  return (new Date(cycle.at).getTime() - new Date(start).getTime()) / 1000
}

/** The last decision taken at or before t, or null before the first. */
export function cycleAt(cycles: Cycle[], t: number, start: string): Cycle | null {
  // Cycles are in sequence order, so their times are ordered too.
  let low = 0
  let high = cycles.length - 1
  let found: Cycle | null = null
  while (low <= high) {
    const middle = (low + high) >> 1
    const candidate = cycles[middle]!
    if (scenarioSeconds(candidate, start) <= t) {
      found = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return found
}

/**
 * How far a run has got, in scenario seconds: its last decision, or a location
 * or a finished event recorded after it.
 *
 * Not an event's origin. Every event a scenario will produce is recorded as
 * the run starts, so the last origin is where the scenario ends, not where the
 * run is — and a run followed live would jump there and show events that have
 * not happened yet. Locations and processing are only ever recorded once the
 * run has reached them; the last of those can fall one interval after the
 * last recorded decision, when the queue drains.
 */
export function endOf(cycles: Cycle[], events: SeismicEvent[], start: string): number {
  let end = 0
  const last = cycles.at(-1)
  if (last) end = scenarioSeconds(last, start)
  for (const event of events) {
    end = Math.max(end, event.located_at_seconds ?? 0, event.processed_at_seconds ?? 0)
  }
  return end
}

/**
 * When the most events were waiting for a location, earliest if tied.
 *
 * An event waits from its origin until it is located — or, if it never could
 * be, until its picks were all processed. One that never finished waits to
 * the end of the run.
 */
export function busiestMoment(events: SeismicEvent[]): number {
  const changes: [number, number][] = []
  for (const event of events) {
    changes.push([event.origin_seconds, +1])
    const until = event.located_at_seconds ?? event.processed_at_seconds
    if (until !== null) changes.push([until, -1])
  }
  // At one instant, departures before arrivals: an event located at the very
  // moment another happens was no longer waiting alongside it.
  changes.sort((a, b) => a[0] - b[0] || a[1] - b[1])

  let waiting = 0
  let most = 0
  let at = 0
  for (const [time, change] of changes) {
    waiting += change
    if (waiting > most) {
      most = waiting
      at = time
    }
  }
  return at
}

/** Whether a pointer that went down at one place and up at another clicked,
 *  rather than dragged the camera round. */
export function isClick(down: { x: number; y: number }, up: { x: number; y: number }): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= 5
}

/**
 * Whether a location's residual can say anything about its error.
 *
 * Three coordinates and an origin time are four unknowns, and four picks can
 * be fitted exactly wherever the solver settles: the residual comes out zero
 * whether the location is right or hundreds of metres out. Only a pick beyond
 * the four leaves something to check against. The first location of every
 * event is solved from the moment its fourth pick is processed, so this is
 * the common case rather than an edge.
 */
export function residualMeaningful(location: Location): boolean {
  return location.picks > 4
}

/** The marker nearest a point on screen, if any is within radius pixels. */
export function nearestWithin(
  marks: { x: number; y: number; sequence: number }[],
  at: { x: number; y: number },
  radius: number,
): number | null {
  let best: number | null = null
  let closest = radius
  for (const mark of marks) {
    const distance = Math.hypot(mark.x - at.x, mark.y - at.y)
    if (distance <= closest) {
      closest = distance
      best = mark.sequence
    }
  }
  return best
}

/** Where a person or vehicle is at t: interpolated along its track, and held
 *  at its first or last waypoint outside it. */
export function entityAt(entity: Entity, t: number): Point {
  const track = entity.track
  const first = track[0]
  const last = track.at(-1)
  if (!first || !last) return { x: 0, y: 0, z: 0 }
  if (t <= first[0]) return { x: first[1], y: first[2], z: first[3] }
  if (t >= last[0]) return { x: last[1], y: last[2], z: last[3] }

  // The last waypoint at or before t.
  let low = 0
  let high = track.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (track[middle]![0] <= t) low = middle
    else high = middle - 1
  }
  const a = track[low]!
  const b = track[low + 1] ?? a
  const span = b[0] - a[0]
  const f = span > 0 ? (t - a[0]) / span : 1
  return { x: a[1] + (b[1] - a[1]) * f, y: a[2] + (b[2] - a[2]) * f, z: a[3] + (b[3] - a[3]) * f }
}

/** Levels of ground motion, weakest first. */
export const RISK_LEVELS: RiskLevel[] = ['moderate', 'high', 'very-high']

const rank = (level: RiskLevel) => RISK_LEVELS.indexOf(level)

export interface Risk {
  level: RiskLevel
  /** The event whose zone it is. */
  event: number
}

/**
 * Who is at risk at t, by the mine's own estimates: for each person or vehicle,
 * the highest level whose zone they are inside, around any location in the
 * scene.
 *
 * The zones come from the backend and already carry its allowance for location
 * error, so this only measures distance against them. The ground-motion law is
 * not written again here, and so cannot come to disagree with the one that
 * judged exposure when the run was recorded.
 */
export function riskAt(scene: SceneAt, entities: Entity[], t: number): Map<string, Risk> {
  const out = new Map<string, Risk>()
  const located = scene.visible.filter((v) => v.position?.zones)
  if (!located.length) return out

  for (const entity of entities) {
    const where = entityAt(entity, t)
    for (const { event, position } of located) {
      const at = position!.at
      const distance = Math.hypot(where.x - at.x, where.y - at.y, where.z - at.z)
      for (const level of [...RISK_LEVELS].reverse()) {
        const radius = position!.zones![level]
        if (radius === undefined || distance > radius) continue
        const current = out.get(entity.id)
        if (!current || rank(level) > rank(current.level)) out.set(entity.id, { level, event: event.sequence })
        break
      }
    }
  }
  return out
}

/** How many are at each level. */
export function riskCounts(risk: Map<string, Risk>): Record<RiskLevel, number> {
  const counts: Record<RiskLevel, number> = { 'very-high': 0, high: 0, moderate: 0 }
  for (const { level } of risk.values()) counts[level]++
  return counts
}

/**
 * Who was really exposed by events that happened in the window before t: the
 * simulator's judgement at each event, from where it really was. Independent of
 * whether the mine has located them, which is the point of comparing the two.
 */
export function trulyExposedAt(events: SeismicEvent[], t: number, window: number): Map<string, Risk> {
  const out = new Map<string, Risk>()
  for (const event of events) {
    if (event.origin_seconds > t || t - event.origin_seconds > window) continue
    for (const exposure of event.exposed ?? []) {
      const current = out.get(exposure.entity)
      if (!current || rank(exposure.level) > rank(current.level)) {
        out.set(exposure.entity, { level: exposure.level, event: event.sequence })
      }
    }
  }
  return out
}

/** Scenario time as h:mm:ss. */
export function clock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const h = Math.floor(whole / 3600)
  const m = Math.floor((whole % 3600) / 60)
  const s = whole % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const __test = {
  SCENE_SIZE, toScene, stateAt, positionAt, errorMetres, sceneAt,
  scenarioSeconds, cycleAt, endOf, busiestMoment, isClick, nearestWithin, residualMeaningful, clock,
  entityAt, riskAt, riskCounts, trulyExposedAt,
}
