import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { Layout, Point } from '../api/types'
import type { SceneAt } from './MineView.internals'
import { SCENE_SIZE, isClick, nearestWithin, toScene } from './MineView.internals'
import { cssVar } from '../components/theme'

interface Props {
  layout: Layout
  scene: SceneAt
  /** Draw where events really were. The mine never knew this. */
  showTruth: boolean
  selected: number | null
  onSelect: (sequence: number | null) => void
  /** Called once if the browser cannot give this a WebGL context. */
  onUnavailable: () => void
  /** Changes when the colour scheme does, so the scene re-reads its tokens. */
  theme: number
}

/** Everything built for one layout, kept together so it can be updated each
 *  frame and disposed of as one. */
interface Stage {
  renderer: THREE.WebGLRenderer
  labels: CSS2DRenderer
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  world: THREE.Scene
  sensors: THREE.InstancedMesh
  sensorIndex: Map<string, number>
  first: InstancedPool
  final: InstancedPool
  truth: InstancedPool
  errors: THREE.LineSegments
  selection: THREE.Mesh
  colours: Record<'sensor' | 'busy' | 'estimate' | 'truth' | 'surface', THREE.Color>
  render: () => void
}

/**
 * The virtual mine, drawn with three.js.
 *
 * Imperative on purpose, like the uPlot wrapper: the scene is built once per
 * layout and updated in place as the scrubber moves, rather than rebuilt by
 * React on every frame. What to draw is decided by `sceneAt`, which is tested;
 * this only draws it.
 *
 * Renders on demand — when the data changes or the camera moves — rather than
 * in a continuous loop, so a view left open in a tab costs nothing.
 */
export function MineScene({ layout, scene, showTruth, selected, onSelect, onUnavailable, theme }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)

  // Callbacks and the latest data in refs, so a new closure from the parent
  // does not tear down a WebGL context.
  const select = useRef(onSelect)
  select.current = onSelect
  const unavailable = useRef(onUnavailable)
  unavailable.current = onUnavailable
  const latest = useRef({ scene, showTruth, selected })
  latest.current = { scene, showTruth, selected }

  useEffect(() => {
    const host = container.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      unavailable.current()
      return
    }
    const built = build(host, renderer, layout)
    stage.current = built
    update(built, layout, latest.current)

    // A click selects; a drag rotates the camera and must not also select
    // whatever happened to be under the pointer when it ended.
    let down: { x: number; y: number } | null = null
    const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const onUp = (e: PointerEvent) => {
      if (!down || !isClick(down, { x: e.clientX, y: e.clientY })) return
      down = null
      select.current(pick(built, host, e))
    }
    const canvas = built.renderer.domElement
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointerup', onUp)

    const resize = new ResizeObserver(() => {
      const { clientWidth: width, clientHeight: height } = host
      if (width === 0 || height === 0) return
      built.renderer.setSize(width, height)
      built.labels.setSize(width, height)
      built.camera.aspect = width / height
      built.camera.updateProjectionMatrix()
      built.render()
    })
    resize.observe(host)

    return () => {
      resize.disconnect()
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointerup', onUp)
      dispose(built)
      host.replaceChildren()
      stage.current = null
    }
  }, [layout, theme])

  useEffect(() => {
    if (stage.current) update(stage.current, layout, { scene, showTruth, selected })
  }, [layout, scene, showTruth, selected])

  return <div ref={container} className="mine-canvas" />
}

/** An instanced mesh that remembers which event each instance is, and where
 *  it was drawn, for picking. */
interface InstancedPool {
  mesh: THREE.InstancedMesh
  sequences: number[]
  positions: THREE.Vector3[]
}

function pool(world: THREE.Scene, geometry: THREE.BufferGeometry, material: THREE.Material, capacity: number): InstancedPool {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity)
  mesh.count = 0
  mesh.frustumCulled = false
  world.add(mesh)
  return { mesh, sequences: [], positions: [] }
}

