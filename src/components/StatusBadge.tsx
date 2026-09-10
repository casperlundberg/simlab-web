import type { RunStatus } from '../api/types'

export function StatusBadge({ status, active }: { status: RunStatus; active?: boolean | undefined }) {
  // A run whose process was killed sits at "running" in the database forever.
  // Saying "interrupted" is honest about what is actually known: the status
  // says running, and nothing is running it.
  if (status === 'running' && active === false) {
    return <span className="badge cancelled" title="The status says running, but nothing is running it — the process that owned this run is gone.">interrupted</span>
  }
  return <span className={`badge ${status}`}>{status}</span>
}

export function LiveDot({ connected }: { connected: boolean }) {
  return (
    <span className="faint">
      <i className={`live-dot${connected ? '' : ' off'}`} aria-hidden="true" />
      {connected ? 'live' : 'reconnecting'}
    </span>
  )
}
