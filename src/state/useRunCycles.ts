import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Cycle, RunEvent } from '../api/types'
import { useEventStream } from './useEventStream'

/** Cycles from both sources, in sequence order, with no repeats. A later copy
 *  of a sequence replaces an earlier one: the record is the authority. */
function mergeCycles(existing: Cycle[], incoming: Cycle[]): Cycle[] {
  const bySequence = new Map<number, Cycle>()
  for (const cycle of existing) bySequence.set(cycle.sequence, cycle)
  for (const cycle of incoming) bySequence.set(cycle.sequence, cycle)
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence)
}

/** Whether a streamed cycle skips past one that never arrived. */
function missedBefore(existing: Cycle[], arriving: Cycle): boolean {
  const last = existing.at(-1)?.sequence ?? 0
  return arriving.sequence > last + 1
}

/**
 * A run's complete timeline, kept current while it is in flight.
 *
 * The stream only makes cycles arrive sooner; the API is the record. So this
 * reads every page on the way in, and goes back to the record whenever the
 * stream may have missed something — a cycle that skips ahead, a reconnection,
 * or the run ending — rather than trusting what happened to arrive.
 */
export function useRunCycles(runId: string, active: boolean): { cycles: Cycle[]; connected: boolean } {
  const queryClient = useQueryClient()
  const [cycles, setCycles] = useState<Cycle[]>([])
  const held = useRef<Cycle[]>([])

  const accept = useCallback((incoming: Cycle[]) => {
    held.current = mergeCycles(held.current, incoming)
    setCycles(held.current)
  }, [])

  // One catch-up at a time; a request for another while one is running is
  // remembered and served when it finishes, from wherever that one got to.
  const fetching = useRef(false)
  const again = useRef(false)
  const catchUp = useCallback(async () => {
    if (fetching.current) {
      again.current = true
      return
    }
    fetching.current = true
    try {
      do {
        again.current = false
        let from = held.current.at(-1)?.sequence ?? 0
        for (;;) {
          const page = await api.cycles(runId, from)
          if (page.cycles.length === 0) break
          accept(page.cycles)
          if (page.next <= from) break
          from = page.next
        }
      } while (again.current)
    } catch {
      // A failed catch-up leaves what is already held; the next trigger — a
      // cycle, a reconnection, the run ending — tries again.
    } finally {
      fetching.current = false
    }
  }, [runId, accept])

  useEffect(() => {
    held.current = []
    setCycles([])
    void catchUp()
  }, [catchUp])

  const onEvent = useCallback((event: RunEvent) => {
    if (event.type === 'cycle' && event.cycle) {
      if (missedBefore(held.current, event.cycle)) {
        void catchUp()
      } else {
        accept([event.cycle])
      }
    }
    if (event.type === 'status' || event.type === 'metrics') {
      void queryClient.invalidateQueries({ queryKey: ['run', runId] })
    }
  }, [runId, accept, catchUp, queryClient])

  const { connected } = useEventStream(runId, onEvent, active)

  // A reconnection may have missed events, and so may the moment a run ends
  // and the stream is closed behind it.
  const wasConnected = useRef(false)
  useEffect(() => {
    if (connected && !wasConnected.current && held.current.length > 0) void catchUp()
    wasConnected.current = connected
  }, [connected, catchUp])

  const wasActive = useRef(active)
  useEffect(() => {
    if (wasActive.current && !active) void catchUp()
    wasActive.current = active
  }, [active, catchUp])

  return { cycles, connected }
}

export const __test = { mergeCycles, missedBefore }
