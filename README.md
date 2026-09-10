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

## Running

```bash
npm install
npm run dev        # http://localhost:5173, proxying /api to :8081
npm test
npm run build
```
