# Changelog

Every release, newest first. `make release` will not tag a version without a
section here, so the tag message and this file always agree.

## 1.0.0 — 2026-09-17

The first versioned release, alongside simlab-api 1.0.0 and autoscaler 1.0.0.

- Runs, run detail with capacity and queue timelines, the queue by submitted and
  by current priority, and every decision with its reasoning.
- The virtual mine in 3D: tunnels, sensors with picks waiting, located events
  and their hazard zones, people and vehicles with their risk, and a scrubber
  that follows a live run.
- Workloads and targets, including editing a live autoscaler's settings.
- Provenance on each run's page — the builds that produced it, whether it is
  reproducible, and the command that reproduces it — and the versions of this
  app, simlab-api and the autoscaler in the sidebar.
