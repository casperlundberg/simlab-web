import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { count, duration, priorityLabel } from '../components/format'
import type { Burst } from '../api/types'

export function WorkloadsView() {
  const queryClient = useQueryClient()
  const mines = useQuery({ queryKey: ['mines'], queryFn: () => api.mines() })
  const scenarios = useQuery({ queryKey: ['scenarios'], queryFn: () => api.scenarios() })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['mines'] })
    void queryClient.invalidateQueries({ queryKey: ['scenarios'] })
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Workloads</h1>
          <p>
            A mine sets the scale — more sensors means more picks per event, and more
            picks means more jobs. A scenario is what happens to it: a baseline, and the
            seismic events that turn an hour of work into a minute of it.
          </p>
        </div>
      </div>

      <div className="grid two">
        <div>
          <MineForm onSaved={refresh} />
          <div className="card">
            <div className="card-head"><h2>Mines</h2></div>
            {mines.isLoading ? <div className="empty">Loading…</div>
              : !mines.data?.length ? <div className="empty">No mines yet.</div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Mine</th><th className="num">Sensors</th><th className="num">Events/h</th><th /></tr>
                    </thead>
                    <tbody>
                      {mines.data.map((mine) => (
                        <tr key={mine.id}>
                          <td>
                            {mine.name}
                            <div className="faint mono">{mine.id}</div>
                          </td>
                          <td className="num">{count(mine.sensors)}</td>
                          <td className="num">{mine.background_rate_per_hour}</td>
                          <td>
                            <button
                              className="small danger"
                              onClick={async () => { await api.deleteMine(mine.id); refresh() }}
                              title="Deletes the mine and its scenarios. Runs keep their results."
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>

        <div>
          <ScenarioForm mines={mines.data ?? []} onSaved={refresh} />
          <div className="card">
            <div className="card-head"><h2>Scenarios</h2></div>
            {scenarios.isLoading ? <div className="empty">Loading…</div>
              : !scenarios.data?.length ? <div className="empty">No scenarios yet.</div> : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Scenario</th><th>Shape</th><th className="num">Seed</th><th /></tr>
                    </thead>
                    <tbody>
                      {scenarios.data.map((scenario) => (
                        <tr key={scenario.id}>
                          <td>
                            {scenario.name || scenario.id}
                            <div className="faint mono">{scenario.mine_id}</div>
                          </td>
                          <td>
                            {duration(scenario.duration_seconds)}, {scenario.job_seconds}s jobs
                            <div className="faint">
                              {Object.keys(scenario.priority_mix).sort((a, b) => Number(b) - Number(a))
                                .map((p) => priorityLabel(p)).join(' · ')}
                            </div>
                            {scenario.bursts?.length ? (
                              <div className="faint">
                                {scenario.bursts.map(describeBurst).join('; ')}
                              </div>
                            ) : <div className="faint">no bursts — a steady baseline</div>}
                          </td>
                          <td className="num mono">{scenario.seed}</td>
                          <td>
                            <button
                              className="small danger"
                              onClick={async () => { await api.deleteScenario(scenario.id); refresh() }}
                              title="Runs that used this scenario keep their results."
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </div>
      </div>
    </>
  )
}

function describeBurst(burst: Burst): string {
  const tail = burst.aftershock_decay_seconds
    ? `, aftershocks over ${duration(burst.aftershock_decay_seconds)}`
    : ', no aftershocks'
  return `×${burst.magnitude} at ${duration(burst.at_seconds)}${tail}`
}

function MineForm({ onSaved }: { onSaved: () => void }) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [sensors, setSensors] = useState('40')
  const [rate, setRate] = useState('20')

  const save = useMutation({
    mutationFn: () =>
      api.saveMine({
        id, name: name || id, sensors: Number(sensors), background_rate_per_hour: Number(rate),
      }),
    onSuccess: () => { setId(''); setName(''); onSaved() },
  })

  return (
    <div className="card">
      <div className="card-head"><h2>Add a mine</h2></div>
      {save.error ? <div className="error-banner">{(save.error as Error).message}</div> : null}

      <div className="field-row">
        <div className="field">
          <label htmlFor="mine-id">Id</label>
          <input id="mine-id" value={id} onChange={(e) => setId(e.target.value)} placeholder="storhall" />
        </div>
        <div className="field">
          <label htmlFor="mine-name">Name</label>
          <input id="mine-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Storhall" />
        </div>
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="mine-sensors">Sensors</label>
          <input id="mine-sensors" type="number" min="1" value={sensors} onChange={(e) => setSensors(e.target.value)} />
          <div className="hint">Each detecting sensor contributes a pick, so this sets work per event.</div>
        </div>
        <div className="field">
          <label htmlFor="mine-rate">Background events per hour</label>
          <input id="mine-rate" type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
      </div>
      <button className="primary" onClick={() => save.mutate()} disabled={!id || save.isPending}>
        Save mine
      </button>
    </div>
  )
}

function ScenarioForm({ mines, onSaved }: { mines: { id: string; name: string }[]; onSaved: () => void }) {
  const [mineId, setMineId] = useState('')
  const [name, setName] = useState('')
  const [hours, setHours] = useState('6')
  const [jobSeconds, setJobSeconds] = useState('20')
  const [seed, setSeed] = useState('')
  const [burstAt, setBurstAt] = useState('60')
  const [magnitude, setMagnitude] = useState('40')
  const [decay, setDecay] = useState('180')

  const save = useMutation({
    mutationFn: () =>
      api.saveScenario({
        mine_id: mineId,
        name: name || 'Scenario',
        duration_seconds: Number(hours) * 3600,
        job_seconds: Number(jobSeconds),
        seed: seed ? Number(seed) : undefined,
        priority_mix: { '100': 1, '50': 1, '25': 2 },
        bursts: Number(magnitude) > 1
          ? [{
              at_seconds: Number(burstAt) * 60,
              magnitude: Number(magnitude),
              aftershock_decay_seconds: Number(decay) * 60,
            }]
          : [],
      }),
    onSuccess: () => { setName(''); setSeed(''); onSaved() },
  })

  return (
    <div className="card">
      <div className="card-head"><h2>Add a scenario</h2></div>
      {save.error ? <div className="error-banner">{(save.error as Error).message}</div> : null}

      <div className="field">
        <label htmlFor="scn-mine">Mine</label>
        <select id="scn-mine" value={mineId} onChange={(e) => setMineId(e.target.value)}>
          <option value="">Choose a mine…</option>
          {mines.map((mine) => <option key={mine.id} value={mine.id}>{mine.name}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="scn-name">Name</label>
        <input id="scn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Large rock burst" />
      </div>
      <div className="field-row">
        <div className="field">
          <label htmlFor="scn-hours">Duration (hours)</label>
          <input id="scn-hours" type="number" min="0.1" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="scn-job">Job length (s)</label>
          <input id="scn-job" type="number" min="1" value={jobSeconds} onChange={(e) => setJobSeconds(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="scn-seed">Seed</label>
          <input id="scn-seed" type="number" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="generated" />
          <div className="hint">Reuse a seed to replay identical jobs.</div>
        </div>
      </div>

      <h3 style={{ marginTop: 4, marginBottom: 8 }}>Seismic event</h3>
      <div className="field-row">
        <div className="field">
          <label htmlFor="scn-at">At (minutes in)</label>
          <input id="scn-at" type="number" min="0" value={burstAt} onChange={(e) => setBurstAt(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="scn-mag">Magnitude</label>
          <input id="scn-mag" type="number" min="1" value={magnitude} onChange={(e) => setMagnitude(e.target.value)} />
          <div className="hint">1 means no event at all.</div>
        </div>
        <div className="field">
          <label htmlFor="scn-decay">Aftershocks over (minutes)</label>
          <input id="scn-decay" type="number" min="0" value={decay} onChange={(e) => setDecay(e.target.value)} />
          <div className="hint">Load does not return to baseline the moment the event ends.</div>
        </div>
      </div>

      <button className="primary" onClick={() => save.mutate()} disabled={!mineId || save.isPending}>
        Save scenario
      </button>
    </div>
  )
}
