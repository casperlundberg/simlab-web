# simlab-web

The Simlab frontend: a single-page app for defining, launching and reading
scaling runs.

It talks only to [`simlab-api`](../simlab-api). It never calls the autoscaler
directly — the backend owns that relationship, so the SPA has no reason to hold
platform credentials and no way to leak them.

## Views

- **Runs** — every run, its mode (simulation or emulation), status and headline
  metrics.
- **Run detail** — the timeline of a single run: queue depth per priority,
  local and cloud executors, and each scaling decision with the reason the
  engine gave for it.
- **Live** — the same timeline, streaming, while a run is in flight.
- **Targets** — the autoscaler targets Simlab knows about, and an editor for
  their runtime settings. Editing here changes the live autoscaler.

## What the design is doing

- **Tier colours are constant.** On-prem is green, cloud is purple, in every
  chart, badge and table. A reader learns them once.
- **Planned capacity is dashed, ready capacity is solid.** The gap between the
  two lines is coldstart, and that gap is the whole reason acting early is
  worth anything.
- **Decisions show only what changed, by default.** A run of a thousand cycles
  is mostly "maintain"; listing all of it buries the handful of moments worth
  reading.
- **A run whose process died reads as "interrupted", not "running".** The
  database cannot know the difference; the API says whether anything is
  actually running it, and the badge tells the truth.

## Running

```bash
npm install
npm run dev        # http://localhost:5173, proxying /api to :8081
npm test
npm run typecheck
npm run build
```

`npm run dev` needs simlab-api on :8081. See
[`docs/development.md`](docs/development.md).

## Deployment

`deploy/chart` serves the built app from nginx and proxies `/api` to
simlab-api, so the browser sees one origin: no CORS, no hostname baked in at
build time, and the event stream is not a cross-origin request. Buffering is
off along the whole path — an ingress that buffers turns a live run into one
long silence followed by everything at once.
