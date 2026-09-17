import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '../api/client'
import type { Cycle, SeismicEvent } from '../api/types'
import { LiveDot, StatusBadge } from '../components/StatusBadge'
import { count, duration, priorityLabel } from '../components/format'
import { useRunCycles } from '../state/useRunCycles'
import { MineScene } from './MineScene'
import {
  busiestMoment, clock, cycleAt, endOf, errorMetres, positionAt, residualMeaningful, sceneAt, stateAt,
  type EventState,
} from './MineView.internals'

/** Simulated seconds per real second. */
const SPEEDS = [10, 60, 300, 1800]

/** How long a located event stays in the scene after it last changed. */
const WINDOWS: { label: string; seconds: number }[] = [
  { label: '5 min', seconds: 300 },
  { label: '15 min', seconds: 900 },
  { label: '1 hour', seconds: 3600 },
  { label: 'whole run', seconds: Infinity },
]

/**
 * The virtual mine: where events happened in the rock, when the mine had a
 * location for each, and what the autoscaler was doing at that moment.
 *
 * The scene draws what the mine knew. An event it has not yet located has no
 * position — only the sensors still waiting on its picks light up — and the
 * true epicentres are a separate layer, off by default, because no real
 * installation has them.
 */
export function MineView() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()

  const detail = useQuery({
    queryKey: ['run', id],
    queryFn: () => api.run(id),
    refetchInterval: (query) => (query.state.data?.active ? 10_000 : false),
  })
  const active = detail.data?.active ?? false
  const { cycles, connected } = useRunCycles(id, detail.data?.active ?? true)

  const layout = useQuery({
    queryKey: ['layout', id],
    queryFn: () => api.runLayout(id),
    retry: false,
    staleTime: Infinity,
  })

  // Events change as the mine locates them, so a live run re-reads them. The
  // stream carries cycles, not locations, and is not the record either way.
  const seismicity = useQuery({
    queryKey: ['seismicity', id],
    queryFn: () => allEvents(id),
    enabled: layout.isSuccess,
    refetchInterval: active ? 5_000 : false,
  })

  // The last locations can land after the last poll; read them once more as
  // the run ends.
  const wasActive = useRef(active)
  useEffect(() => {
    if (wasActive.current && !active) void queryClient.invalidateQueries({ queryKey: ['seismicity', id] })
    wasActive.current = active
  }, [active, id, queryClient])

  const run = detail.data?.run
  const events = useMemo(() => seismicity.data ?? [], [seismicity.data])
  const start = run?.simulated_start ?? ''
  const end = useMemo(() => (start ? endOf(cycles, events, start) : 0), [cycles, events, start])

  const [t, setT] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(60)
  const [keepFor, setKeepFor] = useState(900)
  const [showTruth, setShowTruth] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [follow, setFollow] = useState(true)
  const [webgl, setWebgl] = useState(true)
  const theme = useColourScheme()

  // A live run opens at now; a finished one at its busiest moment, which is
  // the frame most worth looking at.
  useEffect(() => {
    if (t !== null || !detail.data || !seismicity.data) return
    setT(detail.data.active ? end : busiestMoment(seismicity.data))
  }, [t, detail.data, seismicity.data, end])

  useEffect(() => {
    if (active && follow && !playing) setT(end)
  }, [active, follow, playing, end])

  const now = Math.min(t ?? 0, end)
  const clockRef = useRef(now)
  clockRef.current = now

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (at: number) => {
      const next = Math.min(clockRef.current + ((at - last) / 1000) * speed, end)
      last = at
      setT(next)
      if (next >= end) {
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, speed, end])

  const scene = useMemo(() => sceneAt(events, now, keepFor), [events, now, keepFor])
  const decision = useMemo(() => (start ? cycleAt(cycles, now, start) : null), [cycles, now, start])
  const chosen = events.find((event) => event.sequence === selected) ?? null

  if (detail.isLoading) return <div className="empty">Loading…</div>
  if (detail.error) return <div className="error-banner">{(detail.error as Error).message}</div>
  if (!run) return <div className="empty">No such run.</div>

  const head = (
    <div className="page-head">
      <div>
        <h1>Virtual mine</h1>
        <p className="muted">
          <Link to="/runs">Runs</Link> · <Link to={`/runs/${run.id}`}>{run.name || run.id}</Link> ·{' '}
          where events happened, and when the mine could say where
        </p>
      </div>
      <div className="row">
        <StatusBadge status={run.status} active={active} />
        {active ? <LiveDot connected={connected} /> : null}
      </div>
    </div>
  )

  if (run.mode !== 'simulation') {
    return (
      <>
        {head}
        <div className="card empty">
          A live run watches real infrastructure, so there is no simulated mine to draw.
        </div>
      </>
    )
  }
  if (layout.error) {
    const missing = layout.error instanceof ApiError && layout.error.status === 404
    return (
      <>
        {head}
        <div className="card">
          <h2>No virtual mine for this run</h2>
          <p className="muted">{(layout.error as Error).message}</p>
          {missing ? (
            <p>
              <Link className="button" to="/runs/new">Start a new run</Link>{' '}
              <span className="faint">of the same scenario to see it.</span>
            </p>
          ) : null}
        </div>
      </>
    )
  }

  return (
    <>
      {head}
      {seismicity.error ? <div className="error-banner">{(seismicity.error as Error).message}</div> : null}

      <div className="mine-grid">
        <div className="card mine-stage">
          {layout.data && webgl ? (
            <MineScene
              layout={layout.data}
              scene={scene}
              showTruth={showTruth}
              selected={selected}
              onSelect={setSelected}
              onUnavailable={() => setWebgl(false)}
              theme={theme}
            />
          ) : null}
          {!webgl ? (
            <div className="empty mine-unavailable">
              This browser could not start WebGL, so the mine cannot be drawn. Everything
              beside it is still current.
            </div>
          ) : null}
          {!layout.data && webgl ? <div className="empty mine-unavailable">Loading the mine…</div> : null}

          <div className="mine-toolbar">
            <label className="row" htmlFor="mine-truth">
              <input
                id="mine-truth"
                type="checkbox"
                checked={showTruth}
                onChange={(e) => setShowTruth(e.target.checked)}
              />
              True epicentres
            </label>
            <label className="row" htmlFor="mine-window">
              Keep located events
              <select id="mine-window" value={String(keepFor)} onChange={(e) => setKeepFor(Number(e.target.value))}>
                {WINDOWS.map((w) => <option key={w.label} value={String(w.seconds)}>{w.label}</option>)}
              </select>
            </label>
          </div>

          <ul className="mine-legend" aria-label="Legend">
            <li><i className="dot sensor" aria-hidden="true" />Sensor</li>
            <li><i className="dot busy" aria-hidden="true" />Sensor with picks waiting</li>
            <li><i className="dot first" aria-hidden="true" />First location</li>
            <li><i className="dot final" aria-hidden="true" />Final location</li>
            {showTruth ? <li><i className="dot truth" aria-hidden="true" />True epicentre</li> : null}
          </ul>
        </div>

        <aside className="mine-hud">
          <section className="card">
            <div className="mine-clock">
              <span className="mono">{clock(now)}</span>
              <span className="faint"> of {clock(end)}</span>
            </div>
            <Autoscaler cycle={decision} />
          </section>

          <section className="card">
            <h3>Seismicity</h3>
            <dl className="facts">
              <dt>Events so far</dt><dd>{count(scene.counts.happened)}</dd>
              <dt><i className="dot busy" aria-hidden="true" />Awaiting a location</dt>
              <dd className={scene.counts.awaiting > 0 ? 'attention' : ''}>{count(scene.counts.awaiting)}</dd>
              <dt>Located</dt><dd>{count(scene.counts.located)}</dd>
              {scene.counts.unlocatable > 0 ? (
                <><dt>Too few sensors to locate</dt><dd>{count(scene.counts.unlocatable)}</dd></>
              ) : null}
              <dt>Time to locate, median</dt>
              <dd>{scene.timeToLocate ? duration(scene.timeToLocate.median) : '—'}</dd>
              <dt>Slowest to locate</dt>
              <dd>{scene.timeToLocate ? duration(scene.timeToLocate.max) : '—'}</dd>
            </dl>
          </section>

          {chosen ? (
            <SelectedEvent event={chosen} at={now} showTruth={showTruth} onClear={() => setSelected(null)} />
          ) : (
            <p className="faint mine-hint">Click an event in the mine to read it. Drag to turn the mine.</p>
          )}
        </aside>
      </div>

      <div className="card scrubber">
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (!playing && now >= end) setT(0)
            setPlaying(!playing)
            setFollow(false)
          }}
          disabled={end <= 0}
        >
          {playing ? 'Pause' : 'Play'}
        </button>
        <label htmlFor="mine-time" className="visually-hidden">Moment in the run</label>
        <input
          id="mine-time"
          type="range"
          min={0}
          max={Math.max(end, 1)}
          step={1}
          value={now}
          onChange={(e) => {
            setT(Number(e.target.value))
            setFollow(false)
          }}
        />
        <label className="row" htmlFor="mine-speed">
          <select id="mine-speed" value={String(speed)} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => <option key={s} value={String(s)}>{s}×</option>)}
          </select>
        </label>
        {active ? (
          <label className="row" htmlFor="mine-follow">
            <input
              id="mine-follow"
              type="checkbox"
              checked={follow}
              onChange={(e) => {
                setFollow(e.target.checked)
                if (e.target.checked) setPlaying(false)
              }}
            />
            Follow live
          </label>
        ) : null}
      </div>
    </>
  )
}

