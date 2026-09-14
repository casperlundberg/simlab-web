/**
 * Turning a settings form into a patch for the autoscaler.
 *
 * The rule that matters: a blank field is dropped, not sent as zero. An
 * unmentioned setting keeps the target's own value, while a zero is an
 * instruction — and sending blanks as zeroes would silently disable the cloud
 * tier, and pin the executor caps to nothing, on every run.
 */
export function numericSettings(values: Record<string, string>): Record<string, unknown> | undefined {
  const settings: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(values)) {
    if (raw === '' || raw === undefined) continue

    if (raw === 'true' || raw === 'false') {
      settings[key] = raw === 'true'
      continue
    }

    // Anything that is not a number goes through as it was typed, so the
    // backend refuses it and the user sees why. Number() would yield NaN,
    // JSON.stringify writes NaN as null, and Go leaves a field unchanged when
    // it reads null — so the edit would vanish behind a success.
    const numeric = Number(raw)
    settings[key] = Number.isFinite(numeric) ? numeric : raw
  }
  return Object.keys(settings).length ? settings : undefined
}

export const __test = { numericSettings }
