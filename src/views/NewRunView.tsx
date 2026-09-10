import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import { duration } from '../components/format'
import { numericSettings } from './settings'

/** The settings a run is most often varied on. The full document has many
 *  more fields; these are the ones a comparison usually turns on, and the
 *  target's own settings supply everything not mentioned here. */
const TUNABLES = [
  { key: 'local_executor_cap', label: 'On-premise cap', hint: 'A physical limit — asking for more produces pods that never schedule.' },
  { key: 'cloud_executor_cap', label: 'Cloud cap', hint: 'A spend ceiling. Set it to 0 to see what on-premise alone can do.' },
  { key: 'min_local_executors', label: 'On-premise floor', hint: 'Kept warm even with an empty queue, so the next job does not pay a coldstart.' },
  { key: 'safety_factor', label: 'Safety factor', hint: 'Headroom on the requirement, covering error in the throughput estimate. 1.0 is none.', step: '0.05' },
  { key: 'scale_down_cooldown_seconds', label: 'Scale-down cooldown (s)', hint: 'Long, usually: reclaiming executors too eagerly means paying coldstart again minutes later.' },
  { key: 'cloud_min_lifetime_seconds', label: 'Cloud minimum lifetime (s)', hint: 'Cloud is billed from the moment it is requested, so churning it through a lull is the expensive way to ride out a burst.' },
  { key: 'local_coldstart_seconds', label: 'On-premise coldstart (s)', hint: 'How long a new executor takes before it can take work.' },
  { key: 'cloud_coldstart_seconds', label: 'Cloud coldstart (s)', hint: 'Usually longer than on-premise.' },
]

export function NewRunView() {
  const navigate = useNavigate()

  const [mode, setMode] = useState<'simulation' | 'live'>('simulation')
  const [name, setName] = useState('')
  const [scenarioId, setScenarioId] = useState('')
  const [targetId, setTargetId] = useState('')
  const [interval, setInterval] = useState('15')
  const [compression, setCompression] = useState('600')
  const [settings, setSettings] = useState<Record<string, string>>({})

  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.scenarios() })
  const targets = useQuery({ queryKey: ['targets'], queryFn: () => api.targets() })

  const start = useMutation({
    mutationFn: () =>
      api.startRun({
        name: name || undefined,
        mode,
        scenario_id: mode === 'simulation' ? scenarioId : undefined,
        target_id: mode === 'live' ? targetId : undefined,
        decision_interval_seconds: Number(interval) || 15,
        time_compression: mode === 'simulation' ? Number(compression) || 600 : undefined,
        settings: numericSettings(settings),
      }),
    onSuccess: (run) => navigate(`/runs/${run.id}`),
  })

  const chosen = scenarios.data?.find((s) => s.id === scenarioId)
  const ready = mode === 'simulation' ? Boolean(scenarioId) : Boolean(targetId)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New run</h1>
          <p>
            A simulation replays a scenario against the real decision engine and
            provisions nothing. A live run watches a target that is really scaling real
            infrastructure, and records what it does.
          </p>
        </div>
      </div>

      {start.error ? <div className="error-banner">{(start.error as Error).message}</div> : null}

      <div className="grid two">
        <div className="card">
          <div className="card-head"><h2>What to run</h2></div>

          <div className="field">
            <label htmlFor="mode">Mode</label>
            <select id="mode" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              <option value="simulation">Simulation — replay a scenario, provision nothing</option>
              <option value="live">Live — watch real infrastructure</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="name">Name</label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Baseline, cloud disabled, …"
            />
            <div className="hint">
              Worth naming after what you changed — that is what the list is read for.
            </div>
          </div>

          {mode === 'simulation' ? (
            <>
              <div className="field">
                <label htmlFor="scenario">Scenario</label>
                <select id="scenario" value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
                  <option value="">Choose a scenario…</option>
                  {scenarios.data?.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.name || scenario.id} — {duration(scenario.duration_seconds)}
                      {scenario.bursts?.length ? `, ${scenario.bursts.length} burst(s)` : ''}
                    </option>
                  ))}
                </select>
                {chosen ? (
                  <div className="hint">
                    Seed {chosen.seed}. Every run of this scenario replays exactly these jobs,
                    so a difference in results is the settings and nothing else.
                  </div>
                ) : null}
              </div>

              <div className="field-row">
                <div className="field">
                  <label htmlFor="interval">Decision interval (s)</label>
                  <input id="interval" type="number" min="1" value={interval}
                    onChange={(e) => setInterval(e.target.value)} />
                  <div className="hint">Match the target's own, or you are measuring a different controller.</div>
                </div>
                <div className="field">
                  <label htmlFor="compression">Time compression</label>
                  <input id="compression" type="number" min="1" value={compression}
                    onChange={(e) => setCompression(e.target.value)} />
                  <div className="hint">
                    Simulated seconds per real second. Large values mean as fast as it will go.
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="field">
              <label htmlFor="target">Target to watch</label>
              <select id="target" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">Choose a target…</option>
                {targets.data?.map(({ target }) => (
                  <option key={target.id} value={target.id}>
                    {target.name || target.id} — {target.kind}
                  </option>
                ))}
              </select>
              <div className="hint">
                Simlab records what this target does. It does not drive it — two
                controllers deciding for one fleet would fight.
              </div>
            </div>
          )}

          <button
            className="primary"
            onClick={() => start.mutate()}
            disabled={!ready || start.isPending}
          >
            {start.isPending ? 'Starting…' : 'Start run'}
          </button>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Policy</h2>
            <span className="faint">Anything left blank keeps the shipped default</span>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            This is the comparison the whole application exists to make: one scenario,
            replayed under different settings.
          </p>

          {TUNABLES.map((tunable) => (
            <div className="field" key={tunable.key}>
              <label htmlFor={tunable.key}>{tunable.label}</label>
              <input
                id={tunable.key}
                type="number"
                step={tunable.step ?? '1'}
                value={settings[tunable.key] ?? ''}
                onChange={(e) => setSettings({ ...settings, [tunable.key]: e.target.value })}
                placeholder="default"
              />
              <div className="hint">{tunable.hint}</div>
            </div>
          ))}

          <label className="row" style={{ gap: 6 }}>
            <input
              type="checkbox"
              style={{ width: 'auto' }}
              checked={settings.dry_run === 'true'}
              onChange={(e) => setSettings({ ...settings, dry_run: e.target.checked ? 'true' : '' })}
            />
            Dry run — decide and record, provision nothing
          </label>
        </div>
      </div>
    </>
  )
}
