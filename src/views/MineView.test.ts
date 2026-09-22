import { describe, expect, it } from 'vitest'
import type { Cycle, Entity, Layout, SeismicEvent } from '../api/types'
import { __test } from './MineView.internals'

// What a 3D scene shows is decided here, not in the scene. A wrong scene is
// harder to catch by eye than a wrong chart: an event drawn where the mine had
// no location for it yet looks exactly like one it had located.

const extent: Layout['extent'] = { min: { x: 0, y: 0, z: -1400 }, max: { x: 1600, y: 1000, z: -400 } }

function event(overrides: Partial<SeismicEvent>): SeismicEvent {
  return {
    run_id: 'run-1', sequence: 1, origin_seconds: 100, burst: null,
    truth: { x: 800, y: 500, z: -900 }, sensors: ['s01', 's02', 's03', 's04'],
    located_at_seconds: null, located: null, processed_at_seconds: null, final: null,
    ...overrides,
  }
}

const firstFix = { at: { x: 820, y: 480, z: -880 }, rms_residual_seconds: 0.004, picks: 4 }
const finalFix = { at: { x: 805, y: 498, z: -902 }, rms_residual_seconds: 0.001, picks: 4 }

function cycle(sequence: number, at: string, overrides: Partial<Cycle> = {}): Cycle {
  return {
    run_id: 'run-1', sequence, at, queues: {},
    local_ready: 0, cloud_ready: 0, local_pending: 0, cloud_pending: 0,
    action: 'maintain', plan_local: 0, plan_cloud: 0, reason: '',
    settings_version: 1, breach_expected: false, completed: 0, breached: 0,
    ...overrides,
  }
}

describe('placing the mine in the scene', () => {
  it('puts the middle of the mine at the origin', () => {
    expect(__test.toScene({ x: 800, y: 500, z: -900 }, extent)).toEqual({ x: 0, y: 0, z: 0 })
  })

  // three.js has y up. A mine's z is elevation, so it has to become the
  // scene's y — or the -1400 level would be drawn beside the -400 level
  // instead of below it.
  it('draws elevation as up, so deeper is lower', () => {
    const shallow = __test.toScene({ x: 800, y: 500, z: -400 }, extent)
    const deep = __test.toScene({ x: 800, y: 500, z: -1400 }, extent)
    expect(shallow.y).toBeGreaterThan(deep.y)
    expect(shallow.x).toBe(0)
    expect(shallow.z).toBe(0)
  })

  // Swapping two axes alone would mirror the mine: east would still be right
  // but north would point at the viewer rather than away. North is -z in a
  // right-handed scene seen from the default camera.
  it('keeps the mine the right way round, with north away from the viewer', () => {
    const north = __test.toScene({ x: 800, y: 1000, z: -900 }, extent)
    const east = __test.toScene({ x: 1600, y: 500, z: -900 }, extent)
    expect(north.z).toBeLessThan(0)
    expect(east.x).toBeGreaterThan(0)
  })

  it('scales the longest side of the mine to the same size whatever the mine', () => {
    const corner = __test.toScene({ x: 1600, y: 500, z: -900 }, extent)
    expect(corner.x).toBeCloseTo(__test.SCENE_SIZE / 2)

    const small: Layout['extent'] = { min: { x: 0, y: 0, z: -100 }, max: { x: 200, y: 50, z: 0 } }
    expect(__test.toScene({ x: 200, y: 25, z: -50 }, small).x).toBeCloseTo(__test.SCENE_SIZE / 2)
  })
})

