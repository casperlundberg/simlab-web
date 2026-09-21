import { describe, expect, it } from 'vitest'

import { UNRESOLVED, cssVar, priorityToken, withAlpha } from './theme'

// This is the one place a component is allowed to know what a palette token
// resolves to, because a canvas has to be handed real colour strings. It
// existed twice, identically, in Chart.tsx and RunDetailView.tsx — and two
// copies of a colour lookup is how a tier ends up green in a badge and teal in
// the chart beside it.

describe('resolving a palette token', () => {
  it('reads the value the document defines', () => {
    document.documentElement.style.setProperty('--local', '#2f8f5b')

    expect(cssVar('--local')).toBe('#2f8f5b')
  })

  it('trims the whitespace a CSS declaration is allowed to carry', () => {
    document.documentElement.style.setProperty('--cloud', '  #8a4fbd  ')

    expect(cssVar('--cloud')).toBe('#8a4fbd')
  })

  // A token that does not exist resolves to the empty string, and an empty
  // stroke draws nothing at all. Falling back to a visible grey means a
  // mistyped token name shows up as a wrong-looking chart rather than a
  // missing line nobody notices.
  it('falls back to something visible for a token that is not defined', () => {
    expect(cssVar('--a-token-nobody-defined')).toBe(UNRESOLVED)
  })

  it('falls back rather than returning an empty stroke', () => {
    document.documentElement.style.setProperty('--blank', '')

    expect(cssVar('--blank')).toBe(UNRESOLVED)
  })
})

describe('fading a colour for an area fill', () => {
  it('converts a six-digit hex to rgba', () => {
    expect(withAlpha('#2f8f5b', 0.15)).toBe('rgba(47, 143, 91, 0.15)')
  })

  it('handles black and white without dropping a channel', () => {
    expect(withAlpha('#000000', 0.5)).toBe('rgba(0, 0, 0, 0.5)')
    expect(withAlpha('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)')
  })

  it('accepts uppercase hex, which a stylesheet is free to use', () => {
    expect(withAlpha('#2F8F5B', 0.15)).toBe('rgba(47, 143, 91, 0.15)')
  })

  // A token is free to resolve to rgb(), a named colour, or an eight-digit hex
  // with its own alpha. Parsing those as six-digit hex yields a colour from
  // nowhere; returning them untouched means the fill is opaque, which is
  // cosmetic. Cosmetic beats invisible.
  it('leaves a colour it cannot parse alone rather than mangling it', () => {
    expect(withAlpha('rgb(47, 143, 91)', 0.15)).toBe('rgb(47, 143, 91)')
    expect(withAlpha('rebeccapurple', 0.15)).toBe('rebeccapurple')
    expect(withAlpha('#2f8f5b80', 0.15)).toBe('#2f8f5b80')
    expect(withAlpha('#abc', 0.15)).toBe('#abc')
  })

  it('leaves the fallback grey alone if it ever reaches a fill', () => {
    expect(withAlpha(UNRESOLVED, 0.15)).toBe('rgba(136, 136, 136, 0.15)')
  })
})

describe('the colour a priority level wears', () => {
  // Priority is ordered, so it wears one hue stepped by urgency rather than a
  // colour per level: a reader should see which band is most urgent without a
  // legend.
  it('steps by urgency', () => {
    expect(priorityToken('400')).toBe('--priority-1')
    expect(priorityToken('100')).toBe('--priority-2')
    expect(priorityToken('50')).toBe('--priority-3')
    expect(priorityToken('25')).toBe('--priority-4')
    expect(priorityToken('0')).toBe('--priority-5')
  })

  // A scenario may use any levels. Colour follows the level's value, never its
  // rank among the levels a run happens to have, or the same level would
  // change colour between two runs.
  it('places a level nobody named by its value', () => {
    expect(priorityToken('250')).toBe('--priority-2')
    expect(priorityToken('75')).toBe('--priority-3')
    expect(priorityToken('10')).toBe('--priority-5')
    expect(priorityToken('-5')).toBe('--priority-5')
    expect(priorityToken('9000')).toBe('--priority-1')
  })
})

describe('colouring a priority level', () => {
  // Decayed work sits beneath everything submitted. Sharing the lowest
  // level's colour, it was indistinguishable from pick work at P0 in the
  // stacked chart — the very collision decaying below the floor exists to
  // avoid. It takes intent's own colour for decayed work instead.
  it('gives decayed work the colour intent uses for it, not the lowest level\'s', () => {
    expect(priorityToken('-1')).toBe('--intent-decayed')
    expect(priorityToken('0')).not.toBe(priorityToken('-1'))
  })
})