function Autoscaler({ cycle }: { cycle: Cycle | null }) {
  if (!cycle) return <p className="faint">No decision had been taken yet.</p>

  const waiting = Object.entries(cycle.queues ?? {})
    .filter(([, level]) => level.depth > 0)
    .sort(([a], [b]) => Number(b) - Number(a))
  const largest = Math.max(cycle.plan_local, cycle.local_ready, cycle.plan_cloud, cycle.cloud_ready, 1)

  return (
    <>
      <h3>Autoscaler</h3>
      <Tier label="On-prem" tier="local" ready={cycle.local_ready} planned={cycle.plan_local} scale={largest} />
      <Tier label="Cloud" tier="cloud" ready={cycle.cloud_ready} planned={cycle.plan_cloud} scale={largest} />
      <dl className="facts">
        <dt>Waiting</dt>
        <dd>{count(waiting.reduce((total, [, level]) => total + level.depth, 0))}</dd>
        {waiting.map(([priority, level]) => (
          <FactRow key={priority} term={priorityLabel(priority)} value={count(level.depth)} />
        ))}
      </dl>
      <p className="reason mine-reason" title={cycle.reason}>
        <strong>{cycle.action || 'maintain'}</strong> {cycle.reason}
      </p>
    </>
  )
}

function FactRow({ term, value }: { term: string; value: string }) {
  return <><dt className="faint indent">{term}</dt><dd className="faint">{value}</dd></>
}

