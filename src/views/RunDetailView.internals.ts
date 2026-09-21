import type { Cycle } from '../api/types'
import { stack } from '../components/stack'

/**
 * The timeline arithmetic behind the run charts.
 *
 * It lives here rather than inside the view so it can be tested directly: a
 * chart that is subtly wrong is very hard to catch by looking at it, and these
 * few functions are where any such error would come from.
 */

export interface Timeline {
  elapsed: number[]
  localReady: number[]
  cloudReady: number[]
  localPlanned: number[]
  cloudPlanned: number[]
  depth: number[]
  breaches: number[]
}

/** Total jobs waiting across every priority level. */
export function totalDepth(cycle: Cycle): number {
  return Object.values(cycle.queues ?? {}).reduce((total, level) => total + level.depth, 0)
}

/**
 * Turns a run's cycles into plottable series.
 *
 * The x axis is seconds since the run's first cycle, not wall-clock time: a
 * simulation moves through its own compressed clock, and what a reader wants
 * to see is how far into the run something happened.
 *
 * Breaches accumulate rather than being shown per cycle. One or two late jobs
 * in a single cycle is noise; the running total is what shows whether a policy
 * held the line.
 */
export function buildTimeline(cycles: Cycle[]): Timeline {
  const timeline: Timeline = {
    elapsed: [], localReady: [], cloudReady: [],
    localPlanned: [], cloudPlanned: [], depth: [], breaches: [],
  }
  const first = cycles[0]
  if (!first) return timeline

  const start = new Date(first.at).getTime()
  let breaches = 0

  for (const cycle of cycles) {
    timeline.elapsed.push((new Date(cycle.at).getTime() - start) / 1000)
    timeline.localReady.push(cycle.local_ready)
    timeline.cloudReady.push(cycle.cloud_ready)
    timeline.localPlanned.push(cycle.plan_local)
    timeline.cloudPlanned.push(cycle.plan_cloud)
    timeline.depth.push(totalDepth(cycle))
    breaches += cycle.breached
    timeline.breaches.push(breaches)
  }
  return timeline
}

/** Which count of the queue a composition is: by the priority each job
 *  holds now, or by the priority it was submitted at. */
export type Basis = 'current' | 'submitted'

export interface Composition {
  /** False when some cycle did not record this count — a run recorded before
   *  submitted priority was tracked. Its chart would otherwise be empty, and an
   *  empty chart reads as a queue that never had anything in it. */
  recorded: boolean
  /** Levels that ever had work waiting, most urgent first. */
  levels: string[]
  /** Depth per level, one entry per cycle, aligned with the timeline. */
  depths: Record<string, number[]>
}

function depthsOf(cycle: Cycle, basis: Basis): Record<string, number> | null {
  if (basis === 'submitted') return cycle.depth_by_submitted_priority ?? null
  return Object.fromEntries(
    Object.entries(cycle.queues ?? {}).map(([level, snapshot]) => [level, snapshot.depth]),
  )
}

/**
 * The waiting work at each cycle, broken down by priority level.
 *
 * Levels are ordered numerically: as text, "25" sorts above "100", and the
 * stack would put the least urgent work at the bottom where the most urgent
 * belongs. A level missing from a cycle is zero there rather than a gap,
 * because every layer above it is drawn on top of it.
 */
export function buildComposition(cycles: Cycle[], basis: Basis): Composition {
  const perCycle = cycles.map((cycle) => depthsOf(cycle, basis))
  const recorded = perCycle.every((depths) => depths !== null)

  const seen = new Set<string>()
  for (const depths of perCycle) {
    for (const [level, depth] of Object.entries(depths ?? {})) {
      if (depth > 0) seen.add(level)
    }
  }
  const levels = [...seen].sort((a, b) => Number(b) - Number(a))

  const depths: Record<string, number[]> = {}
  for (const level of levels) {
    depths[level] = perCycle.map((cycleDepths) => cycleDepths?.[level] ?? 0)
  }
  return { recorded, levels, depths }
}

export interface Arrivals {
  /** Levels that ever had work arriving, most urgent first. */
  levels: string[]
  /** Jobs a second arriving at each level, one entry per cycle. */
  rates: Record<string, number[]>
}

/**
 * The work arriving at each level, cycle by cycle.
 *
 * The queue charts show only what waits, and work served the cycle it arrives
 * never waits: on the recorded rock burst P100 waited in 13 cycles of 240 and
 * arrived in 234, so it all but vanished from them. The arrival rate is
 * recorded whether or not anything waited, and is counted at the priority work
 * was submitted with.
 */
export function buildArrivals(cycles: Cycle[]): Arrivals {
  const seen = new Set<string>()
  for (const cycle of cycles) {
    for (const [level, snapshot] of Object.entries(cycle.queues ?? {})) {
      if (snapshot.arrival_rate_per_second > 0) seen.add(level)
    }
  }
  const levels = [...seen].sort((a, b) => Number(b) - Number(a))
  const rates: Record<string, number[]> = {}
  for (const level of levels) {
    rates[level] = cycles.map((cycle) => cycle.queues?.[level]?.arrival_rate_per_second ?? 0)
  }
  return { levels, rates }
}

/** Whether two compositions describe the queue identically. */
export function sameComposition(a: Composition, b: Composition): boolean {
  if (a.levels.join('|') !== b.levels.join('|')) return false
  return a.levels.every((level) => {
    const left = a.depths[level] ?? []
    const right = b.depths[level] ?? []
    return left.length === right.length && left.every((value, i) => value === right[i])
  })
}

export const __test = { buildTimeline, totalDepth, buildComposition, stack, sameComposition, buildArrivals }