function build(host: HTMLDivElement, renderer: THREE.WebGLRenderer, layout: Layout): Stage {
  const width = host.clientWidth || 800
  const height = host.clientHeight || 500

  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.setSize(width, height)
  host.append(renderer.domElement)

  const labels = new CSS2DRenderer()
  labels.setSize(width, height)
  labels.domElement.className = 'mine-labels'
  host.append(labels.domElement)

  const world = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 200)
  camera.position.set(SCENE_SIZE * 0.85, SCENE_SIZE * 0.7, SCENE_SIZE * 1.15)

  // Controls listen on the canvas, not the label layer above it, which takes
  // no pointer events.
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0, 0)
  controls.minDistance = SCENE_SIZE * 0.3
  controls.maxDistance = SCENE_SIZE * 4
  controls.update()

  const colours = {
    sensor: new THREE.Color(cssVar('--mine-sensor')),
    busy: new THREE.Color(cssVar('--mine-busy')),
    estimate: new THREE.Color(cssVar('--mine-estimate')),
    truth: new THREE.Color(cssVar('--mine-truth')),
    surface: new THREE.Color(cssVar('--surface')),
  }

  addRock(world, layout)

  const sensorIndex = new Map<string, number>()
  const sensors = new THREE.InstancedMesh(
    new THREE.SphereGeometry(SCENE_SIZE * 0.009, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    Math.max(layout.sensors.length, 1),
  )
  sensors.count = layout.sensors.length
  sensors.frustumCulled = false
  layout.sensors.forEach((sensor, i) => sensorIndex.set(sensor.id, i))
  world.add(sensors)

  const capacity = 256
  const markerSize = SCENE_SIZE * 0.014
  const first = pool(world, new THREE.IcosahedronGeometry(markerSize, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }), capacity)
  const final = pool(world, new THREE.SphereGeometry(markerSize, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffffff }), capacity)
  const truth = pool(world, new THREE.OctahedronGeometry(markerSize * 0.8),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true }), capacity)

  const errors = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: colours.truth, transparent: true, opacity: 0.45 }),
  )
  errors.frustumCulled = false
  world.add(errors)

  const selection = new THREE.Mesh(
    new THREE.SphereGeometry(markerSize * 2.6, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--mine-selected')), wireframe: true }),
  )
  selection.visible = false
  world.add(selection)

  const stage: Stage = {
    renderer, labels, camera, controls, world, sensors, sensorIndex,
    first, final, truth, errors, selection, colours,
    render: () => {
      renderer.render(world, camera)
      labels.render(world, camera)
    },
  }
  controls.addEventListener('change', stage.render)
  return stage
}

/** The rock: the mine's extent, a faint outline at each level, and labels a
 *  reader can orient by. */
function addRock(world: THREE.Scene, layout: Layout) {
  const { min, max } = layout.extent
  const at = (point: Point) => {
    const p = toScene(point, layout.extent)
    return new THREE.Vector3(p.x, p.y, p.z)
  }

  const rock = new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--mine-rock')) })
  const corners = [
    at({ x: min.x, y: min.y, z: min.z }), at({ x: max.x, y: min.y, z: min.z }),
    at({ x: max.x, y: max.y, z: min.z }), at({ x: min.x, y: max.y, z: min.z }),
    at({ x: min.x, y: min.y, z: max.z }), at({ x: max.x, y: min.y, z: max.z }),
    at({ x: max.x, y: max.y, z: max.z }), at({ x: min.x, y: max.y, z: max.z }),
  ]
  const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]
  const box = new THREE.BufferGeometry().setFromPoints(edges.flatMap(([a, b]) => [corners[a!]!, corners[b!]!]))
  world.add(new THREE.LineSegments(box, rock))

  // Levels at round elevations, so they read as the levels a mine plan names.
  const level = new THREE.LineBasicMaterial({ color: new THREE.Color(cssVar('--mine-level')) })
  const step = levelStep(max.z - min.z)
  for (let z = Math.ceil(min.z / step) * step; z <= max.z; z += step) {
    const outline = new THREE.BufferGeometry().setFromPoints([
      at({ x: min.x, y: min.y, z }), at({ x: max.x, y: min.y, z }),
      at({ x: max.x, y: max.y, z }), at({ x: min.x, y: max.y, z }),
      at({ x: min.x, y: min.y, z }),
    ])
    world.add(new THREE.Line(outline, level))
    world.add(label(`${Math.round(z)} m`, at({ x: min.x, y: min.y, z }), 'mine-label level'))
  }
  world.add(label('N', at({ x: (min.x + max.x) / 2, y: max.y, z: max.z }), 'mine-label north'))
}

/** A level interval that gives four to eight outlines, whatever the depth. */
function levelStep(span: number): number {
  for (const step of [50, 100, 200, 250, 500, 1000]) {
    if (span / step <= 8) return step
  }
  return 2000
}

function label(text: string, at: THREE.Vector3, className: string): CSS2DObject {
  const element = document.createElement('span')
  element.className = className
  element.textContent = text
  const object = new CSS2DObject(element)
  object.position.copy(at)
  return object
}

const scratch = new THREE.Matrix4()
const colour = new THREE.Color()

function place(target: THREE.InstancedMesh, index: number, at: THREE.Vector3, scale = 1) {
  scratch.makeScale(scale, scale, scale).setPosition(at)
  target.setMatrixAt(index, scratch)
}