describe('an event at a moment in the run', () => {
  const located = event({ located_at_seconds: 160, located: firstFix, processed_at_seconds: 220, final: finalFix })

  it('does not exist before it happens', () => {
    expect(__test.stateAt(located, 99)).toBe('future')
  })

  // Between happening and being located the mine knows only which sensors
  // heard it. There is nowhere to draw it without using the ground truth,
  // which is exactly what the mine does not have.
  it('is awaiting a location until enough picks are processed, and has no position', () => {
    expect(__test.stateAt(located, 100)).toBe('awaiting')
    expect(__test.stateAt(located, 159)).toBe('awaiting')
    expect(__test.positionAt(located, 159)).toBeNull()
  })

  it('is drawn at its first location once located', () => {
    expect(__test.stateAt(located, 160)).toBe('located')
    expect(__test.positionAt(located, 160)).toEqual(firstFix)
  })

  it('moves to its final location once every pick is processed', () => {
    expect(__test.stateAt(located, 220)).toBe('processed')
    expect(__test.positionAt(located, 400)).toEqual(finalFix)
  })

  // Too few sensors: processed, but there was never anything to locate.
  it('can be processed without ever being located', () => {
    const unlocatable = event({ sensors: ['s01', 's02'], processed_at_seconds: 130 })
    expect(__test.stateAt(unlocatable, 140)).toBe('unlocatable')
    expect(__test.positionAt(unlocatable, 140)).toBeNull()
  })

  it('says how far its location was from the truth, when it has one', () => {
    expect(__test.errorMetres(located, 400)).toBeCloseTo(Math.hypot(5, 2, 2))
    expect(__test.errorMetres(located, 120)).toBeNull()
  })
})

describe('the mine at a moment in the run', () => {
  const events = [
    event({ sequence: 1, origin_seconds: 10, sensors: ['s01', 's02', 's03', 's04'],
      located_at_seconds: 40, located: firstFix, processed_at_seconds: 60, final: finalFix }),
    event({ sequence: 2, origin_seconds: 50, sensors: ['s02', 's05', 's06', 's07'] }),
    event({ sequence: 3, origin_seconds: 3000, sensors: ['s01', 's02', 's03', 's04'] }),
  ]

  it('counts what has happened, what is waiting and what the mine has placed', () => {
    const scene = __test.sceneAt(events, 55, 600)
    expect(scene.counts).toEqual({ happened: 2, awaiting: 1, located: 1, unlocatable: 0 })
  })

  // An operator's problem is the work still outstanding, and the mine knows
  // which sensors that work came from. Located is not finished: an event's
  // remaining picks are still waiting, so its sensors stay marked until every
  // one is processed.
  it('marks the sensors still waiting on work, by how many events', () => {
    expect(__test.sceneAt(events, 55, 600).busySensors.get('s01')).toBe(1)

    const scene = __test.sceneAt(events, 65, 600)
    expect(Object.fromEntries(scene.busySensors)).toEqual({ s02: 1, s05: 1, s06: 1, s07: 1 })

    const both = __test.sceneAt(
      [events[1]!, event({ sequence: 4, origin_seconds: 52, sensors: ['s02', 's09', 's10', 's11'] })], 55, 600)
    expect(both.busySensors.get('s02')).toBe(2)
  })

  // A located event fades out of the scene after the window; one still
  // waiting never does, however long it waits, because that wait is the
  // thing worth seeing.
  // The view lit every sensor of an event until its last pick finished, and so
  // showed more sensors with work waiting than there was work waiting on. With
  // each pick's own time recorded, a sensor is busy only while its pick is.
  it('marks a sensor busy only while its own pick is waiting', () => {
    const partly = event({
      sequence: 7, origin_seconds: 10, sensors: ['s01', 's02', 's03', 's04', 's05'],
      located_at_seconds: 40, located: firstFix,
      picks_processed_at_seconds: [30, 40, null, 35, 90],
    })

    expect([...__test.sceneAt([partly], 36, 600).busySensors.keys()].sort()).toEqual(['s02', 's03', 's05'])
    expect([...__test.sceneAt([partly], 45, 600).busySensors.keys()].sort()).toEqual(['s03', 's05'])
  })

  // A run recorded before pick times has only the event's own times to go on.
  it('falls back to the whole event for a run that did not record pick times', () => {
    const older = event({ sequence: 8, origin_seconds: 10, sensors: ['s01', 's02'], picks_processed_at_seconds: null })
    expect(__test.sceneAt([older], 20, 600).busySensors.size).toBe(2)
  })

  it('lets old located events go but never an event still waiting', () => {
    const late = __test.sceneAt(events, 2000, 600)
    expect(late.visible.map((v) => v.event.sequence)).toEqual([2])
  })

  it('shows every event so far when the window is unbounded', () => {
    const all = __test.sceneAt(events, 2000, Infinity)
    expect(all.visible.map((v) => v.event.sequence)).toEqual([1, 2])
  })

  it('fades a located event with age, from full to nothing across the window', () => {
    const fresh = __test.sceneAt(events, 60, 600).visible.find((v) => v.event.sequence === 1)
    const older = __test.sceneAt(events, 360, 600).visible.find((v) => v.event.sequence === 1)
    expect(fresh?.age).toBe(0)
    expect(older?.age).toBeCloseTo(0.5)
  })

  it('reports how long each located event took, median first', () => {
    const scene = __test.sceneAt([
      events[0]!,
      event({ sequence: 5, origin_seconds: 20, located_at_seconds: 120, located: firstFix }),
      event({ sequence: 6, origin_seconds: 30, located_at_seconds: 40, located: firstFix }),
    ], 500, Infinity)
    expect(scene.timeToLocate).toEqual({ median: 30, max: 100 })
  })
})

