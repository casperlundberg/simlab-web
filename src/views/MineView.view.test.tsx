import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '../api/client'
import type { RunDetail, SeismicEvent } from '../api/types'
import { MineView } from './MineView'

// jsdom has no EventSource and no WebGL. The first is stood up; the second is
// left missing on purpose, because a browser without WebGL is a case this view
// has to handle rather than one a test should paper over.
class QuietEventSource extends EventTarget {
  close() {}
}

const completed: RunDetail = {
  active: false,
  run: {
    id: 'run-1', name: 'Rock burst', target_id: 'run-1', mode: 'simulation', status: 'completed',
    simulated_start: '2026-09-10T12:00:00Z', decision_interval_seconds: 15, created_at: '2026-09-10T12:00:00Z',
  },
}

function event(sequence: number, located: boolean): SeismicEvent {
  return {
    run_id: 'run-1', sequence, origin_seconds: 10 * sequence, burst: null,
    truth: { x: 1, y: 2, z: -3 }, sensors: ['s01', 's02', 's03', 's04'],
    located_at_seconds: located ? 400 : null,
    located: located ? { at: { x: 1, y: 2, z: -3 }, rms_residual_seconds: 0.002, picks: 4 } : null,
    processed_at_seconds: located ? 400 : null,
    final: located ? { at: { x: 1, y: 2, z: -3 }, rms_residual_seconds: 0.001, picks: 4 } : null,
  }
}

function show() {
  vi.stubGlobal('EventSource', QuietEventSource)
  vi.spyOn(api, 'run').mockResolvedValue(completed)
  vi.spyOn(api, 'cycles').mockResolvedValue({ cycles: [], next: 0 })
  vi.spyOn(api, 'entities').mockResolvedValue([])
  // WebGL is only asked for when a scene is built; stop jsdom logging that it
  // has no canvas implementation for every test that gets that far.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)

  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/runs/run-1/mine']}>
        <Routes><Route path="/runs/:id/mine" element={<MineView />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the virtual mine view', () => {
  // Every run recorded before mines were modelled lands here. A blank canvas
  // would read as a mine with nothing in it.
  it('explains a run that has no mine recorded, in the backend\'s words', async () => {
    vi.spyOn(api, 'runLayout').mockRejectedValue(
      new ApiError(404, 'run "run-1" has no virtual mine recorded; it was recorded before mines were modelled'))
    vi.spyOn(api, 'seismicity').mockResolvedValue({ events: [], next: 0 })
    show()

    expect(await screen.findByText('No virtual mine for this run')).toBeInTheDocument()
    expect(screen.getByText(/before mines were modelled/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Start a new run' })).toBeInTheDocument()
  })

  it('still reports the mine when the browser cannot draw it', async () => {
    vi.spyOn(api, 'runLayout').mockResolvedValue({
      extent: { min: { x: 0, y: 0, z: -1000 }, max: { x: 1000, y: 1000, z: 0 } },
      sensors: [{ id: 's01', at: { x: 10, y: 10, z: -10 } }],
    })
    vi.spyOn(api, 'seismicity').mockImplementation(async (_id: string, from = 0) =>
      from === 0 ? { events: [event(1, true), event(2, false), event(3, false)], next: 3 } : { events: [], next: from })
    show()

    expect(await screen.findByText(/could not start WebGL/)).toBeInTheDocument()
    expect(screen.getByText('Seismicity')).toBeInTheDocument()
    expect(screen.getByText('Events so far').nextElementSibling).toHaveTextContent('3')
  })

  // The run page links here; without a way back, the browser's back button
  // was the only route to the charts.
  it('links back to the run\'s data', async () => {
    withAMine()
    show()

    const back = await screen.findByRole('link', { name: 'Run data' })
    expect(back).toHaveAttribute('href', '/runs/run-1')
  })

  // The slider sat below the whole grid, so it moved whenever the panel beside
  // the mine grew or shrank during playback, and spanned the panel too. In the
  // mine's own column it is exactly as wide as the canvas and stays under it.
  // jsdom lays nothing out, so this pins the structure that guarantees it.
  it('keeps the time slider in the mine\'s own column, directly under the canvas', async () => {
    withAMine()
    show()

    const slider = await screen.findByLabelText('Moment in the run')
    const column = slider.closest('.mine-main')
    expect(column).not.toBeNull()
    expect(column?.querySelector('.mine-stage')).not.toBeNull()
    expect(column?.querySelector('.mine-hud')).toBeNull()
    expect(column?.lastElementChild).toContainElement(slider)
  })
})

function withAMine() {
  vi.spyOn(api, 'runLayout').mockResolvedValue({
    extent: { min: { x: 0, y: 0, z: -1000 }, max: { x: 1000, y: 1000, z: 0 } },
    sensors: [{ id: 's01', at: { x: 10, y: 10, z: -10 } }],
  })
  vi.spyOn(api, 'seismicity').mockResolvedValue({ events: [event(1, true)], next: 1 })
}