/** Grows a pool when the scene has more events than it was built for. */
function ensure(stage: Stage, which: 'first' | 'final' | 'truth', needed: number) {
  const current = stage[which]
  if (current.mesh.instanceMatrix.count >= needed) return
  let capacity = current.mesh.instanceMatrix.count
  while (capacity < needed) capacity *= 2
  stage.world.remove(current.mesh)
  current.mesh.dispose()
  stage[which] = pool(stage.world, current.mesh.geometry, current.mesh.material as THREE.Material, capacity)
}

function update(stage: Stage, layout: Layout, { scene, showTruth, selected }: {
  scene: SceneAt; showTruth: boolean; selected: number | null
}) {
  const vector = (point: Point) => {
    const p = toScene(point, layout.extent)
    return new THREE.Vector3(p.x, p.y, p.z)
  }

  layout.sensors.forEach((sensor, i) => {
    const busy = scene.busySensors.get(sensor.id) ?? 0
    // A little bigger with more outstanding work, and capped low. A burst is
    // heard by most of the array at once, so busy sensors are often most of
    // the sensors; sized by backlog without a cap they buried the events the
    // view exists to show.
    place(stage.sensors, i, vector(sensor.at), busy > 0 ? 1.3 + Math.min(busy, 20) * 0.035 : 1)
    stage.sensors.setColorAt(i, busy > 0 ? stage.colours.busy : stage.colours.sensor)
  })
  stage.sensors.instanceMatrix.needsUpdate = true
  if (stage.sensors.instanceColor) stage.sensors.instanceColor.needsUpdate = true

  const located = scene.visible.filter((v) => v.position)
  ensure(stage, 'first', located.length)
  ensure(stage, 'final', located.length)
  ensure(stage, 'truth', scene.visible.length)

  const pools = { first: stage.first, final: stage.final, truth: stage.truth }
  for (const p of Object.values(pools)) {
    p.mesh.count = 0
    p.sequences = []
    p.positions = []
  }

  const lines: THREE.Vector3[] = []
  let selectedAt: THREE.Vector3 | null = null

  for (const visible of scene.visible) {
    const truthAt = vector(visible.event.truth)
    if (visible.position) {
      const target = visible.state === 'located' ? pools.first : pools.final
      const at = vector(visible.position.at)
      const i = target.mesh.count++
      place(target.mesh, i, at)
      // Fading toward the surface rather than toward transparency: instances
      // share one material, and per-instance colour is what they can vary.
      target.mesh.setColorAt(i, colour.copy(stage.colours.estimate).lerp(stage.colours.surface, visible.age * 0.8))
      target.sequences.push(visible.event.sequence)
      target.positions.push(at)
      if (showTruth) lines.push(at, truthAt)
      if (visible.event.sequence === selected) selectedAt = at
    }
    if (showTruth) {
      const i = pools.truth.mesh.count++
      place(pools.truth.mesh, i, truthAt)
      pools.truth.mesh.setColorAt(i, colour.copy(stage.colours.truth).lerp(stage.colours.surface, visible.age * 0.8))
      pools.truth.sequences.push(visible.event.sequence)
      pools.truth.positions.push(truthAt)
      if (visible.event.sequence === selected && !selectedAt) selectedAt = truthAt
    }
  }

  for (const p of Object.values(pools)) {
    p.mesh.instanceMatrix.needsUpdate = true
    if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true
  }

  stage.errors.geometry.dispose()
  stage.errors.geometry = new THREE.BufferGeometry().setFromPoints(lines)

  stage.selection.visible = selectedAt !== null
  if (selectedAt) stage.selection.position.copy(selectedAt)

  stage.render()
}

/** The event under a click, or null for empty space.
 *
 *  By distance on screen rather than by raycast. A marker is a few pixels
 *  across, which is too small a target to hit reliably, and a raycast against
 *  instanced meshes also depends on a bounding volume that three.js caches and
 *  does not refresh as instances move — the first version missed every click
 *  for that reason. */
function pick(stage: Stage, host: HTMLDivElement, event: PointerEvent): number | null {
  const bounds = host.getBoundingClientRect()
  const projected = new THREE.Vector3()
  const marks: { x: number; y: number; sequence: number }[] = []
  for (const p of [stage.final, stage.first, stage.truth]) {
    p.positions.forEach((position, i) => {
      projected.copy(position).project(stage.camera)
      // Behind the camera projects to a mirrored point in front of it.
      if (projected.z > 1) return
      marks.push({
        x: ((projected.x + 1) / 2) * bounds.width,
        y: ((1 - projected.y) / 2) * bounds.height,
        sequence: p.sequences[i]!,
      })
    })
  }
  return nearestWithin(marks, { x: event.clientX - bounds.left, y: event.clientY - bounds.top }, 14)
}

function dispose(stage: Stage) {
  stage.controls.dispose()
  stage.world.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.LineSegments) {
      object.geometry.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material.dispose()
    }
  })
  stage.renderer.dispose()
}
