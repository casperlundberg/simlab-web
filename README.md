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
- **Queue by priority** — on the run detail, the waiting work stacked by
  priority twice: as each job was submitted, and as the queue holds it now.
  They differ only once something changes a waiting job's priority, and the
  page says when they are identical.
- **Virtual mine** — a run's mine in 3D, with a scrubber: the sensor array,
  sensors with picks still waiting, where the mine located each event and
  when, and what the autoscaler had running at that moment. It draws what the
  mine knew; true epicentres are a separate layer, off by default. A finished
  run opens at the moment the most events were waiting for a location. The
  tunnels are drawn as pipes; people are round, vehicles are boxes, and an
  autonomous vehicle is an outline. Anyone inside a located event's zone gets
  a ring in the risk colour for its level, and the high and very-high zones
  are drawn around the location.
- **Intent** — how the mine reorders its work: set when a simulation run is
  created, and changed while it is in flight from the run's page, in force from
  the next cycle. The page lists every version with the cycle it took effect
  from, and charts the waiting work intent decayed, promoted and exempted from
  cloud burst. In the virtual mine, each located event takes the colour of what
  intent decided — kept, decayed or promoted — with the sphere it was decided
  with, and the protected routes ahead of every person and vehicle are drawn
  along the tunnels.
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
- **Priority wears one hue stepped by urgency**, darkest most urgent, because
  it is ordered rather than a set of unrelated categories. The step follows the
  level's value, so a level keeps its colour between runs.
- **An event the mine has not located has no position in the scene.** Drawing
  it anywhere would mean using the ground truth, which is exactly what the
  mine does not have. Its sensors light up instead, and the wait is the part
  of the picture the autoscaler is responsible for.
- **Intent's colours are their own.** Kept is the estimate blue, decayed a
  brown and promoted a magenta, validated for colour-vision deficiency on the
  chart surface in both themes, and distinct from the risk palette so an event's
  treatment is never read as someone's danger.
- **An intent edit sends only what changed.** It is a patch against the version
  the form was loaded from, so it cannot quietly undo a change another operator
  made to a field this form did not touch; a stale version is refused and the
  form reloads.
- **three.js loads only with the mine view.** It is larger than the rest of the
  app, and most visits never draw a mine.

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

## The rest of the platform

Three sibling repositories: **simlab-api**, the backend this talks to;
**autoscaler**, the service that actually makes and enacts the scaling
decisions; and **platform-deploy**, which composes all three into one
namespace and documents what they need.

## The API it is written against

`src/api/types.ts` is written by hand from simlab-api's API, and held to it:
`api/simlab-api.openapi.json` is a copy of simlab-api's OpenAPI document,
stamped with the version it came from, and `src/api/types.contract.test.ts`
fails when a type declares a field the document does not have. `make api-spec`
refreshes the copy from the sibling checkout; refreshing it is a change to
review, since it moves the API this build is written against.

## Versions

Releases are [semantic versions](https://semver.org), tagged `vMAJOR.MINOR.PATCH`
and cut with

```bash
make release VERSION=1.3.0
```

which refuses a dirty tree, a branch other than `main`, a `main` behind its
remote, a version not above the last release, a `CHANGELOG.md` with no section
for it, and failing checks — then tags, with the changelog section as the tag
message, and pushes the commit and the tag together so CI stamps the image with
the release. Between releases a build is a pre-release of the release the
changelog's unreleased section names — `2.0.0-dev.N+<commit>` under a section
headed `## 2.0.0 — unreleased`, the next patch without one — and `.dirty`
when built with uncommitted changes (`make version` prints it). The bundle carries its
version and commit.

The web app produces no results of its own, so its versions promise what an
operator relies on:

- **MAJOR** — a view or workflow is removed or changes what it shows, or it
  needs a new MAJOR of simlab-api.
- **MINOR** — something is added.
- **PATCH** — a fix.

The sidebar shows the version and commit of this app, simlab-api and the
autoscaler, and each run's page shows the builds that produced it and the
command that reproduces it.

## Deployment

`deploy/chart` serves the built app from nginx and proxies `/api` to
simlab-api, so the browser sees one origin: no CORS, no hostname baked in at
build time, and the event stream is not a cross-origin request. Buffering is
off along the whole path — an ingress that buffers turns a live run into one
long silence followed by everything at once.
