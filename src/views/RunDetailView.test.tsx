import { describe, expect, it } from 'vitest'
import type { Cycle } from '../api/types'

// buildTimeline and totalDepth are the only real logic in this view, and they
// are what a wrong chart would come from, so they are exported for testing via
// the module's internals in a small re-implementation-free way.
import { __test } from './RunDetailView.internals'

function cycle(overrides: Partial<Cycle>): Cycle {
  return {
    run_id: 'run-1', sequence: 1, at: '2026-09-10T12:00:00Z', queues: {},
    local_ready: 0, cloud_ready: 0, local_pending: 0, cloud_pending: 0,
    action: 'maintain', plan_local: 0, plan_cloud: 0, reason: '',
    settings_version: 1, breach_expected: false, completed: 0, breached: 0,
    ...overrides,
  }
}

describe('the run timeline', () => {
  it('is empty for a run with no cycles', () => {
    expect(__test.buildTimeline([]).elapsed).toEqual([])
  })

  // The x axis is seconds since the run began, not wall-clock time: a
  // simulated run's own clock is what the reader is looking at.
  it('measures elapsed time from the first cycle', () => {
    const timeline = __test.buildTimeline([
      cycle({ sequence: 1, at: '2026-09-10T12:00:00Z' }),
      cycle({ sequence: 2, at: '2026-09-10T12:00:30Z' }),
      cycle({ sequence: 3, at: '2026-09-10T12:02:00Z' }),
    ])

    expect(timeline.elapsed).toEqual([0, 30, 120])
  })

  it('separates what was ready from what was planned', () => {
    const timeline = __test.buildTimeline([
      cycle({ local_ready: 2, plan_local: 8, cloud_ready: 0, plan_cloud: 4 }),
    ])

    expect(timeline.localReady).toEqual([2])
    expect(timeline.localPlanned).toEqual([8])
    expect(timeline.cloudPlanned).toEqual([4])
  })

  // Per-cycle breaches are hard to read; the running total is what shows
  // whether a policy held the line.
  it('accumulates breaches rather than showing them per cycle', () => {
    const timeline = __test.buildTimeline([
      cycle({ sequence: 1, breached: 2 }),
      cycle({ sequence: 2, at: '2026-09-10T12:00:30Z', breached: 0 }),
      cycle({ sequence: 3, at: '2026-09-10T12:01:00Z', breached: 5 }),
    ])

    expect(timeline.breaches).toEqual([2, 2, 7])
  })

  it('totals the queue across every priority level', () => {
    const withQueues = cycle({
      queues: {
        '100': { depth: 12, oldest_job_age_seconds: 20, arrival_rate_per_second: 1 },
        '25': { depth: 300, oldest_job_age_seconds: 900, arrival_rate_per_second: 2 },
      },
    })

    expect(__test.totalDepth(withQueues)).toBe(312)
    expect(__test.buildTimeline([withQueues]).depth).toEqual([312])
  })

  it('treats a cycle with no queues as empty rather than crashing', () => {
    expect(__test.totalDepth(cycle({ queues: undefined as never }))).toBe(0)
  })
})

describe('the queue composition', () => {
  const queues = (depths: Record<string, number>) =>
    Object.fromEntries(Object.entries(depths).map(([level, depth]) => [
      level, { depth, oldest_job_age_seconds: 0, arrival_rate_per_second: 0 },
    ]))

  it('counts the queue by the priority each job holds now, most urgent level first', () => {
    const composition = __test.buildComposition([
      cycle({ sequence: 1, queues: queues({ '25': 30, '100': 4 }), depth_by_submitted_priority: { '25': 34 } }),
      cycle({ sequence: 2, queues: queues({ '25': 10 }), depth_by_submitted_priority: { '25': 10 } }),
    ], 'current')

    expect(composition.recorded).toBe(true)
    expect(composition.levels).toEqual(['100', '25'])
    // A level with nothing waiting in a cycle is zero there, not a gap: the
    // stack underneath it has to keep its shape.
    expect(composition.depths).toEqual({ '100': [4, 0], '25': [30, 10] })
  })

  it('counts the same queue by the priority each job was submitted at', () => {
    const composition = __test.buildComposition([
      cycle({ sequence: 1, queues: queues({ '25': 30, '100': 4 }), depth_by_submitted_priority: { '25': 34 } }),
    ], 'submitted')

    expect(composition.levels).toEqual(['25'])
    expect(composition.depths).toEqual({ '25': [34] })
  })

  // Numerically, a level that is compared as a string puts "25" above "100".
  it('orders levels by number, not as text', () => {
    const composition = __test.buildComposition([
      cycle({ queues: queues({ '25': 1, '400': 1, '100': 1, '50': 1 }) }),
    ], 'current')

    expect(composition.levels).toEqual(['400', '100', '50', '25'])
  })

  // A level that only ever reported an arrival rate has nothing to draw, and a
  // legend entry for it would describe an empty band.
  it('leaves out a level that never had anything waiting', () => {
    const composition = __test.buildComposition([
      cycle({ queues: queues({ '100': 0, '25': 3 }) }),
    ], 'current')

    expect(composition.levels).toEqual(['25'])
  })

  // Runs recorded before submitted priority was tracked would otherwise draw
  // an empty chart, which reads as "nothing was ever waiting".
  it('says when a run never recorded the submitted count', () => {
    const nulled = cycle({ queues: queues({ '25': 3 }), depth_by_submitted_priority: null })
    // Absent entirely: what a backend that predates the field sends.
    const absent = cycle({ queues: queues({ '25': 3 }) })
    delete absent.depth_by_submitted_priority

    for (const old of [nulled, absent]) {
      expect(__test.buildComposition([old], 'submitted').recorded).toBe(false)
    }
  })

  it('stacks layers from the bottom up', () => {
    expect(__test.stack([[1, 2], [10, 0], [100, 5]])).toEqual([[1, 2], [11, 2], [111, 7]])
  })

  // The two charts differ only once something changes a priority after
  // submission. Saying so is more useful than two identical pictures.
  it('tells whether the two counts ever differ', () => {
    const same = [cycle({ queues: queues({ '25': 3 }), depth_by_submitted_priority: { '25': 3 } })]
    const moved = [cycle({ queues: queues({ '25': 2, '100': 1 }), depth_by_submitted_priority: { '25': 3 } })]

    expect(__test.sameComposition(
      __test.buildComposition(same, 'current'), __test.buildComposition(same, 'submitted'))).toBe(true)
    expect(__test.sameComposition(
      __test.buildComposition(moved, 'current'), __test.buildComposition(moved, 'submitted'))).toBe(false)
  })
})
