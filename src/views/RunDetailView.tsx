import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { Chart } from '../components/Chart'
import { Tile, Tiles } from '../components/Tiles'
import { LiveDot, StatusBadge } from '../components/StatusBadge'
import {
  clockTime, count, duration, executorHours, percent, priorityLabel, timestamp,
} from '../components/format'
import { useRunCycles } from '../state/useRunCycles'
import type { Cycle } from '../api/types'
import {
  buildComposition, buildTimeline, sameComposition, totalDepth, type Composition,
} from './RunDetailView.internals'
import { cssVar, priorityToken } from '../components/theme'

export function RunDetailView() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()

  const detail = useQuery({
    queryKey: ['run', id],
    queryFn: () => api.run(id),
    refetchInterval: (query) => (query.state.data?.active ? 10_000 : false),
  })

  const { cycles, connected } = useRunCycles(id, detail.data?.active ?? true)

  const cancel = useMutation({
    mutationFn: () => api.cancelRun(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['run', id] }),
  })

  const timeline = useMemo(() => buildTimeline(cycles), [cycles])
  const submitted = useMemo(() => buildComposition(cycles, 'submitted'), [cycles])
  const current = useMemo(() => buildComposition(cycles, 'current'), [cycles])
  const run = detail.data?.run
  const metrics = detail.data?.metrics

  if (detail.isLoading) return <div className="empty">Loading…</div>
  if (detail.error) return <div className="error-banner">{(detail.error as Error).message}</div>
  if (!run) return <div className="empty">No such run.</div>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{run.name || run.id}</h1>
          <p className="muted">
            <Link to="/runs">Runs</Link> · <span className="mono">{run.id}</span> ·{' '}
            {run.mode} · {duration(run.decision_interval_seconds)} cycles ·{' '}
            started {timestamp(run.started_at)}
          </p>
        </div>
        <div className="row">
          {run.mode === 'simulation' ? (
            <Link className="button" to={`/runs/${run.id}/mine`}>Virtual mine</Link>
          ) : null}
          <StatusBadge status={run.status} active={detail.data?.active} />
          {detail.data?.active ? <LiveDot connected={connected} /> : null}
          {detail.data?.active ? (
            <button className="danger" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
              Stop
            </button>
          ) : null}
        </div>
      </div>

      {run.error ? <div className="error-banner">{run.error}</div> : null}

      {metrics ? (
        <Tiles>
          <Tile
            label="SLA breaches"
            value={count(metrics.sla_breaches)}
            unit={percent(metrics.breach_rate)}
            tone={metrics.sla_breaches === 0 ? 'good' : 'bad'}
          />
          <Tile label="Jobs completed" value={count(metrics.jobs_completed)} unit={`of ${count(metrics.jobs_submitted)}`} />
          <Tile label="Mean wait" value={duration(metrics.mean_wait_seconds)} />
          <Tile label="P95 wait" value={duration(metrics.p95_wait_seconds)} />
          <Tile label="Peak queue" value={count(metrics.peak_queue_depth)} />
          <Tile label="Cloud time" value={executorHours(metrics.cloud_executor_seconds)} unit="exec-hours" />
          <Tile label="On-prem time" value={executorHours(metrics.local_executor_seconds)} unit="exec-hours" />
          <Tile label="Scaling actions" value={count(metrics.scaling_actions)} unit={`in ${count(metrics.cycles)}`} />
        </Tiles>
      ) : (
        <div className="card muted">
          Metrics appear when the run finishes. {cycles.length} cycles so far.
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <h2>Capacity</h2>
          <span className="faint">What the autoscaler provisioned, tier by tier</span>
        </div>
        <Chart
          x={timeline.elapsed}
          height={200}
          yLabel="executors"
          series={[
            { label: 'on-prem ready', values: timeline.localReady, colour: cssVar('--local'), fill: true },
            { label: 'cloud ready', values: timeline.cloudReady, colour: cssVar('--cloud'), fill: true },
            { label: 'on-prem planned', values: timeline.localPlanned, colour: cssVar('--local'), dashed: true },
            { label: 'cloud planned', values: timeline.cloudPlanned, colour: cssVar('--cloud'), dashed: true },
          ]}
        />
        <p className="faint" style={{ marginTop: 6 }}>
          The gap between planned and ready is coldstart: capacity that has been asked
          for and has not arrived. It is why acting early is worth anything.
        </p>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Queue</h2>
          <span className="faint">Work waiting, and the oldest job's age</span>
        </div>
        <Chart
          x={timeline.elapsed}
          height={200}
          yLabel="jobs"
          series={[
            { label: 'queue depth', values: timeline.depth, colour: cssVar('--accent'), fill: true },
            { label: 'breaches (cumulative)', values: timeline.breaches, colour: cssVar('--danger') },
          ]}
        />
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Queue by priority</h2>
          <span className="faint">The same waiting work, counted two ways</span>
        </div>
        <CompositionChart
          title="As submitted"
          explanation="Each job counted at the priority the mine gave it."
          composition={submitted}
          elapsed={timeline.elapsed}
        />
        <CompositionChart
          title="As the queue holds it"
          explanation="Each job counted at the priority it has now, which is the order it will be served in."
          composition={current}
          elapsed={timeline.elapsed}
        />
        {submitted.recorded && cycles.length > 0 ? (
          <p className="faint chart-note">
            {sameComposition(submitted, current)
              ? 'Identical: nothing changed the priority of a waiting job in this run.'
              : 'They differ where a waiting job\'s priority was changed after it was submitted.'}
          </p>
        ) : null}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Decisions</h2>
          <span className="faint">
            Every cycle, with the reasoning the engine gave for it
          </span>
        </div>
        <DecisionTable cycles={cycles} />
      </div>
    </>
  )
}