describe('the autoscaler at a moment in the run', () => {
  const start = '2026-09-10T12:00:00Z'
  const cycles = [
    cycle(1, '2026-09-10T12:00:30Z', { local_ready: 1 }),
    cycle(2, '2026-09-10T12:01:00Z', { local_ready: 2 }),
    cycle(3, '2026-09-10T12:01:30Z', { local_ready: 3 }),
  ]

  it('is the last decision taken at or before that moment', () => {
    expect(__test.cycleAt(cycles, 60, start)?.local_ready).toBe(2)
    expect(__test.cycleAt(cycles, 89, start)?.local_ready).toBe(2)
    expect(__test.cycleAt(cycles, 1000, start)?.local_ready).toBe(3)
  })

  it('is nothing before the first decision', () => {
    expect(__test.cycleAt(cycles, 29, start)).toBeNull()
  })

  // Cycle times are wall-clock instants on the run's simulated clock; events
  // are offsets from the start of the scenario. They meet at simulated_start.
  it('measures a cycle from the start of the scenario', () => {
    expect(__test.scenarioSeconds(cycles[0]!, start)).toBe(30)
  })

  it('runs until the last thing that happened, whichever came last', () => {
    expect(__test.endOf(cycles, [event({ processed_at_seconds: 400 })], start)).toBe(400)
    expect(__test.endOf(cycles, [event({ origin_seconds: 20 })], start)).toBe(90)
    expect(__test.endOf([], [], start)).toBe(0)
  })

  // Every event a scenario will produce is recorded as a run starts. Taking
  // the last origin as the run's present had a live view following it jump to
  // the end of the scenario and show every event as already having happened.
  it('does not treat an event the run has not reached yet as having happened', () => {
    expect(__test.endOf(cycles, [event({ origin_seconds: 3000 })], start)).toBe(90)
  })
})

// OrbitControls turns a drag into a rotation, and a drag also ends in a click.
// Selecting whatever was under the pointer at the end of every rotation is the
// bug the previous 3D view shipped with.
describe('telling a click from a drag', () => {
  it('is a click when the pointer barely moved', () => {
    expect(__test.isClick({ x: 100, y: 100 }, { x: 103, y: 102 })).toBe(true)
  })

  it('is a drag when it moved further', () => {
    expect(__test.isClick({ x: 100, y: 100 }, { x: 112, y: 100 })).toBe(false)
  })
})

describe('reading a scenario clock', () => {
  it('reads as hours, minutes and seconds into the scenario', () => {
    expect(__test.clock(0)).toBe('0:00:00')
    expect(__test.clock(3725.6)).toBe('1:02:05')
  })
})

