// These types follow simlab-api's openapi.yaml. They are written by hand
// rather than generated because the surface is small and a generator would be
// one more thing to keep installed and in step; the backend's contract test
// keeps the document itself honest.

export type RunMode = 'simulation' | 'live'

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Metres. z is elevation against the surface datum, so underground is
 *  negative and the -500 level is at z = -500. */
export interface Point {
  x: number
  y: number
  z: number
}

export interface Sensor {
  id: string
  at: Point
}

export interface Layout {
  extent: { min: Point; max: Point }
  sensors: Sensor[]
}

export interface Mine {
  id: string
  name: string
  sensors: number
  background_rate_per_hour: number
  layout?: Layout
  description?: string
  created_at?: string
}

export interface Burst {
  at_seconds: number
  magnitude: number
  aftershock_decay_seconds?: number
  epicentre?: Point
}

export interface Scenario {
  id: string
  mine_id: string
  name: string
  duration_seconds: number
  job_seconds: number
  pick_jitter_seconds?: number
  seed?: number | undefined
  priority_mix: Record<string, number>
  bursts?: Burst[]
  description?: string
  created_at?: string
}

export interface Run {
  id: string
  name?: string
  scenario_id?: string
  target_id: string
  mode: RunMode
  status: RunStatus
  simulated_start?: string
  time_compression?: number
  decision_interval_seconds: number
  started_at?: string
  finished_at?: string
  error?: string
  created_at: string
}

export interface RunListing {
  run: Run
  /** Whether the run is really in flight. A killed process leaves a run stuck
   * at "running" in the database, so this cannot be read from the status. */
  active: boolean
}

export interface QueueSnapshot {
  depth: number
  oldest_job_age_seconds: number
  arrival_rate_per_second: number
}

export interface Cycle {
  run_id: string
  sequence: number
  at: string
  /** Waiting work by the priority each job holds now — the order it will be
   *  served in. */
  queues: Record<string, QueueSnapshot>
  /** The same waiting work by the priority each job was submitted at. Null
   *  for a cycle recorded before this was tracked, which is not the same as
   *  an empty queue; absent from a backend that predates it. */
  depth_by_submitted_priority?: Record<string, number> | null
  local_ready: number
  cloud_ready: number
  local_pending: number
  cloud_pending: number
  action: string
  plan_local: number
  plan_cloud: number
  reason: string
  constraint?: string
  settings_version: number
  breach_expected: boolean
  completed: number
  breached: number
}

/** A location the mine solved from picks it had processed. */
export interface Location {
  at: Point
  /** The arrival-time error the solution could not explain: how far to trust it. */
  rms_residual_seconds: number
  picks: number
}

export interface SeismicEvent {
  run_id: string
  sequence: number
  /** From the start of the scenario. */
  origin_seconds: number
  /** Index of the scenario burst it belongs to; null for background activity. */
  burst: number | null
  /** Where it really happened. Known to the simulator only — the mine never
   *  reads it — and shown so an estimate can be compared with the truth. */
  truth: Point
  /** Detecting sensors, first arrival first. Each is one pick job. */
  sensors: string[]
  located_at_seconds: number | null
  located: Location | null
  processed_at_seconds: number | null
  final: Location | null
}

export interface Metrics {
  run_id: string
  jobs_submitted: number
  jobs_completed: number
  sla_breaches: number
  breach_rate: number
  mean_wait_seconds: number
  p95_wait_seconds: number
  max_wait_seconds: number
  peak_queue_depth: number
  local_executor_seconds: number
  cloud_executor_seconds: number
  peak_local_executors: number
  peak_cloud_executors: number
  scaling_actions: number
  cycles: number
}

export interface RunDetail {
  run: Run
  active: boolean
  metrics?: Metrics
  settings?: Record<string, unknown>
}

export interface PlatformField {
  name: string
  label: string
  description?: string
  default?: string
  example?: string
  required: boolean
}

export interface PlatformSchema {
  kind: string
  summary: string
  sees_workload: boolean
  config?: PlatformField[]
  credentials?: PlatformField[]
}

export interface Target {
  id: string
  name?: string
  kind: string
  mode?: string
  config?: Record<string, string>
  /** On the way out these are redaction markers, never values. */
  credentials?: Record<string, { present: boolean; fingerprint: string }>
}

export interface TargetSnapshot {
  target: Target
  settings: { version: number; settings: Record<string, unknown> }
  last_error?: string
}

export interface SettingsSnapshot {
  version: number
  settings: Record<string, unknown>
  warnings?: string[]
}

export interface Decision {
  at: string
  previous: { local_executors: number; cloud_executors: number }
  plan: { local_executors: number; cloud_executors: number }
  action: string
  reason: string
  settings_version: number
  constrained: boolean
  constraint?: string
}

export interface TargetStatus {
  id: string
  kind: string
  mode: string
  settings_version: number
  last_decision?: Decision
  last_error?: string
  last_cycle_at?: string
}

export type RunEventType = 'status' | 'cycle' | 'metrics'

export interface RunEvent {
  run_id: string
  type: RunEventType
  status?: RunStatus
  cycle?: Cycle
  metrics?: Metrics
  error?: string
}
