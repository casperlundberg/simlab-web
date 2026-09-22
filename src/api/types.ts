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

export interface Tunnel {
  id: string
  /** shaft, ramp, drive, crosscut, ore-drive or access */
  kind: string
  path: Point[]
}

export interface Layout {
  extent: { min: Point; max: Point }
  sensors: Sensor[]
  tunnels?: Tunnel[]
}

export type EntityKind = 'person' | 'crewed-vehicle' | 'autonomous-vehicle'

/** [seconds, x, y, z] */
export type Waypoint = [number, number, number, number]

export interface Entity {
  id: string
  kind: EntityKind
  track: Waypoint[]
}

export type RiskLevel = 'moderate' | 'high' | 'very-high'

export interface Exposure {
  entity: string
  level: RiskLevel
  ppv_mps: number
  distance_m: number
}

export interface Workforce {
  people: number
  crewed_vehicles: number
  autonomous_vehicles: number
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
  /** Nuttli magnitude of the burst's main shock; unrelated to `magnitude`,
   *  which scales the event rate. */
  main_magnitude?: number
}

export interface Scenario {
  id: string
  mine_id: string
  name: string
  duration_seconds: number
  job_seconds: number
  pick_jitter_seconds?: number
  workforce?: Workforce
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
  /** Absent for a run recorded before runs carried their provenance. */
  built_with?: BuiltWith
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
  /** Every breach predicted was of work exempt from cloud burst: accepted,
   *  not missed. Absent from a backend that predates exemption. */
  breaches_exempt_only?: boolean
  /** What intent had done to the queue this cycle. Null for a cycle recorded
   *  before intent was; absent from a backend that predates it. */
  intent?: CycleIntent | null
  completed: number
  breached: number
}

export type IntentMode = 'off' | 'decay' | 'promote' | 'both'
export type IntentClass = 'decayed' | 'promoted' | 'restored'
export type IntentState = 'unknown' | 'kept' | 'decayed' | 'promoted'

/** How the mine reorders its queued work. */
export interface IntentSettings {
  mode: IntentMode
  knowledge: 'estimate' | 'truth'
  pre_location: boolean
  pre_location_magnitude: number
  protect: EntityKind[]
  lookahead_seconds: number
  protect_level: RiskLevel
  promote_level: RiskLevel
  margin_m: number
  location_uncertainty_m: number
  decay_to: number
  promote_to: number
  deadline_from: 'arrival' | 'change'
  restore: boolean
  burst_exempt: IntentClass[]
}

export interface IntentStep {
  cycle: number
  settings: Partial<IntentSettings>
  version?: number
  source?: string
}

/** Intent as it was from one cycle of a run onwards. */
export interface IntentChange {
  version: number
  cycle: number
  source: 'initial' | 'schedule' | 'operator'
  settings: IntentSettings
  recorded_at: string
}

export interface RunIntent {
  run_id: string
  /** Whether the run is in flight, and so whether its intent can change. */
  active: boolean
  /** In force now — for a run in flight, possibly a change the run has not
   *  reached a cycle boundary to apply yet. */
  settings: IntentSettings
  version: number
  schedule: IntentStep[]
  /** Every version that took effect, with the cycle it took effect from. */
  changes: IntentChange[]
}

/** The mine's intent changing its mind about one event's work. */
export interface IntentTransition {
  at_seconds: number
  state: IntentState
  /** location, sensors, truth, or off */
  basis?: string
  entity?: string
  distance_m: number
  reach_m: number
}

export interface CycleIntent {
  version: number
  decayed: number
  promoted: number
  exempt: number
  exempt_by_priority?: Record<string, number>
  changed: number
  too_late: number
}

/** A location the mine solved from picks it had processed. */
export interface Location {
  at: Point
  /** The arrival-time error the solution could not explain: how far to trust it. */
  rms_residual_seconds: number
  picks: number
  /** The mine's estimate of the magnitude, from the same picks. */
  magnitude?: number | null
  /** How far each level of ground motion extends from this location, in
   *  metres, widened by the allowance for location error. */
  zones?: Partial<Record<RiskLevel, number>>
  /** Who the mine judged exposed from this location, when it had it. */
  exposed?: Exposure[]
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
  /** How large it really was. Ground truth, like `truth`. */
  magnitude?: number | null
  /** Who it really exposed, where they were when it happened. */
  exposed?: Exposure[] | null
  /** Detecting sensors, first arrival first. Each is one pick job. */
  sensors: string[]
  located_at_seconds: number | null
  located: Location | null
  processed_at_seconds: number | null
  final: Location | null
  /** When each pick was processed, in the order of `sensors`; null for one
   *  still waiting. Null as a whole for an event recorded before this was
   *  tracked, and absent from a backend that predates it. */
  picks_processed_at_seconds?: (number | null)[] | null
  /** Every change of intent about this event's work, in order. Null for an
   *  event recorded before intent was; absent from a backend that predates it. */
  intent?: IntentTransition[] | null
}

export interface Metrics {
  run_id: string
  jobs_submitted: number
  jobs_completed: number
  sla_breaches: number
  /** Against the level each job was submitted at, from arrival. Absent from
   *  a backend that predates intent. */
  sla_breaches_as_submitted?: number
  jobs_reprioritised?: number
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

/** Which code a service was built from. */
export interface Build {
  /** A release such as 1.3.0, or a development build such as
   *  1.3.1-dev.2+abc1234. Empty when the build was not stamped. */
  version: string
  commit: string
  /** Built with changes the commit does not contain. */
  modified: boolean
  go_version: string
  /** GOOS/GOARCH; absent from a backend that predates it. */
  platform?: string
}

export interface BuiltWith {
  simlab_api: Build
  autoscaler: Build | null
}

/** What a run was produced by and from, recorded as it began. */
export interface Provenance {
  recorded_at: string
  simlab_api: Build
  autoscaler: Build | null
  mine?: Mine
  scenario?: Scenario
  settings?: Record<string, unknown>
  settings_version?: number
  /** The intent the run began with. Absent for a run that predates intent. */
  intent?: { settings: IntentSettings; schedule?: IntentStep[] | null }
}

export interface Versions {
  simlab_api: Build
  autoscaler: Build | null
  autoscaler_error?: string
}

export interface RunDetail {
  run: Run
  active: boolean
  metrics?: Metrics
  settings?: Record<string, unknown>
  provenance?: Provenance
  reproducible?: boolean
  not_reproducible_because?: string[]
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

/** The ground a run's planner protects at a moment: each protected unit's
 *  paths — one for a vehicle's route, several for a person who could go
 *  several ways. */
export interface Ground {
  at_seconds: number
  knowledge: string
  ground: { entity: string; points: Point[] }[]
}
