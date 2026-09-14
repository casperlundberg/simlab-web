/** The logic behind the target settings editor, extracted so it can be tested.
 *
 *  This is the highest-consequence form in the application: what `toValues`
 *  returns is PATCHed straight at a running autoscaler that holds real
 *  platform credentials and is scaling real infrastructure. A wrong conversion
 *  here does not render oddly — it changes what a controller does, and the only
 *  visible sign is a setting that did not move.
 */

/** Fills the form from the settings the autoscaler reports.
 *
 *  Nested values are skipped rather than stringified: `deadlines` is a map of
 *  priority to duration, and `String()` on it would put "[object Object]" in a
 *  text box and then send that back. Per-priority deadlines are edited
 *  elsewhere, not in this flat form.
 */
export function toStrings(settings: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'object' && value !== null) continue
    out[key] = String(value)
  }
  return out
}

/** Turns the edited form back into a settings patch.
 *
 *  Booleans are read as booleans, because `Number('false')` is NaN,
 *  `JSON.stringify` writes NaN as null, and the Go side leaves a field
 *  unchanged when it reads null — so switching dry-run off would report success
 *  and change nothing.
 *
 *  Anything that is not a finite number goes through as the operator typed it,
 *  for the same reason: the backend then refuses it and says which field and
 *  why. A refusal the operator can see beats an edit that evaporates. That
 *  includes a cleared field, which arrives as an empty string and is rejected
 *  rather than being read as "leave this alone" — in an editor pre-filled with
 *  current values, a blank box is far more likely to be an unfinished edit
 *  than an intention.
 */
export function toValues(draft: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(draft)) {
    if (raw === 'true' || raw === 'false') {
      out[key] = raw === 'true'
      continue
    }
    const numeric = Number(raw)
    out[key] = Number.isFinite(numeric) && raw.trim() !== '' ? numeric : raw
  }
  return out
}

/** A settings key as a field label. The wire names are snake_case and are what
 *  the API documents, so they stay the source of truth rather than being
 *  mapped through a second list that can drift. */
export function humanise(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export const __test = { toStrings, toValues, humanise }
