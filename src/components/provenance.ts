import type { Build } from '../api/types'

/** A build as a reader needs it: the version, and the commit it is.
 *
 *  A development version's build metadata repeats the commit, so it is dropped
 *  here in favour of the commit itself; and a modified build says so wherever
 *  it is named, because it cannot be rebuilt from that commit. */
export function describeBuild(build: Build | null | undefined): string {
  if (!build || (!build.version && !build.commit)) return 'unknown build'
  const version = build.version.split('+')[0] ?? ''
  const short = build.commit.slice(0, 7)
  const detail = [short, build.modified ? 'modified' : ''].filter(Boolean).join(', ')
  if (!version) return detail
  return detail ? `${version} (${detail})` : version
}

/** The command that rebuilds a run's code at its recorded commits and replays
 *  it from its provenance, run from the workspace root. */
export function reproduceCommand(runId: string): string {
  return `make -C platform-experiments reproduce RUN=${runId}`
}
