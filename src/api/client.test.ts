import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(url), init)),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('the API client', () => {
  it('unwraps a list from its envelope', async () => {
    stubFetch(() => respond({ mines: [{ id: 'storhall', name: 'Storhall', sensors: 40, background_rate_per_hour: 12 }] }))

    const mines = await api.mines()

    expect(mines).toHaveLength(1)
    expect(mines[0]?.id).toBe('storhall')
  })

  // The backend's error messages are written for a person and are almost
  // always the useful ones, so they must survive the client.
  it('surfaces the backend’s own explanation', async () => {
    stubFetch(() => respond({ error: 'mine is not usable: sensors must be > 0' }, 400))

    await expect(api.mines()).rejects.toThrow(/sensors must be > 0/)
  })

  it('carries the status code so callers can tell a 404 from a 400', async () => {
    stubFetch(() => respond({ error: 'no such run' }, 404))

    await expect(api.run('nobody')).rejects.toMatchObject({ status: 404 })
    await expect(api.run('nobody')).rejects.toBeInstanceOf(ApiError)
  })

  it('reports a non-JSON failure rather than swallowing it', async () => {
    stubFetch(() => new Response('<html>502</html>', { status: 502, statusText: 'Bad Gateway' }))

    await expect(api.mines()).rejects.toThrow(/502/)
  })

  it('handles a 204 with no body', async () => {
    stubFetch(() => respond(null, 204))

    await expect(api.deleteRun('run-1')).resolves.toBeUndefined()
  })

  it('asks for cycles after a sequence, so a page can follow a run', async () => {
    const fetchMock = stubFetch(() => respond({ cycles: [], next: 42 }))

    await api.cycles('run-1', 41)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/runs/run-1/cycles?from=41',
      expect.anything(),
    )
  })

  // Protected ground is what the planner decided from, as intent stood at the
  // moment on screen — so the request carries that intent, not the run's first.
  it('asks for the ground a run protects under the intent in force', async () => {
    const fetchMock = stubFetch(() => respond({ at_seconds: 90, knowledge: 'estimate', ground: [] }))

    await api.ground('run-1', 90, { lookahead_seconds: 300, protect: ['person', 'crewed-vehicle'], knowledge: 'estimate' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/runs/run-1/ground?at_seconds=90&lookahead_seconds=300&protect=person%2Ccrewed-vehicle&knowledge=estimate',
      expect.anything(),
    )
  })

  // Two people tuning one target must not silently overwrite each other.
  it('sends the expected version when one is given', async () => {
    const fetchMock = stubFetch(() => respond({ version: 8, settings: {} }))

    await api.patchTargetSettings('storhall', { local_executor_cap: 40 }, 7)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/targets/storhall/settings?expected_version=7',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('omits the expected version when the caller means "set this regardless"', async () => {
    const fetchMock = stubFetch(() => respond({ version: 8, settings: {} }))

    await api.patchTargetSettings('storhall', { dry_run: true })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/targets/storhall/settings',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('escapes an id so a stray slash cannot reshape the request', async () => {
    const fetchMock = stubFetch(() => respond({ scenarios: [] }))

    await api.scenarios('mine/../../etc')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/scenarios?mine_id=mine%2F..%2F..%2Fetc')
  })
})
