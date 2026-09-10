import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api/client'
import { timestamp } from '../components/format'

export function TargetDetailView() {
  const { id = '' } = useParams()
  const queryClient = useQueryClient()

  const target = useQuery({ queryKey: ['target', id], queryFn: () => api.target(id) })
  const settings = useQuery({ queryKey: ['target-settings', id], queryFn: () => api.targetSettings(id) })
  const status = useQuery({
    queryKey: ['target-status', id],
    queryFn: () => api.targetStatus(id),
    refetchInterval: 5_000,
  })

  const [draft, setDraft] = useState<Record<string, string>>({})
  const [conflict, setConflict] = useState<string | null>(null)

  // The editor starts from what is actually in force, and follows it when
  // somebody else changes it — otherwise a stale form would keep proposing to
  // undo their change.
  useEffect(() => {
    if (settings.data) setDraft(toStrings(settings.data.settings))
  }, [settings.data?.version])

  const save = useMutation({
    mutationFn: () => api.patchTargetSettings(id, toValues(draft), settings.data?.version),
    onSuccess: () => {
      setConflict(null)
      void queryClient.invalidateQueries({ queryKey: ['target-settings', id] })
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setConflict(error.message)
        void queryClient.invalidateQueries({ queryKey: ['target-settings', id] })
      }
    },
  })

  if (target.isLoading) return <div className="empty">Loading…</div>
  if (target.error) return <div className="error-banner">{(target.error as Error).message}</div>

  const kind = target.data?.target.kind
  const decision = status.data?.last_decision

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{target.data?.target.name || id}</h1>
          <p className="muted">
            <Link to="/targets">Targets</Link> · <span className="mono">{id}</span> ·{' '}
            {kind} · {target.data?.target.mode || 'driven'}
          </p>
        </div>
      </div>

      {status.data?.last_error ? (
        <div className="error-banner">{status.data.last_error}</div>
      ) : null}

      <div className="card">
        <div className="card-head">
          <h2>Last decision</h2>
          <span className="faint">{timestamp(status.data?.last_cycle_at)}</span>
        </div>
        {decision ? (
          <>
            <div className="row">
              <span className={`badge ${decision.plan.cloud_executors > 0 ? 'cloud' : 'local'}`}>
                {decision.action}
              </span>
              <span className="mono">
                {decision.previous.local_executors}+{decision.previous.cloud_executors}
                {' → '}
                {decision.plan.local_executors}+{decision.plan.cloud_executors}
              </span>
              <span className="faint">settings v{decision.settings_version}</span>
            </div>
            <p className="reason" style={{ marginBottom: 0 }}>{decision.reason}</p>
            {decision.constraint ? (
              <p className="faint" style={{ marginBottom: 0 }}>Held back by: {decision.constraint}</p>
            ) : null}
          </>
        ) : (
          <div className="muted">
            This target has not decided anything yet. A driven target decides when
            somebody asks it to; an autonomous one decides on its own interval.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Settings</h2>
          <span className="faint">
            version {settings.data?.version ?? '—'} · takes effect on the next cycle
          </span>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          These reach the running controller. Nothing restarts, nothing reloads: the
          next decision this target makes is made under whatever is saved here.
        </p>

        {conflict ? (
          <div className="warn-banner">
            {conflict} — the form has been reloaded with what is now in force.
          </div>
        ) : null}
        {save.error && !conflict ? (
          <div className="error-banner">{(save.error as Error).message}</div>
        ) : null}
        {settings.data?.warnings?.length ? (
          <div className="warn-banner">
            {settings.data.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        ) : null}

        <div className="field-row">
          {Object.entries(draft)
            .filter(([key]) => key !== 'deadline_seconds_by_priority')
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{humanise(key)}</label>
                <input
                  id={key}
                  value={value}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              </div>
            ))}
        </div>

        <button className="primary" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </>
  )
}

function toStrings(settings: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'object' && value !== null) continue
    out[key] = String(value)
  }
  return out
}

function toValues(draft: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(draft)) {
    if (raw === 'true' || raw === 'false') {
      out[key] = raw === 'true'
      continue
    }
    const numeric = Number(raw)
    out[key] = Number.isFinite(numeric) && raw.trim() !== '' ? numeric : raw
  }
  return out
}

function humanise(key: string): string {
  return key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}
