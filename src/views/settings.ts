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
    settings[key] = raw === 'true' ? true : Number(raw)
  }
  return Object.keys(settings).length ? settings : undefined
}

export const __test = { numericSettings }
