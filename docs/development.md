# Working on the Simlab frontend

```bash
npm install
npm run dev        # http://localhost:5173, proxying /api to :8081
npm test
npm run typecheck
npm run build
```

`npm run dev` needs simlab-api running on :8081, which in turn needs an
autoscaler. See simlab-api's development guide for the two commands that get
both up.

## Where things live

| Path | What it owns |
|---|---|
| `src/api/` | The typed client and the shapes it returns. |
| `src/state/` | The live event stream. |
| `src/components/` | Charts, tiles, badges, and every formatting decision. |
| `src/views/` | One file per screen. |
| `src/styles.css` | The whole palette, as tokens. |

## Conventions worth keeping

**Colours come from tokens, never from literals.** `--local` and `--cloud` mean
one thing across every chart, badge and table, so a reader learns them once. A
hardcoded hex breaks that and breaks dark mode at the same time.

**Formatting lives in `components/format.ts`.** A duration or a percentage
should read identically wherever it appears. The tests there encode judgements
that are easy to undo by accident — a breach rate of one in a thousand
rounding to "0%" would hide exactly what a run was measuring.

**Logic that decides what a chart shows gets extracted and tested.** A chart
that is subtly wrong is very hard to catch by looking at it, so
`RunDetailView.internals.ts` holds the timeline arithmetic and has tests of
its own, and `MineView.internals.ts` decides what the 3D scene draws at a
moment — which is even harder to check by eye. `MineScene.tsx` only draws
what it is handed; if a scene needs a decision, it belongs in the internals. The same goes for turning a form into a settings patch: a blank field
must be dropped, not sent as zero, or every run would silently disable the
cloud tier.

**The compiler stays strict.** `exactOptionalPropertyTypes` and
`noUncheckedIndexedAccess` are on, and they have already caught real gaps. Fix
the call site rather than relaxing the setting.

**The stream is not the record.** The backend drops events for a watcher that
has fallen behind rather than slowing a run down, and browsers reconnect an
EventSource on their own. Anything that must be complete is refetched from the
API; the stream only makes it arrive sooner. `state/useRunCycles.ts` is how a
view gets a run's timeline: it reads every page, and goes back to the API
whenever the stream skips a cycle, reconnects, or the run ends.

**The 3D scene renders on demand**, when its data changes or the camera
moves, not in a loop. A drag that ends over an event rotates the camera and
does not select it; `isClick` is the test of which one happened.

## Adding a view

Add it to `src/App.tsx`'s routes and to the sidebar. If it needs data the
client does not expose yet, add a method to `src/api/client.ts` and the shape
to `src/api/types.ts` — those follow simlab-api's `openapi.yaml`, which its own
contract test keeps honest.
