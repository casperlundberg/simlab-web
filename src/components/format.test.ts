import { describe, expect, it } from 'vitest'
import { count, duration, executorHours, nanoseconds, percent, priorityLabel } from './format'

describe('formatting', () => {
  it('scales a duration to a unit a person reads', () => {
    expect(duration(0.25)).toBe('250ms')
    expect(duration(4.2)).toBe('4.2s')
    expect(duration(45)).toBe('45s')
    expect(duration(600)).toBe('10.0m')
    expect(duration(7200)).toBe('2.0h')
    expect(duration(360000)).toBe('4.2d')
  })

  it('turns Go’s nanoseconds into something readable', () => {
    expect(nanoseconds(15e9)).toBe('15s')
  })

  it('says nothing rather than NaN for a missing value', () => {
    expect(duration(Number.NaN)).toBe('—')
    expect(count(Number.NaN)).toBe('—')
    expect(percent(Number.NaN)).toBe('—')
  })

  // A breach rate of one in a thousand is the interesting case, and rounding
  // it to 0% would hide exactly what the run was measuring.
  it('keeps a small breach rate visible', () => {
    expect(percent(0.0004)).toBe('<0.1%')
    expect(percent(0.032)).toBe('3.2%')
    expect(percent(0.5)).toBe('50%')
    expect(percent(0)).toBe('0%')
  })

  it('reports executor time in hours, which is what gets compared', () => {
    expect(executorHours(7200)).toBe('2.0')
  })

  it('names a priority level so the table is readable without a legend', () => {
    expect(priorityLabel('100')).toBe('P100 associate')
    expect(priorityLabel('25')).toBe('P25 pick')
    // A level the workload invented still renders, just without a name.
    expect(priorityLabel('7')).toBe('P7')
  })
})
