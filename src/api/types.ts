// These types follow simlab-api's openapi.yaml. They are written by hand
// rather than generated because the surface is small and a generator would be
// one more thing to keep installed and in step; the backend's contract test
// keeps the document itself honest.

export type RunMode = 'simulation' | 'live'

export type RunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export interface Mine {
  id: string
  name: string
  sensors: number
  background_rate_per_hour: number
  description?: string
  created_at?: string
}

export interface Burst {
  at_seconds: number
  magnitude: number
  aftershock_decay_seconds?: number
}

export interface Scenario {
  id: string
  mine_id: string
  name: string
  duration_seconds: number
  job_seconds: number
  seed?: number
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
  /** Nanoseconds, as Go renders a duration. */
  decision_interval: number
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
  queues: Record<string, QueueSnapshot>
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
