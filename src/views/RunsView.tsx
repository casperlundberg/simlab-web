import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { StatusBadge } from '../components/StatusBadge'
import { count, executorHours, nanoseconds, percent, timestamp } from '../components/format'
import { useEventStream } from '../state/useEventStream'
import type { RunEvent } from '../api/types'

export function RunsView() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')

  const runs = useQuery({
    queryKey: ['runs', filter],
    queryFn: () => api.runs(filter || undefined),
    // Slow polling as a backstop. The stream is what keeps this current; this
    // is only here for the moments it is down.
    refetchInterval: 30_000,
  })

  // Any status change anywhere refreshes the list, so a run that finishes
  // while this page is open updates without anybody reloading.
  const onEvent = useCallback(
    (event: RunEvent) => {
      if (event.type === 'status' || event.type === 'metrics') {
        void queryClient.invalidateQueries({ queryKey: ['runs'] })
      }
    },
    [queryClient],
  )
  useEventStream(undefined, onEvent)

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteRun(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs'] }),
  })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Runs</h1>
          <p>
            Each run replays a workload against the real autoscaler and records every
            decision it made. Two runs of one scenario replay identical jobs, so the
            difference between their results is the settings that changed.
          </p>
        </div>
        <div className="row">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: 'auto' }}
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <Link to="/runs/new" className="button primary" style={{ background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' }}>
            New run
          </Link>
        </div>
      </div>

      {runs.error ? <div className="error-banner">{(runs.error as Error).message}</div> : null}

      <div className="card">
        {runs.isLoading ? (
          <div className="empty">Loading…</div>
        ) : !runs.data?.length ? (
          <div className="empty">
            No runs yet. <Link to="/runs/new">Start one</Link> to see what the autoscaler does
            with a rock burst.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th className="num">Breaches</th>
                  <th className="num">Cloud hours</th>
                  <th className="num">Cycles</th>
                  <th>Started</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {runs.data.map(({ run, active }) => (
                  <RunRow
                    key={run.id}
                    id={run.id}
                    name={run.name || run.id}
                    mode={run.mode}
                    interval={run.decision_interval}
                    status={run.status}
                    active={active}
                    startedAt={run.started_at}
                    onDelete={() => remove.mutate(run.id)}
                    deletable={!active}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}

interface RowProps {
  id: string
  name: string
  mode: string
  interval: number
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  active: boolean
  startedAt?: string | undefined
  deletable: boolean
  onDelete: () => void
}

function RunRow({ id, name, mode, interval, status, active, startedAt, deletable, onDelete }: RowProps) {
  // Metrics only exist once a run has finished; a missing one is normal, not
  // an error, so it is fetched separately and its absence renders as a dash.
  const metrics = useQuery({
    queryKey: ['metrics', id],
    queryFn: () => api.metrics(id),
    retry: false,
    enabled: status === 'completed' || status === 'cancelled',
  })

  return (
    <tr>
      <td>
        <Link to={`/runs/${id}`}>{name}</Link>
        <div className="faint mono">{nanoseconds(interval)} cycles</div>
      </td>
      <td><span className={`badge ${mode === 'live' ? 'cloud' : 'local'}`}>{mode}</span></td>
      <td><StatusBadge status={status} active={active} /></td>
      <td className="num">
        {metrics.data ? (
          <>
            {count(metrics.data.sla_breaches)}
            <div className="faint">{percent(metrics.data.breach_rate)}</div>
          </>
        ) : '—'}
      </td>
      <td className="num">{metrics.data ? executorHours(metrics.data.cloud_executor_seconds) : '—'}</td>
      <td className="num">{metrics.data ? count(metrics.data.cycles) : '—'}</td>
      <td className="faint">{timestamp(startedAt)}</td>
      <td>
        <button
          className="small danger"
          onClick={onDelete}
          disabled={!deletable}
          title={deletable ? 'Delete this run' : 'Cancel the run before deleting it'}
        >
          Delete
        </button>
      </td>
    </tr>
  )
}