function CompositionChart({ title, explanation, composition, elapsed }: {
  title: string
  explanation: string
  composition: Composition
  elapsed: number[]
}) {
  return (
    <section className="composition">
      <h3>{title}</h3>
      <p className="faint">{explanation}</p>
      {!composition.recorded ? (
        <div className="empty">
          This run was recorded before the queue was counted by submitted priority.
          Run the scenario again to see it.
        </div>
      ) : composition.levels.length === 0 ? (
        <div className="empty">Nothing was ever waiting.</div>
      ) : (
        <Chart
          x={elapsed}
          height={180}
          yLabel="jobs"
          stacked
          series={composition.levels.map((level) => ({
            label: priorityLabel(level),
            values: composition.depths[level] ?? [],
            colour: cssVar(priorityToken(level)),
          }))}
        />
      )}
    </section>
  )
}

function DecisionTable({ cycles }: { cycles: Cycle[] }) {
  // Newest first, and only the cycles that changed something. A run of a
  // thousand cycles is mostly "maintain", and listing all of it buries the
  // handful of moments that are worth reading.
  const [showAll, setShowAll] = useState(false)
  const shown = useMemo(() => {
    const interesting = showAll ? cycles : cycles.filter((c) => c.action && c.action !== 'maintain')
    return [...interesting].reverse().slice(0, 300)
  }, [cycles, showAll])

  if (!cycles.length) return <div className="empty">No cycles recorded yet.</div>

  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showAll}
            onChange={(e) => setShowAll(e.target.checked)}
            style={{ width: 'auto' }}
          />
          Show cycles that changed nothing
        </label>
        <span className="spacer" />
        <span className="faint">{shown.length} of {cycles.length} cycles</span>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>At</th>
              <th>Action</th>
              <th className="num">Plan</th>
              <th className="num">Queue</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((cycle) => (
              <tr key={cycle.sequence}>
                <td className="num faint">{cycle.sequence}</td>
                <td className="mono">{clockTime(cycle.at)}</td>
                <td>
                  <span className={`badge ${cycle.plan_cloud > 0 ? 'cloud' : 'local'}`}>
                    {cycle.action || 'maintain'}
                  </span>
                  {cycle.constraint ? (
                    <div className="faint" title="A limit held this plan back">{cycle.constraint}</div>
                  ) : null}
                </td>
                <td className="num">
                  {cycle.plan_local}
                  <span className="faint"> + {cycle.plan_cloud}</span>
                </td>
                <td className="num">
                  {totalDepth(cycle)}
                  {cycle.breached > 0 ? (
                    <div style={{ color: 'var(--danger)' }}>+{cycle.breached} late</div>
                  ) : null}
                </td>
                <td className="reason">
                  {cycle.reason}
                  <QueueBreakdown cycle={cycle} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

function QueueBreakdown({ cycle }: { cycle: Cycle }) {
  const levels = Object.entries(cycle.queues ?? {})
    .filter(([, level]) => level.depth > 0)
    .sort(([a], [b]) => Number(b) - Number(a))

  if (!levels.length) return null

  return (
    <div className="faint" style={{ marginTop: 3 }}>
      {levels.map(([priority, level]) => (
        <span key={priority} style={{ marginRight: 12 }}>
          {priorityLabel(priority)}: {count(level.depth)} waiting,
          oldest {duration(level.oldest_job_age_seconds)}
        </span>
      ))}
    </div>
  )
}