// A finished run opens on its most telling frame rather than on its first
// second or its last, which are usually the quietest.
describe('the moment worth opening a finished run at', () => {
  it('is when the most events were waiting for a location', () => {
    const waiting = (origin: number, locatedAt: number | null, processedAt: number | null = null) =>
      event({ origin_seconds: origin, located_at_seconds: locatedAt, located: locatedAt === null ? null : firstFix,
        processed_at_seconds: processedAt })

    expect(__test.busiestMoment([
      waiting(10, 20),
      waiting(100, 400),
      waiting(150, 300),
      waiting(160, 170),
      waiting(500, 510),
    ])).toBe(160)
  })

  // An event nobody could locate waits until its picks are done, and one that
  // never finished waits to the end.
  it('counts an unlocatable event as waiting until it was processed', () => {
    const unlocatable = event({ origin_seconds: 50, sensors: ['s01'], processed_at_seconds: 90 })
    const early = event({ origin_seconds: 10, located_at_seconds: 60, located: firstFix })
    expect(__test.busiestMoment([early, unlocatable])).toBe(50)
  })

  it('is the start when nothing ever waited', () => {
    expect(__test.busiestMoment([])).toBe(0)
  })
})

// Events are drawn a few pixels across, and a target that small is missed
// more often than hit. Picking goes to the nearest marker on screen within a
// generous radius instead of requiring the ray to touch the sphere.
describe('picking an event on screen', () => {
  const marks = [
    { x: 100, y: 100, sequence: 1 },
    { x: 130, y: 100, sequence: 2 },
    { x: 400, y: 300, sequence: 3 },
  ]

  it('takes the nearest marker within reach', () => {
    expect(__test.nearestWithin(marks, { x: 118, y: 104 }, 16)).toBe(2)
    expect(__test.nearestWithin(marks, { x: 104, y: 96 }, 16)).toBe(1)
  })

  it('takes nothing when every marker is out of reach, so a click on empty rock clears the selection', () => {
    expect(__test.nearestWithin(marks, { x: 250, y: 200 }, 16)).toBeNull()
    expect(__test.nearestWithin([], { x: 0, y: 0 }, 16)).toBeNull()
  })
})

// Four picks against four unknowns fit a location exactly wherever the solver
// puts it, so the residual is zero however wrong the location is. The first
// browser pass found an event at 0 ms residual and 657 m from the truth.
describe('whether a residual says anything', () => {
  it('says nothing at the minimum four picks', () => {
    expect(__test.residualMeaningful({ ...firstFix, picks: 4 })).toBe(false)
  })

  it('does once there is a pick more than the unknowns', () => {
    expect(__test.residualMeaningful({ ...firstFix, picks: 5 })).toBe(true)
  })
})

describe('people and vehicles', () => {
  const walker: Entity = {
    id: 'person-01', kind: 'person',
    track: [[10, 0, 0, -500], [110, 100, 0, -500], [400, 100, 0, -500], [500, 100, 100, -500]],
  }

  it('are where their track puts them, moving between waypoints and still at a stop', () => {
    expect(__test.entityAt(walker, 60)).toEqual({ x: 50, y: 0, z: -500 })
    expect(__test.entityAt(walker, 250)).toEqual({ x: 100, y: 0, z: -500 })
    expect(__test.entityAt(walker, 450)).toEqual({ x: 100, y: 50, z: -500 })
  })

  it('hold their first and last positions outside their track', () => {
    expect(__test.entityAt(walker, 0)).toEqual({ x: 0, y: 0, z: -500 })
    expect(__test.entityAt(walker, 99999)).toEqual({ x: 100, y: 100, z: -500 })
  })
})

// Playback moves the clock every frame; the ground is asked of the backend,
// so it is asked at steps rather than every frame. Paused, it is the moment on
// screen exactly — the frame someone studies is the one that must be right.
describe('when to ask for the protected ground', () => {
  it('asks at the moment on screen when paused', () => {
    expect(__test.groundMoment(1234.56, 60, false)).toBe(1234.56)
  })

  it('asks once a decision cycle while playing slowly', () => {
    expect(__test.groundMoment(1234.56, 10, true)).toBe(1230)
    expect(__test.groundMoment(1244.99, 10, true)).toBe(1230)
  })

  it('asks about four times a second of real time while playing fast', () => {
    // At 600x, a quarter of a second is 150 s of the run.
    expect(__test.groundMoment(1234.56, 600, true)).toBe(1200)
    expect(__test.groundMoment(1349.99, 600, true)).toBe(1200)
    expect(__test.groundMoment(1350, 600, true)).toBe(1350)
  })
})