/** Ready is solid and planned is an outline, as on the run's capacity chart:
 *  the difference is capacity still starting up. */
function Tier({ label, tier, ready, planned, scale }: {
  label: string; tier: 'local' | 'cloud'; ready: number; planned: number; scale: number
}) {
  return (
    <div className="tier">
      <div className="row tier-head">
        <span>{label}</span>
        <span className="spacer" />
        <span className="mono">{count(ready)} ready</span>
        <span className="faint mono">{count(planned)} planned</span>
      </div>
      <div className={`tier-bar ${tier}`} role="presentation">
        {/* Nothing rather than a zero-width bar, whose border alone still
            draws a tick that reads as a little capacity. */}
        {planned > 0 ? <span className="planned" style={{ width: `${(planned / scale) * 100}%` }} /> : null}
        {ready > 0 ? <span className="ready" style={{ width: `${(ready / scale) * 100}%` }} /> : null}
      </div>
    </div>
  )
}

const STATE_WORDS: Record<EventState, string> = {
  future: 'not yet happened',
  awaiting: 'awaiting a location',
  located: 'located, picks still being processed',
  processed: 'every pick processed',
  unlocatable: 'processed; too few sensors to locate',
}

function SelectedEvent({ event, at, showTruth, onClear }: {
  event: SeismicEvent; at: number; showTruth: boolean; onClear: () => void
}) {
  const state = stateAt(event, at)
  const error = showTruth ? errorMetres(event, at) : null
  const location = positionAt(event, at)

  return (
    <section className="card">
      <div className="row">
        <h3>Event {event.sequence}</h3>
        <span className="spacer" />
        <button type="button" className="small" onClick={onClear}>Clear</button>
      </div>
      <dl className="facts">
        <dt>Happened</dt><dd className="mono">{clock(event.origin_seconds)}</dd>
        <dt>Source</dt><dd>{event.burst === null ? 'background' : `burst ${event.burst + 1}`}</dd>
        <dt>Detected by</dt><dd>{count(event.sensors.length)} sensors</dd>
        <dt>Now</dt><dd>{STATE_WORDS[state]}</dd>
        {event.located_at_seconds !== null ? (
          <><dt>Located after</dt><dd>{duration(event.located_at_seconds - event.origin_seconds)}</dd></>
        ) : null}
        {location ? (
          <>
            <dt>From</dt><dd>{count(location.picks)} picks</dd>
            <dt>Residual</dt>
            <dd title={residualMeaningful(location) ? undefined : 'Four picks fit any location exactly, so there is nothing to check this one against.'}>
              {residualMeaningful(location) ? duration(location.rms_residual_seconds) : 'unmeasurable at 4 picks'}
            </dd>
            <dt>Position</dt>
            <dd className="mono">
              {Math.round(location.at.x)}, {Math.round(location.at.y)}, {Math.round(location.at.z)} m
            </dd>
          </>
        ) : null}
        {error !== null ? <><dt>Off the truth by</dt><dd>{Math.round(error)} m</dd></> : null}
      </dl>
    </section>
  )
}

async function allEvents(runId: string): Promise<SeismicEvent[]> {
  const out: SeismicEvent[] = []
  let from = 0
  for (;;) {
    const page = await api.seismicity(runId, from)
    if (page.events.length === 0 || page.next <= from) break
    out.push(...page.events)
    from = page.next
  }
  return out
}

/** Changes whenever the system colour scheme does, so a canvas that resolved
 *  its colours from tokens can resolve them again. */
function useColourScheme(): number {
  const [version, setVersion] = useState(0)
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const changed = () => setVersion((v) => v + 1)
    query.addEventListener('change', changed)
    return () => query.removeEventListener('change', changed)
  }, [])
  return version
}
