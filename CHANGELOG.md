# Changelog

Every release, newest first. `make release` will not tag a version without a
section here, so the tag message and this file always agree.

## 1.1.0 — 2026-09-17

Alongside simlab-api 2.0.0 and autoscaler 1.1.0.

- Intent on a new simulation run: mode, what it is judged from, who is
  protected and how far ahead, the levels of ground motion it acts at, the
  deadline origin, restore, and which work is exempt from cloud burst.
- Intent on a run's page: what is in force, every version with the cycle it
  took effect from, and an editor that changes it while the run is in flight,
  with compare-and-swap. A chart of the waiting work intent decayed, promoted
  and exempted, and breaches counted as submitted beside those counted as
  served.
- In the virtual mine: events coloured by what intent decided about them, the
  sphere each decision was made with, protected routes along the tunnels, an
  intent panel for the moment shown, and each event's intent history.

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
