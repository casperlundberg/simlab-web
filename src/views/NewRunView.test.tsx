import { describe, expect, it } from 'vitest'
import { __test } from './settings'

describe('turning a settings form into a patch', () => {
  // An unmentioned setting keeps the target's own value; a zero would be an
  // instruction to set it to zero. Sending blanks as zeroes would silently
  // disable the cloud tier on every run.
  it('drops blank fields rather than sending them as zero', () => {
    expect(__test.numericSettings({ local_executor_cap: '', cloud_executor_cap: '40' }))
      .toEqual({ cloud_executor_cap: 40 })
  })

  it('sends nothing at all when nothing was filled in', () => {
    expect(__test.numericSettings({ local_executor_cap: '', dry_run: '' })).toBeUndefined()
  })

  it('keeps a deliberate zero, which is a real instruction', () => {
    expect(__test.numericSettings({ cloud_executor_cap: '0' })).toEqual({ cloud_executor_cap: 0 })
  })

  it('sends a checkbox as a boolean, not the string "true"', () => {
    expect(__test.numericSettings({ dry_run: 'true' })).toEqual({ dry_run: true })
  })

  it('keeps a fractional value intact', () => {
    expect(__test.numericSettings({ safety_factor: '1.25' })).toEqual({ safety_factor: 1.25 })
  })

  // The symmetric case to 'true'. Number('false') is NaN, JSON.stringify turns
  // NaN into null, and Go leaves a field unchanged when it reads null — so an
  // explicit "off" would arrive as "leave it alone" and the UI would report
  // success having changed nothing.
  it('sends an explicit false as a boolean, not as NaN', () => {
    expect(__test.numericSettings({ dry_run: 'false' })).toEqual({ dry_run: false })
  })

  // Same silent failure, reached from a value that is simply not a number.
  // Passing it through unchanged makes the backend reject it, which the user
  // sees; NaN would be swallowed.
  it('passes a value that is not a number through, so the backend rejects it', () => {
    expect(__test.numericSettings({ local_executor_cap: 'twelve' }))
      .toEqual({ local_executor_cap: 'twelve' })
  })
})
