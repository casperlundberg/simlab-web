# Changelog

Every release, newest first. `make release` will not tag a version without a
section here, so the tag message and this file always agree.

## 2.0.0 — unreleased

MAJOR: a new run's form sends the settings autoscaler 2.0 takes, and autoscaler
1.x refuses them.

- **Scale-down windows on a new run.** The form offers
  `local_scale_down_window_seconds` and `cloud_scale_down_window_seconds` in
  place of `scale_down_cooldown_seconds`, which autoscaler 2.0 refuses, and
  describes the cloud minimum lifetime as per executor.
- **Priority levels are named by their number.** Names from pipeline stages fit
  one job mix only. P−1, beneath everything submitted, is still named
  "decayed", in intent's colour for decayed work.
- **A chart of what arrives, by level**, beside the charts of what waits. Work
  served the cycle it arrives never waits, so the queue charts all but hid it.
- **The time slider sits under the mine**, as wide as the canvas and still
  while the panel beside it changes, and the mine links back to its run's data.
- A development build is named after the release this file says it leads to —
  this section makes them 2.0.0-dev — rather than the next patch.

## 1.1.1 — 2026-09-18

- A new run's intent form starts with decay going below every level work is
  submitted at, as simlab-api 3.0.0 now does.

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
