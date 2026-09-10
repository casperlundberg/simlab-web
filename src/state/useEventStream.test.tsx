import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useEventStream } from './useEventStream'
import type { RunEvent } from '../api/types'

// jsdom has no EventSource, so one is stood up here. It is a real event
// target with the same surface, not a mock of the hook's behaviour.
class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = []
  closed = false

  constructor(readonly url: string) {
    super()
    FakeEventSource.instances.push(this)
  }

  close() {
    this.closed = true
  }

  emit(type: string, data: unknown) {
    this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }))
  }
}

function install() {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
  return FakeEventSource
}

/** The stream the hook opened. Fails loudly rather than returning undefined,
 *  so a test that opened none says so instead of dying on a property access. */
function opened(index = 0): FakeEventSource {
  const source = FakeEventSource.instances[index]
  if (!source) throw new Error(`no EventSource was opened at index ${index}`)
  return source
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the event stream', () => {
  it('subscribes to one run when given an id', () => {
    install()

    renderHook(() => useEventStream('run-1', () => {}))

    expect(opened().url).toBe('/api/runs/run-1/events')
  })

  it('subscribes to everything when given none', () => {
    install()

    renderHook(() => useEventStream(undefined, () => {}))

    expect(opened().url).toBe('/api/events')
  })

  it('delivers each event type', () => {
    install()
    const seen: RunEvent[] = []
    renderHook(() => useEventStream('run-1', (event) => seen.push(event)))

    act(() => {
      opened().emit('status', { run_id: 'run-1', type: 'status', status: 'running' })
      opened().emit('cycle', { run_id: 'run-1', type: 'cycle' })
      opened().emit('metrics', { run_id: 'run-1', type: 'metrics' })
    })

    expect(seen.map((e) => e.type)).toEqual(['status', 'cycle', 'metrics'])
  })

  it('reports whether the stream is connected', () => {
    install()
    const { result } = renderHook(() => useEventStream('run-1', () => {}))

    expect(result.current.connected).toBe(false)
    act(() => {
      opened().dispatchEvent(new Event('open'))
    })
    expect(result.current.connected).toBe(true)

    act(() => {
      opened().dispatchEvent(new Event('error'))
    })
    expect(result.current.connected).toBe(false)
  })

  // A malformed frame is not worth tearing the stream down for; a run that
  // stopped updating because of one bad byte would be far worse.
  it('survives a frame it cannot parse', () => {
    install()
    const seen: RunEvent[] = []
    renderHook(() => useEventStream('run-1', (event) => seen.push(event)))

    act(() => {
      opened().dispatchEvent(new MessageEvent('cycle', { data: '{not json' }))
      opened().emit('cycle', { run_id: 'run-1', type: 'cycle' })
    })

    expect(seen).toHaveLength(1)
  })

  it('closes the stream when the component goes away', () => {
    install()
    const { unmount } = renderHook(() => useEventStream('run-1', () => {}))

    unmount()

    expect(opened().closed).toBe(true)
  })

  // Without this, an inline handler would rebuild the connection on every
  // render and the stream would never stay up.
  it('does not reconnect when only the handler changes', () => {
    const sources = install()
    const { rerender } = renderHook(({ handler }) => useEventStream('run-1', handler), {
      initialProps: { handler: () => {} },
    })

    rerender({ handler: () => {} })

    expect(sources.instances).toHaveLength(1)
  })

  it('opens nothing while disabled', () => {
    const sources = install()

    renderHook(() => useEventStream('run-1', () => {}, false))

    expect(sources.instances).toHaveLength(0)
  })
})
