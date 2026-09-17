import { describe, expect, it } from 'vitest'
import type { Cycle, Entity, IntentChange, SeismicEvent } from '../api/types'
import {
  DEFAULT_INTENT, describeIntent, eventIntentAt, intentAtCycle, intentCounts, intentDocument, intentPatch, intentSeries,
  protectedPaths, reachSpheres, toDraft, toggled, CLASSES,
} from './intent'

// The editor's patch is sent to a run in flight; what the mine draws as
// protected is what the backend measured against. Both are decided here.

describe('turning the intent form into a patch', () => {
  it('sends nothing when nothing changed', () => {
    expect(intentPatch(toDraft(DEFAULT_INTENT), DEFAULT_INTENT)).toEqual({})
  })

  // Sending the whole form would undo, field by field, anything another
  // operator changed since this form was loaded.
  it('sends only the fields that changed', () => {
    const draft = { ...toDraft(DEFAULT_INTENT), mode: 'both' as const, lookahead_seconds: '90' }
    expect(intentPatch(draft, DEFAULT_INTENT)).toEqual({ mode: 'both', lookahead_seconds: 90 })
  })

  it('never sends a blank number as zero', () => {
    const draft = { ...toDraft(DEFAULT_INTENT), location_uncertainty_m: '' }
    expect(intentPatch(draft, DEFAULT_INTENT)).toEqual({})
  })

  it('keeps a deliberate zero, which is a real instruction', () => {
    const draft = { ...toDraft(DEFAULT_INTENT), lookahead_seconds: '0' }
    expect(intentPatch(draft, DEFAULT_INTENT)).toEqual({ lookahead_seconds: 0 })
  })

  // NaN would be written as null, which the backend reads as "unchanged":
  // the edit would vanish behind a success.
  it('passes a value that is not a number through as typed, so the backend refuses it', () => {
    const draft = { ...toDraft(DEFAULT_INTENT), margin_m: 'wide' }
    expect(intentPatch(draft, DEFAULT_INTENT)).toEqual({ margin_m: 'wide' })
  })

  it('sends a list only when its members changed, whatever their order', () => {
    const reordered = { ...toDraft(DEFAULT_INTENT), protect: ['autonomous-vehicle', 'person', 'crewed-vehicle'] as const }
    expect(intentPatch({ ...reordered, protect: [...reordered.protect] }, DEFAULT_INTENT)).toEqual({})
    const fewer = { ...toDraft(DEFAULT_INTENT), protect: ['person' as const] }
    expect(intentPatch(fewer, DEFAULT_INTENT)).toEqual({ protect: ['person'] })
  })

  it('sends an explicit false', () => {
    const draft = { ...toDraft(DEFAULT_INTENT), restore: false }
    expect(intentPatch(draft, DEFAULT_INTENT)).toEqual({ restore: false })
  })

  it('sends a new run the whole form, leaving out only blank numbers', () => {
    const draft = { ...toDraft(DEFAULT_INTENT), margin_m: '', lookahead_seconds: '120' }
    const document = intentDocument(draft)
    expect(document.lookahead_seconds).toBe(120)
    expect(document).not.toHaveProperty('margin_m')
    expect(document.mode).toBe('decay')
    expect(document.burst_exempt).toEqual([])
  })

  it('switches list members on and off in a stable order', () => {
    expect(toggled(['restored'], 'decayed', true, CLASSES)).toEqual(['decayed', 'restored'])
    expect(toggled(['decayed', 'restored'], 'decayed', false, CLASSES)).toEqual(['restored'])
  })
})

describe('describing intent', () => {
  it('says off plainly', () => {
    expect(describeIntent({ ...DEFAULT_INTENT, mode: 'off' })).toMatch(/^off/)
  })

  it('names what an operator would need to know at a glance', () => {
    const text = describeIntent({
      ...DEFAULT_INTENT, mode: 'both', knowledge: 'truth', restore: false, burst_exempt: ['promoted', 'restored'],
    })
    expect(text).toContain('decay and promote')
    expect(text).toContain('oracle')
    expect(text).toContain('decay is final')
    expect(text).toContain('promoted and restored work exempt from cloud burst')
  })
})

function change(version: number, cycle: number, mode: IntentChange['settings']['mode']): IntentChange {
  return { version, cycle, source: version === 1 ? 'initial' : 'operator', settings: { ...DEFAULT_INTENT, mode }, recorded_at: '' }
}

