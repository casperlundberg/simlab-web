import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api/client'
import type { Cycle } from '../api/types'
import { __test, useRunCycles } from './useRunCycles'

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = []
  constructor(readonly url: string) {
    super()
    FakeEventSource.instances.push(this)
  }
  close() {}
  emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }))
  }
}

function cycle(sequence: number): Cycle {
  return {
    run_id: 'run-1', sequence, at: '2026-09-10T12:00:00Z', queues: {},
    local_ready: 0, cloud_ready: 0, local_pending: 0, cloud_pending: 0,
    action: 'maintain', plan_local: 0, plan_cloud: 0, reason: '',
    settings_version: 1, breach_expected: false, completed: 0, breached: 0,
  }
}

/** A backend holding cycles 1..n that serves them `page` at a time. */
function serve(held: () => number, page = 2) {
  return vi.spyOn(api, 'cycles').mockImplementation(async (_id: string, from = 0) => {
    const cycles: Cycle[] = []
    for (let s = from + 1; s <= Math.min(held(), from + page); s++) cycles.push(cycle(s))
    return { cycles, next: cycles.at(-1)?.sequence ?? from }
  })
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
}

function stream(): FakeEventSource {
  const source = FakeEventSource.instances.at(-1)
  if (!source) throw new Error('no stream was opened')
  return source
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('merging cycles', () => {
  it('keeps them in sequence order with no repeats, the later copy winning', () => {
    const replaced = { ...cycle(2), action: 'scale_up' }
    const merged = __test.mergeCycles([cycle(1), cycle(2)], [cycle(3), replaced])

    expect(merged.map((c) => c.sequence)).toEqual([1, 2, 3])
    expect(merged[1]?.action).toBe('scale_up')
  })

  it('knows a streamed cycle that skips ahead means something was missed', () => {
    expect(__test.missedBefore([cycle(1), cycle(2)], cycle(3))).toBe(false)
    expect(__test.missedBefore([cycle(1), cycle(2)], cycle(5))).toBe(true)
    expect(__test.missedBefore([], cycle(1))).toBe(false)
    expect(__test.missedBefore([], cycle(4))).toBe(true)
  })
})

describe('following a run\'s cycles', () => {
  // The backend pages at 5000. A long run fetched as one page would have its
  // charts silently stop part way through.
  it('reads every page, not only the first', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    serve(() => 5, 2)

    const { result } = renderHook(() => useRunCycles('run-1', false), { wrapper })

    await waitFor(() => expect(result.current.cycles.map((c) => c.sequence)).toEqual([1, 2, 3, 4, 5]))
  })

  it('adds a cycle the stream delivers', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    serve(() => 2)
    const { result } = renderHook(() => useRunCycles('run-1', true), { wrapper })
    await waitFor(() => expect(result.current.cycles).toHaveLength(2))

    act(() => stream().emit('cycle', { run_id: 'run-1', type: 'cycle', cycle: cycle(3) }))

    expect(result.current.cycles.map((c) => c.sequence)).toEqual([1, 2, 3])
  })

  // The stream drops events for a watcher that falls behind. Appending what
  // did arrive would leave a hole in the chart that looks like a quiet moment.
  it('goes back to the record when the stream skips a cycle', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    let held = 2
    const fetched = serve(() => held)
    const { result } = renderHook(() => useRunCycles('run-1', true), { wrapper })
    await waitFor(() => expect(result.current.cycles).toHaveLength(2))

    held = 5
    act(() => stream().emit('cycle', { run_id: 'run-1', type: 'cycle', cycle: cycle(5) }))

    await waitFor(() => expect(result.current.cycles.map((c) => c.sequence)).toEqual([1, 2, 3, 4, 5]))
    expect(fetched).toHaveBeenCalledWith('run-1', 2)
  })

  it('ignores a cycle it already has', async () => {
    vi.stubGlobal('EventSource', FakeEventSource)
    serve(() => 2)
    const { result } = renderHook(() => useRunCycles('run-1', true), { wrapper })
    await waitFor(() => expect(result.current.cycles).toHaveLength(2))

    act(() => stream().emit('cycle', { run_id: 'run-1', type: 'cycle', cycle: cycle(2) }))

    expect(result.current.cycles).toHaveLength(2)
  })
})
