import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import type { PlatformField, PlatformSchema } from '../api/types'

export function TargetsView() {
  const queryClient = useQueryClient()
  const targets = useQuery({ queryKey: ['targets'], queryFn: () => api.targets() })
  const platforms = useQuery({ queryKey: ['platforms'], queryFn: () => api.platforms() })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['targets'] })

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Targets</h1>
          <p>
            A target is one scalable workload: which platform it is on, the access keys
            to act on it, and the settings it runs under. Registering one checks the
            credentials against the platform straight away — a mistyped Deployment name
            should be refused here, not discovered during a burst.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><h2>Registered</h2></div>
        {targets.isLoading ? <div className="empty">Loading…</div>
          : targets.error ? <div className="error-banner">{(targets.error as Error).message}</div>
          : !targets.data?.length ? (
            <div className="empty">
              No targets registered. Simulation runs create their own, so this is only
              needed for real infrastructure.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Target</th><th>Platform</th><th>Mode</th><th>Keys</th><th /></tr>
                </thead>
                <tbody>
                  {targets.data.map(({ target, last_error }) => (
                    <tr key={target.id}>
                      <td>
                        <Link to={`/targets/${target.id}`}>{target.name || target.id}</Link>
                        <div className="faint mono">{target.id}</div>
                        {last_error ? <div style={{ color: 'var(--danger)' }}>{last_error}</div> : null}
                      </td>
                      <td><span className="badge local">{target.kind}</span></td>
                      <td className="muted">{target.mode || 'driven'}</td>
                      <td className="faint mono">
                        {Object.keys(target.credentials ?? {}).join(', ') || '—'}
                      </td>
                      <td>
                        <button
                          className="small danger"
                          onClick={async () => { await api.deleteTarget(target.id); void refresh() }}
                          title="Stops scaling it. Capacity already provisioned is left alone."
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <RegisterTarget platforms={platforms.data ?? []} onRegistered={() => void refresh()} />
    </>
  )
}

function RegisterTarget({ platforms, onRegistered }: { platforms: PlatformSchema[]; onRegistered: () => void }) {
  const [kind, setKind] = useState('')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [mode, setMode] = useState('driven')
  const [config, setConfig] = useState<Record<string, string>>({})
  const [credentials, setCredentials] = useState<Record<string, string>>({})

  const schema = platforms.find((p) => p.kind === kind)

  const register = useMutation({
    mutationFn: () =>
      api.createTarget({
        target: {
          id, name: name || id, kind, mode,
          config: nonEmpty(config),
          credentials: nonEmpty(credentials),
        },
      }),
    onSuccess: () => { setId(''); setName(''); setConfig({}); setCredentials({}); onRegistered() },
  })

  return (
    <div className="card">
      <div className="card-head">
        <h2>Register a target</h2>
        <span className="faint">The form comes from the platform itself</span>
      </div>

      {register.error ? <div className="error-banner">{(register.error as Error).message}</div> : null}

      <div className="field">
        <label htmlFor="kind">Platform</label>
        <select id="kind" value={kind} onChange={(e) => { setKind(e.target.value); setConfig({}); setCredentials({}) }}>
          <option value="">Choose a platform…</option>
          {platforms.map((platform) => (
            <option key={platform.kind} value={platform.kind}>{platform.kind}</option>
          ))}
        </select>
        {schema ? <div className="hint">{schema.summary}</div> : null}
      </div>

      {schema ? (
        <>
          <div className="field-row">
            <div className="field">
              <label htmlFor="target-id">Id</label>
              <input id="target-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="storhall" />
              <div className="hint">
                Becomes part of Deployment, container and Secret names, so lowercase
                letters, digits and hyphens only.
              </div>
            </div>
            <div className="field">
              <label htmlFor="target-name">Name</label>
              <input id="target-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="target-mode">Mode</label>
              <select
                id="target-mode"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                disabled={!schema.sees_workload}
              >
                <option value="driven">Driven — someone supplies the queue</option>
                <option value="autonomous">Autonomous — it polls and provisions itself</option>
              </select>
              <div className="hint">
                {schema.sees_workload
                  ? 'This platform can see its own queue, so it may run autonomously.'
                  : 'This platform cannot see its own queue, so it must be driven.'}
              </div>
            </div>
          </div>

          <FieldSet
            title="Configuration"
            fields={schema.config ?? []}
            values={config}
            onChange={setConfig}
          />
          <FieldSet
            title="Access keys"
            note="Sent once and never returned. The autoscaler holds them; Simlab does not store them."
            fields={schema.credentials ?? []}
            values={credentials}
            onChange={setCredentials}
            secret
          />

          <button className="primary" onClick={() => register.mutate()} disabled={!id || register.isPending}>
            {register.isPending ? 'Checking the credentials…' : 'Register'}
          </button>
        </>
      ) : null}
    </div>
  )
}

interface FieldSetProps {
  title: string
  note?: string
  fields: PlatformField[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  secret?: boolean
}

/** Rendered from the platform's own schema, which is what lets this form work
 *  for a platform the frontend was never written for. */
function FieldSet({ title, note, fields, values, onChange, secret }: FieldSetProps) {
  if (!fields.length) return null

  return (
    <>
      <h3 style={{ marginTop: 14, marginBottom: 4 }}>{title}</h3>
      {note ? <p className="faint" style={{ marginTop: 0 }}>{note}</p> : null}
      {fields.map((field) => (
        <div className="field" key={field.name}>
          <label htmlFor={field.name}>
            {field.label}
            {field.required ? <span style={{ color: 'var(--danger)' }}> *</span> : null}
          </label>
          <input
            id={field.name}
            type={secret ? 'password' : 'text'}
            autoComplete={secret ? 'new-password' : 'off'}
            value={values[field.name] ?? ''}
            onChange={(e) => onChange({ ...values, [field.name]: e.target.value })}
            placeholder={field.default || field.example || ''}
          />
          {field.description ? <div className="hint">{field.description}</div> : null}
        </div>
      ))}
    </>
  )
}

function nonEmpty(values: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (value !== '') out[key] = value
  }
  return Object.keys(out).length ? out : undefined
}