describe('intent over a run', () => {
  const changes = [change(1, 1, 'decay'), change(3, 40, 'off')]

  it('is the change in force at a cycle', () => {
    expect(intentAtCycle(changes, 39)?.settings.mode).toBe('decay')
    expect(intentAtCycle(changes, 40)?.settings.mode).toBe('off')
    expect(intentAtCycle(changes, 0)).toBeNull()
  })

  const event = (overrides: Partial<SeismicEvent>): SeismicEvent => ({
    run_id: 'run-1', sequence: 1, origin_seconds: 100, burst: null, truth: { x: 0, y: 0, z: 0 }, sensors: ['a'],
    located_at_seconds: null, located: null, processed_at_seconds: null, final: null, ...overrides,
  })
  const judged = event({
    intent: [
      { at_seconds: 150, state: 'decayed', basis: 'location', distance_m: 600, reach_m: 300 },
      { at_seconds: 300, state: 'kept', basis: 'location', entity: 'person-01', distance_m: 200, reach_m: 300 },
    ],
  })

  it('judges an event by its last transition so far', () => {
    expect(eventIntentAt(judged, 149)).toBeNull()
    expect(eventIntentAt(judged, 150)?.state).toBe('decayed')
    expect(eventIntentAt(judged, 400)?.state).toBe('kept')
  })

  it('counts only events with work still outstanding', () => {
    const events = [
      judged,
      event({ sequence: 2, origin_seconds: 120 }),
      event({ sequence: 3, origin_seconds: 50, processed_at_seconds: 140 }),
      event({ sequence: 4, origin_seconds: 900 }),
    ]
    expect(intentCounts(events, 200)).toEqual({ unknown: 1, kept: 0, decayed: 1, promoted: 0 })
  })

  // A gap, not a zero: a run from before intent recorded nothing, and a zero
  // would claim that nothing was decayed.
  it('charts what intent did to the queue, with gaps where nothing was recorded', () => {
    const cycle = (intent: NonNullable<Cycle['intent']> | null, accepted = false): Cycle => ({
      run_id: 'run-1', sequence: 1, at: '', queues: {}, local_ready: 0, cloud_ready: 0, local_pending: 0,
      cloud_pending: 0, action: '', plan_local: 0, plan_cloud: 0, reason: '', settings_version: 1,
      breach_expected: false, completed: 0, breached: 0, intent, breaches_exempt_only: accepted,
    })
    const series = intentSeries([
      cycle(null),
      cycle({ version: 1, decayed: 12, promoted: 3, exempt: 5, changed: 20, too_late: 1 }, true),
    ])
    expect(series.recorded).toBe(true)
    expect(series.decayed).toEqual([null, 12])
    expect(series.exempt).toEqual([null, 5])
    expect(series.accepted).toBe(1)
    expect(intentSeries([cycle(null)]).recorded).toBe(false)
  })
})

describe('where intent decided', () => {
  const base = (overrides: Partial<SeismicEvent>): SeismicEvent => ({
    run_id: 'run-1', sequence: 1, origin_seconds: 10, burst: null, truth: { x: 1, y: 2, z: 3 }, sensors: ['s1', 's2'],
    located_at_seconds: 20, located: { at: { x: 10, y: 20, z: 30 }, rms_residual_seconds: 0, picks: 4 },
    processed_at_seconds: null, final: null, ...overrides,
  })
  const sensors = new Map([['s1', { x: 100, y: 200, z: 300 }]])

  it('centres each sphere on what the decision was made from', () => {
    const judged = (basis: string) => base({
      intent: [{ at_seconds: 20, state: 'decayed', basis, distance_m: 500, reach_m: 250 }],
    })
    expect(reachSpheres([judged('location')], sensors, 30)[0]).toMatchObject({ at: { x: 10, y: 20, z: 30 }, radius: 250, state: 'decayed' })
    expect(reachSpheres([judged('truth')], sensors, 30)[0]?.at).toEqual({ x: 1, y: 2, z: 3 })
    expect(reachSpheres([judged('sensors')], sensors, 30)[0]?.at).toEqual({ x: 100, y: 200, z: 300 })
  })

  it('draws nothing for an event not judged yet, let go by intent switched off, or finished', () => {
    const off = base({ intent: [{ at_seconds: 20, state: 'kept', basis: 'off', distance_m: 0, reach_m: 0 }] })
    const finished = base({
      processed_at_seconds: 25, intent: [{ at_seconds: 20, state: 'kept', basis: 'location', distance_m: 5, reach_m: 80 }],
    })
    expect(reachSpheres([base({}), off, finished], sensors, 30)).toEqual([])
  })
})

describe('the ground intent protects', () => {
  const walker: Entity = {
    id: 'person-01', kind: 'person',
    track: [[0, 0, 0, -500], [100, 100, 0, -500], [200, 100, 100, -500]],
  }
  const hauler: Entity = { id: 'autonomous-vehicle-01', kind: 'autonomous-vehicle', track: [[0, 5, 5, -500]] }

  it('follows each protected entity from now to the end of the lookahead', () => {
    const [path] = protectedPaths([walker], 50, { ...DEFAULT_INTENT, lookahead_seconds: 100 })
    expect(path?.points).toEqual([{ x: 50, y: 0, z: -500 }, { x: 100, y: 0, z: -500 }, { x: 100, y: 50, z: -500 }])
  })

  it('is only where things are now with no lookahead', () => {
    const [path] = protectedPaths([walker], 50, { ...DEFAULT_INTENT, lookahead_seconds: 0 })
    expect(path?.points).toEqual([{ x: 50, y: 0, z: -500 }])
  })

  it('leaves out kinds that are not protected, and everything with intent off', () => {
    expect(protectedPaths([walker, hauler], 0, { ...DEFAULT_INTENT, protect: ['person'] })).toHaveLength(1)
    expect(protectedPaths([walker, hauler], 0, { ...DEFAULT_INTENT, mode: 'off' })).toHaveLength(0)
  })
})
