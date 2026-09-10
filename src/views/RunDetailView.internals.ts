import type { Cycle } from '../api/types'

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

export const __test = { buildTimeline, totalDepth }
