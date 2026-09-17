import type {
  Cycle, Entity, EntityKind, IntentChange, IntentClass, IntentSettings, IntentState, IntentTransition,
  Point, SeismicEvent,
} from '../api/types'
import { entityAt } from './MineView.internals'

/**
 * Everything about intent that decides what the pages show or send.
 *
 * The editor's output is PATCHed at a run in flight, so it gets the same care
 * as a settings patch: a blank number is never sent as zero, a value that is
 * not a number goes through as typed so the backend refuses it visibly, and
 * only what changed is sent, so an edit cannot quietly undo a change somebody
 * else made to a field this form did not touch.
 */

/** What the backend fills in for a run that does not say — kept here only to
 *  start a new run's form from, never to decide anything on the backend's
 *  behalf. */
export const DEFAULT_INTENT: IntentSettings = {
  mode: 'decay',
  knowledge: 'estimate',
  pre_location: false,
  pre_location_magnitude: 1.5,
  protect: ['person', 'crewed-vehicle', 'autonomous-vehicle'],
  lookahead_seconds: 300,
  protect_level: 'moderate',
  promote_level: 'high',
  margin_m: 0,
  location_uncertainty_m: 50,
  decay_to: 0,
  promote_to: 400,
  deadline_from: 'arrival',
  restore: true,
  burst_exempt: ['restored'],
}

/** The form: numbers as typed, so a half-typed value is not lost to parsing. */
export type IntentDraft = {
  [K in keyof IntentSettings]: IntentSettings[K] extends number ? string : IntentSettings[K]
}

const NUMBERS = [
  'pre_location_magnitude', 'lookahead_seconds', 'margin_m', 'location_uncertainty_m', 'decay_to', 'promote_to',
] as const satisfies readonly (keyof IntentSettings)[]

export function toDraft(settings: IntentSettings): IntentDraft {
  const draft = { ...settings } as unknown as Record<string, unknown>
  for (const key of NUMBERS) draft[key] = String(settings[key])
  return draft as IntentDraft
}

/** Only what the draft changes from base. Numbers that parse are numbers; a
 *  blank keeps base; anything else goes through as typed. */
export function intentPatch(draft: IntentDraft, base: IntentSettings): Partial<IntentSettings> {
  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(base) as (keyof IntentSettings)[]) {
    const value = draft[key] as unknown
    if ((NUMBERS as readonly string[]).includes(key)) {
      const raw = String(value ?? '').trim()
      if (raw === '') continue
      const numeric = Number(raw)
      const sent = Number.isFinite(numeric) ? numeric : raw
      if (sent !== base[key]) patch[key] = sent
      continue
    }
    if (Array.isArray(value)) {
      const before = [...(base[key] as string[])].sort().join(',')
      if ([...value].sort().join(',') !== before) patch[key] = value
      continue
    }
    if (value !== base[key]) patch[key] = value
  }
  return patch as Partial<IntentSettings>
}

/** The whole draft as a document, for a run about to be created: what the
 *  form shows is what the run gets, rather than whatever the backend's
 *  defaults happen to be. A blank number is left out, and takes the default. */
export function intentDocument(draft: IntentDraft): Partial<IntentSettings> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(draft)) {
    if ((NUMBERS as readonly string[]).includes(key)) {
      const raw = String(value ?? '').trim()
      if (raw === '') continue
      const numeric = Number(raw)
      out[key] = Number.isFinite(numeric) ? numeric : raw
      continue
    }
    out[key] = value
  }
  return out as Partial<IntentSettings>
}

/** A list with an item switched on or off, in a stable order. */
export function toggled<T extends string>(list: T[], item: T, on: boolean, order: readonly T[]): T[] {
  const set = new Set(list)
  if (on) set.add(item)
  else set.delete(item)
  return order.filter((x) => set.has(x))
}

export const KINDS: readonly EntityKind[] = ['person', 'crewed-vehicle', 'autonomous-vehicle']
export const CLASSES: readonly IntentClass[] = ['decayed', 'promoted', 'restored']

/** Intent in one line, for a heading or a list. */
export function describeIntent(s: IntentSettings): string {
  if (s.mode === 'off') return 'off — every job keeps its submitted priority'
  const what = { decay: 'decay', promote: 'promote', both: 'decay and promote' }[s.mode]
  const parts = [
    what,
    s.knowledge === 'truth' ? 'from the truth (oracle)' : s.pre_location ? 'from estimates and sensors' : 'from estimates',
    s.lookahead_seconds > 0 ? `${minutes(s.lookahead_seconds)} ahead` : 'where things are now',
  ]
  if (s.mode !== 'promote' && !s.restore) parts.push('decay is final')
  if (s.deadline_from === 'change') parts.push('clock restarts on a change')
  if (s.burst_exempt.length) parts.push(`${s.burst_exempt.join(' and ')} work exempt from cloud burst`)
  return parts.join(' · ')
}

