/** Reading palette tokens out of CSS, for the things that cannot be styled in
 *  CSS at all.
 *
 *  A canvas chart has to be handed actual colour strings, so it is the one
 *  place a component legitimately needs to know what `--local` resolves to.
 *  That is the only reason this exists — everything that can take a class or a
 *  `var()` should, because a second set of colours in TypeScript is exactly how
 *  a tier ends up green in a badge and teal in the chart beside it.
 *
 *  This lived twice, identically, in Chart.tsx and RunDetailView.tsx. Two
 *  copies of a colour lookup is the same problem one step removed.
 */

/** Used when the document is not available to read a token from: during
 *  server-side rendering, and in a test environment with no real stylesheet.
 *  Deliberately a neutral grey — visible enough that a chart drawn with it
 *  looks wrong rather than invisible, which is what makes the fallback
 *  noticeable instead of silently shipping.
 */
export const UNRESOLVED = '#888888'

/** Resolves a CSS custom property to its current value, so a chart follows
 *  the theme rather than carrying its own divergent palette. */
export function cssVar(name: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return UNRESOLVED
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || UNRESOLVED
}

/** Fades a resolved colour, for the area fill under a line.
 *
 *  Only six-digit hex is converted. A token that resolved to `rgb()`, a named
 *  colour or an eight-digit hex is returned untouched rather than mangled: an
 *  area fill at full opacity is a cosmetic problem, and a colour parsed wrong
 *  is an invisible chart.
 */
export function withAlpha(colour: string, alpha: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(colour)) {
    const value = Number.parseInt(colour.slice(1), 16)
    // eslint-disable-next-line no-bitwise
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
  }
  return colour
}

/** The palette token a priority level wears.
 *
 *  Priority is ordered, so it is one hue stepped by urgency — `--priority-1`
 *  the most urgent — rather than a distinct colour per level. The step is
 *  chosen by the level's value, not by its rank among the levels one run
 *  happens to have: rank would give the same level a different colour in two
 *  runs that are being compared side by side.
 */
export function priorityToken(priority: string): string {
  const level = Number(priority)
  if (level >= 400) return '--priority-1'
  if (level >= 100) return '--priority-2'
  if (level >= 50) return '--priority-3'
  if (level >= 25) return '--priority-4'
  return '--priority-5'
}
