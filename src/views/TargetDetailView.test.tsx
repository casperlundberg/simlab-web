import { describe, expect, it } from 'vitest'

import { __test } from './TargetDetailView.internals'

// The settings editor had no tests, and of everything in this app it is the
// one that most needed them: what it produces is PATCHed at a running
// autoscaler that holds real platform credentials and is scaling real
// infrastructure. Getting a conversion wrong here does not look wrong — it
// changes what a controller does, and the only symptom is a setting that did
// not move.

describe('filling the editor from what the autoscaler reports', () => {
  it('turns every flat setting into a string the form can hold', () => {
    expect(__test.toStrings({ local_executor_cap: 50, safety_factor: 1.15, dry_run: false }))
      .toEqual({ local_executor_cap: '50', safety_factor: '1.15', dry_run: 'false' })
  })

  // deadlines is a map of priority to duration. String() on it yields
  // "[object Object]", which would then be sent back as the new value.
  it('skips a nested setting rather than stringifying it into the form', () => {
    const got = __test.toStrings({
      local_executor_cap: 50,
      deadlines: { '100': 60, '50': 300 },
    })

    expect(got).toEqual({ local_executor_cap: '50' })
    expect(got.deadlines).toBeUndefined()
  })

  it('keeps a null, which is a value the operator should see rather than a nested one', () => {
    expect(__test.toStrings({ database_url: null })).toEqual({ database_url: 'null' })
  })
})

describe('turning the edited form into a settings patch', () => {
  it('sends numbers as numbers', () => {
    expect(__test.toValues({ local_executor_cap: '50', safety_factor: '1.15' }))
      .toEqual({ local_executor_cap: 50, safety_factor: 1.15 })
  })

  it('sends a zero, which is a real cap and not an absent one', () => {
    expect(__test.toValues({ cloud_executor_cap: '0' })).toEqual({ cloud_executor_cap: 0 })
  })

  // Number('false') is NaN, JSON.stringify writes NaN as null, and Go leaves a
  // field unchanged when it reads null. Switching dry-run off would have
  // reported success and changed nothing — on the setting whose whole purpose
  // is to stop a target touching real infrastructure.
  it('sends an explicit false as a boolean', () => {
    expect(__test.toValues({ dry_run: 'false' })).toEqual({ dry_run: false })
  })

  it('sends an explicit true as a boolean', () => {
    expect(__test.toValues({ dry_run: 'true' })).toEqual({ dry_run: true })
  })

  // The same silent failure reached from a typo. Passing it through means the
  // backend refuses it and names the field; NaN would be swallowed.
  it('passes a value that is not a number through, so the backend rejects it', () => {
    expect(__test.toValues({ local_executor_cap: 'fifty' }))
      .toEqual({ local_executor_cap: 'fifty' })
  })

  // In an editor pre-filled with current values, a cleared box is far more
  // likely to be an unfinished edit than an instruction. Number('') is 0, so
  // without the blank check this would quietly set the cap to zero — which for
  // local_executor_cap means a target that can never scale up again.
  it('does not read a cleared field as zero', () => {
    expect(__test.toValues({ local_executor_cap: '' }))
      .toEqual({ local_executor_cap: '' })
  })

  it('does not read a field of spaces as zero either', () => {
    expect(__test.toValues({ local_executor_cap: '   ' }))
      .toEqual({ local_executor_cap: '   ' })
  })

  it('keeps a negative value, so the backend can say why it is wrong', () => {
    expect(__test.toValues({ safety_factor: '-1' })).toEqual({ safety_factor: -1 })
  })

  // Infinity is finite:false, so it goes through as typed and is refused.
  // Silently sending it would be a cap no cloud budget survives.
  it('does not send an infinity as a number', () => {
    expect(__test.toValues({ cloud_executor_cap: 'Infinity' }))
      .toEqual({ cloud_executor_cap: 'Infinity' })
  })

  it('sends nothing for an empty form', () => {
    expect(__test.toValues({})).toEqual({})
  })
})

describe('labelling a settings field', () => {
  it('reads the wire name as a sentence', () => {
    expect(__test.humanise('local_executor_cap')).toBe('Local executor cap')
    expect(__test.humanise('safety_factor')).toBe('Safety factor')
  })

  it('leaves a single word alone but for its capital', () => {
    expect(__test.humanise('horizon')).toBe('Horizon')
  })

  it('survives an empty key rather than throwing in a render', () => {
    expect(__test.humanise('')).toBe('')
  })
})

// A round trip has to be lossless for the fields the form actually edits, or
// saving without changing anything would still rewrite settings. The form is
// pre-filled from the autoscaler and submitted whole, so every save sends
// every flat field back.
describe('a settings round trip', () => {
  it('returns the flat settings unchanged when nothing was edited', () => {
    const reported = {
      local_executor_cap: 50,
      cloud_executor_cap: 200,
      min_local_executors: 1,
      safety_factor: 1.15,
      dry_run: false,
    }

    expect(__test.toValues(__test.toStrings(reported))).toEqual(reported)
  })
})
