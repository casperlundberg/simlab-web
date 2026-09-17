import { getToken, notifyTokenRejected } from './token'
import type {
  Cycle, Layout, Metrics, Mine, PlatformSchema, Run, RunDetail, RunListing,
  Scenario, SeismicEvent, SettingsSnapshot, TargetSnapshot, TargetStatus,
} from './types'

/** An error carrying the status and the backend's own explanation, which is
 *  written for a person and is almost always the useful one. */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })

  if (response.status === 401) {
    // Tell the app before throwing, so it can ask for a token rather than
    // render "401" at somebody who has no idea what to do about it.
    notifyTokenRejected()
    throw new ApiError(401, await explain(response))
  }
  if (!response.ok) {
    throw new ApiError(response.status, await explain(response))
  }
  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

async function explain(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error) return body.error
  } catch {
    // A non-JSON error body is still worth reporting, just less usefully.
  }
  return `${response.status} ${response.statusText}`
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) }
}

export const api = {
  mines: () => request<{ mines: Mine[] }>('/api/mines').then((r) => r.mines),
  saveMine: (mine: Mine) => request<Mine>('/api/mines', json(mine)),
  deleteMine: (id: string) => request<void>(`/api/mines/${id}`, { method: 'DELETE' }),

  scenarios: (mineId?: string) =>
    request<{ scenarios: Scenario[] }>(
      mineId ? `/api/scenarios?mine_id=${encodeURIComponent(mineId)}` : '/api/scenarios',
    ).then((r) => r.scenarios),
  saveScenario: (scenario: Partial<Scenario>) => request<Scenario>('/api/scenarios', json(scenario)),
  deleteScenario: (id: string) => request<void>(`/api/scenarios/${id}`, { method: 'DELETE' }),

  runs: (status?: string) =>
    request<{ runs: RunListing[] }>(
      status ? `/api/runs?status=${encodeURIComponent(status)}` : '/api/runs',
    ).then((r) => r.runs),
  run: (id: string) => request<RunDetail>(`/api/runs/${id}`),
  startRun: (body: unknown) => request<Run>('/api/runs', json(body)),
  cancelRun: (id: string) => request<unknown>(`/api/runs/${id}/cancel`, { method: 'POST' }),
  deleteRun: (id: string) => request<void>(`/api/runs/${id}`, { method: 'DELETE' }),
  metrics: (id: string) => request<Metrics>(`/api/runs/${id}/metrics`),

  /** Cycles after `from`, so a page follows a run without refetching a
   *  timeline that is already thousands of rows. */
  cycles: (id: string, from = 0) =>
    request<{ cycles: Cycle[]; next: number }>(`/api/runs/${id}/cycles?from=${from}`),

  /** The sensor array a run's virtual mine was replayed against. 404 for a
   *  live run, or one recorded before mines were modelled. */
  runLayout: (id: string) =>
    request<{ layout: Layout }>(`/api/runs/${id}/layout`).then((r) => r.layout),

  /** Seismic events after `from`, paged like cycles. */
  seismicity: (id: string, from = 0) =>
    request<{ events: SeismicEvent[]; next: number }>(`/api/runs/${id}/seismicity?from=${from}`),

  platforms: () =>
    request<{ platforms: PlatformSchema[] }>('/api/platforms').then((r) => r.platforms),
  targets: () => request<{ targets: TargetSnapshot[] }>('/api/targets').then((r) => r.targets),
  target: (id: string) => request<TargetSnapshot>(`/api/targets/${id}`),
  createTarget: (body: unknown) => request<TargetSnapshot>('/api/targets', json(body)),
  deleteTarget: (id: string) => request<void>(`/api/targets/${id}`, { method: 'DELETE' }),
  targetStatus: (id: string) => request<TargetStatus>(`/api/targets/${id}/status`),

  targetSettings: (id: string) => request<SettingsSnapshot>(`/api/targets/${id}/settings`),

  /** Change a live autoscaler's policy. `expectedVersion` makes it a
   *  compare-and-swap, so two people editing one target cannot silently
   *  overwrite each other. */
  patchTargetSettings: (id: string, patch: Record<string, unknown>, expectedVersion?: number) =>
    request<SettingsSnapshot>(
      expectedVersion === undefined
        ? `/api/targets/${id}/settings`
        : `/api/targets/${id}/settings?expected_version=${expectedVersion}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    ),
}
