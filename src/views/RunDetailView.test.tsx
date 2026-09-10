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
