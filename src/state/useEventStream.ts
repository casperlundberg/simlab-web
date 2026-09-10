import { useEffect, useRef, useState } from 'react'
import type { RunEvent } from '../api/types'

/**
 * Subscribes to a run's event stream, or to every run when no id is given.
 *
 * The browser reconnects an EventSource on its own, and a reconnection may
 * have missed events — the backend drops them for a watcher that has fallen
 * behind rather than slowing the run down. So this reports `connected`, and
 * callers refetch from the database on reconnection rather than treating the
 * stream as the complete record.
 */
export function useEventStream(
  runId: string | undefined,
  onEvent: (event: RunEvent) => void,
  enabled = true,
): { connected: boolean } {
  const [connected, setConnected] = useState(false)

  // The handler is held in a ref so a caller can pass an inline closure
  // without tearing down and rebuilding the connection on every render.
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    if (!enabled) {
      setConnected(false)
      return
    }

    const path = runId ? `/api/runs/${runId}/events` : '/api/events'
    const source = new EventSource(path)

    const receive = (event: MessageEvent) => {
      try {
        handler.current(JSON.parse(event.data) as RunEvent)
      } catch {
        // A malformed frame is not worth tearing the stream down for.
      }
    }

    source.addEventListener('open', () => setConnected(true))
    source.addEventListener('error', () => setConnected(false))
    for (const type of ['status', 'cycle', 'metrics']) {
      source.addEventListener(type, receive as EventListener)
    }

    return () => {
      source.close()
      setConnected(false)
    }
  }, [runId, enabled])

  return { connected }
}