function minutes(seconds: number): string {
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${seconds} s`
}

/** The intent change in force at a cycle, or null before any was recorded. */
export function intentAtCycle(changes: IntentChange[], sequence: number): IntentChange | null {
  let found: IntentChange | null = null
  for (const change of changes) {
    if (change.cycle <= sequence && (!found || change.version > found.version)) found = change
  }
  return found
}

/** The mine's judgement of an event at t: the last transition at or before
 *  it, or null — the work is where it was submitted — before the first. */
export function eventIntentAt(event: SeismicEvent, t: number): IntentTransition | null {
  let found: IntentTransition | null = null
  for (const transition of event.intent ?? []) {
    if (transition.at_seconds > t) break
    found = transition
  }
  return found
}

/** How events with work still outstanding at t stand with intent. */
export function intentCounts(events: SeismicEvent[], t: number): Record<IntentState, number> {
  const counts: Record<IntentState, number> = { unknown: 0, kept: 0, decayed: 0, promoted: 0 }
  for (const event of events) {
    if (event.origin_seconds > t) continue
    if (event.processed_at_seconds !== null && event.processed_at_seconds <= t) continue
    const judged = eventIntentAt(event, t)
    counts[judged?.state ?? 'unknown']++
  }
  return counts
}

/**
 * Where each protected entity is and is going over the lookahead from t: its
 * position now, every waypoint before the lookahead ends, and its position
 * then. The same path the backend measures distance to — drawn, it is the
 * ground intent is protecting.
 */
export function protectedPaths(entities: Entity[], t: number, settings: IntentSettings): { entity: Entity; points: Point[] }[] {
  if (settings.mode === 'off') return []
  const until = t + settings.lookahead_seconds
  return entities
    .filter((entity) => settings.protect.includes(entity.kind) && entity.track.length > 0)
    .map((entity) => {
      const points = [entityAt(entity, t)]
      if (settings.lookahead_seconds > 0) {
        for (const [at, x, y, z] of entity.track) {
          if (at > t && at < until) points.push({ x, y, z })
        }
        points.push(entityAt(entity, until))
      }
      return { entity, points }
    })
}

export interface IntentSeries {
  /** False when no cycle recorded intent — a run from before it existed. */
  recorded: boolean
  decayed: (number | null)[]
  promoted: (number | null)[]
  exempt: (number | null)[]
  /** Cycles in which the autoscaler predicted only breaches of exempt work. */
  accepted: number
}

/** Waiting jobs by what intent did to them, one entry per cycle, aligned with
 *  the run's timeline. A cycle that recorded nothing is a gap, not a zero. */
export function intentSeries(cycles: Cycle[]): IntentSeries {
  const out: IntentSeries = { recorded: false, decayed: [], promoted: [], exempt: [], accepted: 0 }
  for (const cycle of cycles) {
    const intent = cycle.intent
    out.recorded ||= Boolean(intent)
    out.decayed.push(intent ? intent.decayed : null)
    out.promoted.push(intent ? intent.promoted : null)
    out.exempt.push(intent ? intent.exempt : null)
    if (cycle.breaches_exempt_only) out.accepted++
  }
  return out
}

export interface Reach {
  sequence: number
  at: Point
  /** How far the deciding level of ground motion reached, in metres. */
  radius: number
  state: IntentState
}

/**
 * The sphere each judged event's decision was made with, at t: centred where
 * intent took the event to be — its first location, where it really was under
 * the oracle, or the first sensor to trigger before a location — with the
 * radius the decision measured protected routes against. Kept and promoted
 * spheres are the rock whose work stays important; decayed ones reached nobody.
 */
export function reachSpheres(events: SeismicEvent[], sensors: Map<string, Point>, t: number): Reach[] {
  const out: Reach[] = []
  for (const event of events) {
    if (event.origin_seconds > t) continue
    if (event.processed_at_seconds !== null && event.processed_at_seconds <= t) continue
    const judged = eventIntentAt(event, t)
    if (!judged || judged.reach_m <= 0 || judged.state === 'unknown') continue
    let at: Point | undefined
    switch (judged.basis) {
      case 'location': at = event.located?.at; break
      case 'truth': at = event.truth; break
      case 'sensors': at = event.sensors[0] === undefined ? undefined : sensors.get(event.sensors[0]); break
    }
    if (at) out.push({ sequence: event.sequence, at, radius: judged.reach_m, state: judged.state })
  }
  return out
}

export const STATE_WORDS: Record<IntentState, string> = {
  unknown: 'not yet judged',
  kept: 'kept at its submitted priority',
  decayed: 'decayed',
  promoted: 'promoted',
}