// Risk in the view follows the backend's rule exactly: someone is at a level
// when they are within that level's zone around a location the mine has. The
// zones already carry the allowance for location error, so nothing is added
// here, and a second copy of the physics in the browser cannot drift from the
// first.
describe('who is at risk at a moment', () => {
  const hazardous = (overrides: Partial<SeismicEvent>) => event({
    origin_seconds: 100, located_at_seconds: 130, processed_at_seconds: 200,
    located: { at: { x: 0, y: 0, z: -500 }, rms_residual_seconds: 0, picks: 4, zones: { moderate: 400, high: 120 } },
    final: { at: { x: 20, y: 0, z: -500 }, rms_residual_seconds: 0, picks: 12, zones: { moderate: 380, high: 100, 'very-high': 40 } },
    ...overrides,
  })
  const at = (x: number): Entity => ({ id: `p-${x}`, kind: 'person', track: [[0, x, 0, -500]] })

  it('puts someone at the highest level whose zone they are inside', () => {
    const scene = __test.sceneAt([hazardous({})], 150, 600)
    const risk = __test.riskAt(scene, [at(90), at(300), at(500)], 150)

    expect(risk.get('p-90')?.level).toBe('high')
    expect(risk.get('p-300')?.level).toBe('moderate')
    expect(risk.has('p-500')).toBe(false)
  })

  it('judges from the location the mine has at that moment, first or final', () => {
    const final = __test.riskAt(__test.sceneAt([hazardous({})], 250, 600), [at(50), at(115)], 250)
    expect(final.get('p-50')?.level).toBe('very-high')
    expect(final.get('p-115')?.level).toBe('high') // 95 m from the final location
  })

  it('puts nobody at risk from an event the mine has not located', () => {
    const scene = __test.sceneAt([hazardous({ located_at_seconds: null, located: null, processed_at_seconds: null, final: null })], 150, 600)
    expect(__test.riskAt(scene, [at(0)], 150).size).toBe(0)
  })

  it('takes the worst of several events', () => {
    const near = hazardous({ sequence: 2 })
    const far = hazardous({ sequence: 3, located: { at: { x: 1000, y: 0, z: -500 }, rms_residual_seconds: 0, picks: 4, zones: { moderate: 2000 } } })
    const risk = __test.riskAt(__test.sceneAt([far, near], 150, 600), [at(90)], 150)
    expect(risk.get('p-90')).toEqual({ level: 'high', event: 2 })
  })

  it('counts who is at each level', () => {
    const risk = __test.riskAt(__test.sceneAt([hazardous({})], 250, 600), [at(10), at(90), at(300), at(900)], 250)
    expect(__test.riskCounts(risk)).toEqual({ 'very-high': 1, high: 1, moderate: 1 })
  })
})

// The simulator's answer: who was really exposed by events that happened
// recently, whether or not the mine has located them yet.
describe('who was really exposed', () => {
  it('takes the truth recorded at each event that has happened within the window', () => {
    const events = [
      event({ sequence: 1, origin_seconds: 100, exposed: [{ entity: 'person-01', level: 'high', ppv_mps: 0.3, distance_m: 40 }] }),
      event({ sequence: 2, origin_seconds: 900, exposed: [{ entity: 'person-02', level: 'moderate', ppv_mps: 0.02, distance_m: 400 }] }),
      event({ sequence: 3, origin_seconds: 5000, exposed: [{ entity: 'person-03', level: 'very-high', ppv_mps: 2, distance_m: 5 }] }),
    ]
    const truth = __test.trulyExposedAt(events, 1000, 600)
    expect([...truth.entries()]).toEqual([['person-02', { level: 'moderate', event: 2 }]])
  })
})
