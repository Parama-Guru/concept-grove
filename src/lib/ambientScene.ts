import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  DirectionalLight,
  DynamicDrawUsage,
  EllipseCurve,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  LineDashedMaterial,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NoToneMapping,
  Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  WebGLRenderer,
  type Material,
  type Texture,
} from 'three'

export interface AmbientSceneHandle {
  setRunning(running: boolean): void
  dispose(): void
}

const CARD_WIDTH = 2
const CARD_HEIGHT = 2.7
const CARD_DEPTH = 0.04
const HALF_HEIGHT = 2.5
const FRAME_INTERVAL = 1000 / 30
const PARTICLE_COUNT = 10

type CardKind = 'front' | 'middle' | 'back'

const PAPER_COLORS: Record<CardKind, string> = {
  front: '#fbfdf5',
  middle: '#f7f8e8',
  back: '#d8e3c6',
}

interface FloatingCard {
  group: Group
  x: number
  y: number
  angle: number
  phase: number
  initialSin: number
  initialCos: number
}

function track<T, U extends T>(resources: Set<T>, resource: U): U {
  resources.add(resource)
  return resource
}

function safely(action: () => void): void {
  try {
    action()
  } catch {
    // A failed cleanup or consumer callback must not prevent the remaining cleanup.
  }
}

function disposeAll<T extends { dispose(): void }>(resources: Set<T>): void {
  for (const resource of resources) safely(() => resource.dispose())
  resources.clear()
}

function drawLabel(context: CanvasRenderingContext2D, text: string): void {
  context.font = '600 18px Arial, sans-serif'
  context.fillStyle = '#60734f'
  context.textBaseline = 'middle'
  context.textAlign = 'left'
  const letters = [...text]
  const spacing = 2.1
  const width = letters.reduce((sum, letter) => sum + context.measureText(letter).width, 0)
    + (letters.length - 1) * spacing
  let x = (512 - width) / 2
  for (const letter of letters) {
    context.fillText(letter, x, 77)
    x += context.measureText(letter).width + spacing
  }
}

function drawFaintLines(context: CanvasRenderingContext2D, color: string, y: number): void {
  context.strokeStyle = color
  context.lineWidth = 5
  context.lineCap = 'round'
  context.beginPath()
  context.moveTo(151, y)
  context.lineTo(361, y)
  context.moveTo(184, y + 22)
  context.lineTo(328, y + 22)
  context.stroke()
}

function drawCard(context: CanvasRenderingContext2D, kind: CardKind): void {
  context.fillStyle = PAPER_COLORS[kind]
  context.fillRect(0, 0, 512, 672)

  if (kind === 'front') {
    drawLabel(context, 'A LITTLE EVERY DAY')
    context.fillStyle = '#eaf0e2'
    context.beginPath()
    context.arc(256, 278, 103, 0, Math.PI * 2)
    context.fill()

    context.strokeStyle = '#58774c'
    context.lineWidth = 6
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(249, 345)
    context.bezierCurveTo(244, 299, 254, 241, 283, 211)
    context.stroke()

    context.fillStyle = '#809d69'
    context.beginPath()
    context.moveTo(252, 291)
    context.bezierCurveTo(210, 299, 183, 267, 184, 237)
    context.bezierCurveTo(222, 234, 249, 256, 252, 291)
    context.fill()

    context.fillStyle = '#5f804f'
    context.beginPath()
    context.moveTo(260, 258)
    context.bezierCurveTo(253, 222, 283, 192, 321, 197)
    context.bezierCurveTo(316, 231, 291, 260, 260, 258)
    context.fill()

    context.strokeStyle = '#cbdabb'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(246, 284)
    context.quadraticCurveTo(222, 266, 204, 251)
    context.moveTo(264, 252)
    context.quadraticCurveTo(283, 230, 303, 212)
    context.stroke()

    context.fillStyle = '#3e5537'
    context.font = 'italic 39px Georgia, serif'
    context.textAlign = 'center'
    context.fillText('Ideas take root.', 256, 446)
    drawFaintLines(context, '#e0e7d6', 493)
  } else if (kind === 'middle') {
    drawLabel(context, 'THE CONNECTIONS')
    const layers = [
      [[136, 241], [136, 330]],
      [[254, 197], [254, 284], [254, 371]],
      [[376, 241], [376, 330]],
    ] as const

    context.strokeStyle = '#bdcbaa'
    context.lineWidth = 2
    context.beginPath()
    for (let layer = 1; layer < layers.length; layer += 1) {
      const previous = layers[layer - 1]
      const next = layers[layer]
      if (!previous || !next) continue
      for (const [x, y] of previous) {
        for (const [nextX, nextY] of next) {
          context.moveTo(x, y)
          context.lineTo(nextX, nextY)
        }
      }
    }
    context.stroke()

    for (const layer of layers) {
      for (const [x, y] of layer) {
        context.fillStyle = '#e3ebd5'
        context.beginPath()
        context.arc(x, y, 18, 0, Math.PI * 2)
        context.fill()
        context.fillStyle = '#78965e'
        context.beginPath()
        context.arc(x, y, 7, 0, Math.PI * 2)
        context.fill()
      }
    }
    drawFaintLines(context, '#d5dfc6', 472)
  } else {
    drawLabel(context, 'THE POSSIBILITIES')
    context.textAlign = 'center'
    context.font = 'italic 98px Georgia, serif'
    context.fillStyle = '#6d875b'
    context.fillText('f(x)', 256, 272)
    context.strokeStyle = '#a9bc95'
    context.lineWidth = 3
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(154, 380)
    context.bezierCurveTo(218, 336, 234, 388, 274, 346)
    context.bezierCurveTo(304, 314, 329, 327, 360, 304)
    context.stroke()
    drawFaintLines(context, '#bdceac', 473)
  }

  context.strokeStyle = kind === 'back' ? '#c0d0af' : '#e0e6d5'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(53, 568)
  context.lineTo(459, 568)
  context.stroke()
  context.textAlign = 'center'
  context.fillStyle = '#7c8c6c'
  context.font = '15px Arial, sans-serif'
  context.fillText(`${kind === 'front' ? '01' : kind === 'middle' ? '02' : '03'} · CONCEPT GROVE`, 256, 610)
}

function roundedCardShape(): Shape {
  const shape = new Shape()
  const left = -CARD_WIDTH / 2
  const right = CARD_WIDTH / 2
  const bottom = -CARD_HEIGHT / 2
  const top = CARD_HEIGHT / 2
  const radius = 0.12
  shape.moveTo(left + radius, bottom)
  shape.lineTo(right - radius, bottom)
  shape.quadraticCurveTo(right, bottom, right, bottom + radius)
  shape.lineTo(right, top - radius)
  shape.quadraticCurveTo(right, top, right - radius, top)
  shape.lineTo(left + radius, top)
  shape.quadraticCurveTo(left, top, left, top - radius)
  shape.lineTo(left, bottom + radius)
  shape.quadraticCurveTo(left, bottom, left + radius, bottom)
  shape.closePath()
  return shape
}

/** Kept behind the parent's dynamic import; no browser or GPU work occurs at module scope. */
export function createAmbientScene(
  host: HTMLElement,
  onUnavailable: () => void,
): AmbientSceneHandle | null {
  const document = host.ownerDocument
  const view = document.defaultView
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  const instances = new Set<InstancedMesh>()
  const textureCanvases = new Set<HTMLCanvasElement>()
  const cards: FloatingCard[] = []
  let canvas: HTMLCanvasElement | null = null
  let context: WebGL2RenderingContext | null = null
  let renderer: WebGLRenderer | null = null
  let observer: ResizeObserver | null = null
  let scene: Scene | null = null
  let camera: OrthographicCamera | null = null
  let stack: Group | null = null
  let particles: InstancedMesh | null = null
  let particleCurve: EllipseCurve | null = null
  let particleTransform: Object3D | null = null
  let particlePoint: Vector2 | null = null
  let disposed = false
  let running = false
  let frameRequest: number | null = null
  let previousTick: number | null = null
  let lastRender = -Infinity
  let elapsed = 0
  let width = 0
  let height = 0

  function stopLoop(): void {
    const pending = frameRequest
    frameRequest = null
    if (pending !== null) safely(() => view?.cancelAnimationFrame(pending))
    previousTick = null
    if (running) {
      running = false
      if (canvas) canvas.dataset.rendering = 'false'
    }
  }

  function cleanup(intentional: boolean): void {
    if (disposed) return
    disposed = true
    stopLoop()
    safely(() => observer?.disconnect())
    observer = null
    // Remove our listener before disposal removes Three's listeners and loses the context.
    canvas?.removeEventListener('webglcontextlost', handleContextLost, true)
    disposeAll(instances)
    disposeAll(geometries)
    disposeAll(materials)
    disposeAll(textures)

    const activeRenderer = renderer
    renderer = null
    if (activeRenderer) {
      safely(() => activeRenderer.renderLists.dispose())
      safely(() => activeRenderer.dispose())
    }
    if (intentional) {
      if (activeRenderer) {
        safely(() => activeRenderer.forceContextLoss())
      } else {
        // Also releases a context when the renderer constructor failed partway through.
        safely(() => context?.getExtension('WEBGL_lose_context')?.loseContext())
      }
    }
    context = null
    safely(() => canvas?.remove())
    canvas = null
    for (const surface of textureCanvases) {
      safely(() => { surface.width = 0; surface.height = 0 })
    }
    textureCanvases.clear()
    scene?.clear()
    scene = null
    camera = null
    stack = null
    particles = null
    particleCurve = null
    particleTransform = null
    particlePoint = null
    cards.length = 0
  }

  function unavailable(intentional = true): void {
    if (disposed) return
    cleanup(intentional)
    safely(onUnavailable)
  }

  function handleContextLost(event: Event): void {
    event.preventDefault()
    unavailable(false)
  }

  function makeTexture(
    textureWidth: number,
    textureHeight: number,
    paint: (drawing: CanvasRenderingContext2D) => void,
  ): CanvasTexture {
    const surface = track(textureCanvases, document.createElement('canvas'))
    surface.width = textureWidth
    surface.height = textureHeight
    const drawing = surface.getContext('2d')
    if (!drawing) throw new Error('Canvas drawing is unavailable')
    paint(drawing)
    const texture = track(textures, new CanvasTexture(surface))
    texture.colorSpace = SRGBColorSpace
    // The cards keep their one-time mipmaps to avoid shimmering during subpixel motion.
    return texture
  }

  function resize(nextWidth: number, nextHeight: number): void {
    if (disposed || !renderer || !camera) return
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) return
    if (nextWidth <= 0 || nextHeight <= 0) return
    const roundedWidth = Math.max(1, Math.round(nextWidth))
    const roundedHeight = Math.max(1, Math.round(nextHeight))
    if (width === roundedWidth && height === roundedHeight) return
    width = roundedWidth
    height = roundedHeight
    const halfWidth = HALF_HEIGHT * width / height
    camera.left = -halfWidth
    camera.right = halfWidth
    camera.top = HALF_HEIGHT
    camera.bottom = -HALF_HEIGHT
    camera.updateProjectionMatrix()
    renderer.setSize(width, height, false)
    // The existing RAF draws the new size only while running, preserving the 30 fps cap.
  }

  function updateMotion(): void {
    if (stack) {
      stack.rotation.x = -0.1 + Math.sin(elapsed * 0.22) * 0.012
      stack.rotation.y = -0.16 + Math.sin(elapsed * 0.19) * 0.018
    }
    for (const card of cards) {
      card.group.position.x = card.x
        + (Math.cos(elapsed * 0.3 + card.phase) - card.initialCos) * 0.016
      card.group.position.y = card.y
        + (Math.sin(elapsed * 0.68 + card.phase) - card.initialSin) * 0.035
      card.group.rotation.z = card.angle
        + (Math.sin(elapsed * 0.42 + card.phase) - card.initialSin) * 0.009
      card.group.rotation.x = (Math.sin(elapsed * 0.35 + card.phase) - card.initialSin) * 0.009
    }
    if (particles && particleCurve && particleTransform && particlePoint) {
      for (let index = 0; index < PARTICLE_COUNT; index += 1) {
        const arc = (index / PARTICLE_COUNT + Math.sin(elapsed * 0.24 + index) * 0.008 + 1) % 1
        particleCurve.getPoint(arc, particlePoint)
        particleTransform.position.set(particlePoint.x, particlePoint.y, -1.24)
        particleTransform.scale.setScalar(index % 3 === 0 ? 1.2 : 0.8)
        particleTransform.updateMatrix()
        particles.setMatrixAt(index, particleTransform.matrix)
      }
      particles.instanceMatrix.needsUpdate = true
    }
  }

  function draw(timestamp: number): boolean {
    if (disposed || !renderer || !scene || !camera) return false
    try {
      if (context?.isContextLost()) {
        unavailable(false)
        return false
      }
      renderer.render(scene, camera)
      lastRender = timestamp
      return !disposed
    } catch {
      unavailable()
      return false
    }
  }

  function tick(timestamp: number): void {
    frameRequest = null
    if (!running || disposed || !view) return
    try {
      if (previousTick !== null) {
        elapsed += Math.min(Math.max(timestamp - previousTick, 0), 50) / 1000
      }
      previousTick = timestamp
      if (timestamp - lastRender >= FRAME_INTERVAL) {
        updateMotion()
        if (!draw(timestamp)) return
      }
      if (running && !disposed) frameRequest = view.requestAnimationFrame(tick)
    } catch {
      unavailable()
    }
  }

  function setRunning(nextRunning: boolean): void {
    if (disposed || nextRunning === running || !view) return
    if (!nextRunning) {
      stopLoop()
      return
    }
    try {
      running = true
      previousTick = null
      if (canvas) canvas.dataset.rendering = 'true'
      frameRequest = view.requestAnimationFrame(tick)
    } catch {
      unavailable()
    }
  }

  try {
    canvas = document.createElement('canvas')
    const options: WebGLContextAttributes = {
      alpha: true,
      antialias: true,
      depth: true,
      stencil: false,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      powerPreference: 'low-power',
    }
    // Probe first: Three must never attempt (and log about) creating an unavailable context.
    context = canvas.getContext('webgl2', options)
    if (!context || !view) {
      unavailable()
      return null
    }
    canvas.addEventListener('webglcontextlost', handleContextLost, true)
    const pixelRatio = Math.min(view.devicePixelRatio || 1, 1.5)
    canvas.dataset.renderer = 'threejs'
    canvas.dataset.rendering = 'false'
    canvas.dataset.pixelRatio = String(pixelRatio)
    canvas.dataset.fpsCap = '30'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.pointerEvents = 'none'

    renderer = new WebGLRenderer({ canvas, context, ...options })
    renderer.setPixelRatio(pixelRatio)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = SRGBColorSpace
    renderer.toneMapping = NoToneMapping
    renderer.shadowMap.enabled = false
    renderer.debug.onShaderError = () => { throw new Error('Ambient shader is unavailable') }
    scene = new Scene()
    camera = new OrthographicCamera(-HALF_HEIGHT, HALF_HEIGHT, HALF_HEIGHT, -HALF_HEIGHT, 0.1, 100)
    camera.position.z = 10
    stack = new Group()
    stack.rotation.set(-0.1, -0.16, 0)
    scene.add(stack)
    scene.add(new AmbientLight(0xffffff, 1.65))
    const light = new DirectionalLight(0xffffff, 1.3)
    light.position.set(-3, 5, 8)
    scene.add(light)

    const shape = roundedCardShape()
    const paperGeometry = track(geometries, new ExtrudeGeometry(shape, {
      depth: CARD_DEPTH,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 8,
    }))
    paperGeometry.translate(0, 0, -CARD_DEPTH / 2)
    const faceGeometry = track(geometries, new ShapeGeometry(shape, 8))
    const positions = faceGeometry.getAttribute('position')
    const uv = faceGeometry.getAttribute('uv')
    for (let index = 0; index < positions.count; index += 1) {
      uv.setXY(index, positions.getX(index) / CARD_WIDTH + 0.5, positions.getY(index) / CARD_HEIGHT + 0.5)
    }
    uv.needsUpdate = true

    const cardSpecs = [
      { kind: 'back', x: 0.85, y: 0.3, z: -0.6, angle: -0.32, phase: 3.9 },
      { kind: 'middle', x: -0.85, y: 0.1, z: 0, angle: 0.3, phase: 2.1 },
      { kind: 'front', x: 0.25, y: -0.25, z: 0.6, angle: -0.12, phase: 0 },
    ] as const
    for (const spec of cardSpecs) {
      const texture = makeTexture(512, 672, drawing => drawCard(drawing, spec.kind))
      const paperMaterial = track(materials, new MeshStandardMaterial({
        color: PAPER_COLORS[spec.kind],
        roughness: 0.95,
        metalness: 0,
      }))
      const faceMaterial = track(materials, new MeshBasicMaterial({
        map: texture,
        color: 0xffffff,
        toneMapped: false,
      }))
      const group = new Group()
      group.position.set(spec.x, spec.y, spec.z)
      group.rotation.z = spec.angle
      group.add(new Mesh(paperGeometry, paperMaterial))
      const face = new Mesh(faceGeometry, faceMaterial)
      face.position.z = CARD_DEPTH / 2 + 0.001
      group.add(face)
      stack.add(group)
      cards.push({
        group,
        x: spec.x,
        y: spec.y,
        angle: spec.angle,
        phase: spec.phase,
        initialSin: Math.sin(spec.phase),
        initialCos: Math.cos(spec.phase),
      })
    }

    particleCurve = new EllipseCurve(0, 0, 2.54, 1.66, 0, Math.PI * 2, false, 0.25)
    const secondCurve = new EllipseCurve(0, 0.04, 2.72, 1.32, 0, Math.PI * 2, false, -0.38)
    const orbitGeometry = track(geometries, new BufferGeometry())
    orbitGeometry.setFromPoints(particleCurve.getPoints(79)) // 80 points including closure.
    const orbitMaterial = track(materials, new LineBasicMaterial({
      color: '#92a579', transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false,
    }))
    const orbit = new Line(orbitGeometry, orbitMaterial)
    orbit.position.z = -1.35
    scene.add(orbit)
    const secondGeometry = track(geometries, new BufferGeometry())
    secondGeometry.setFromPoints(secondCurve.getPoints(79))
    const secondMaterial = track(materials, new LineDashedMaterial({
      color: '#9dad89', transparent: true, opacity: 0.28, depthWrite: false,
      dashSize: 0.065, gapSize: 0.095, toneMapped: false,
    }))
    const secondOrbit = new Line(secondGeometry, secondMaterial)
    secondOrbit.position.z = -1.4
    secondOrbit.computeLineDistances()
    scene.add(secondOrbit)

    const particleGeometry = track(geometries, new SphereGeometry(0.029, 6, 4))
    const particleMaterial = track(materials, new MeshBasicMaterial({
      color: '#8ba274', transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false,
    }))
    particles = track(instances, new InstancedMesh(particleGeometry, particleMaterial, PARTICLE_COUNT))
    particles.instanceMatrix.setUsage(DynamicDrawUsage)
    particles.frustumCulled = false
    particleTransform = new Object3D()
    particlePoint = new Vector2()
    scene.add(particles)

    const shadowTexture = makeTexture(64, 64, drawing => {
      const gradient = drawing.createRadialGradient(32, 32, 0, 32, 32, 32)
      gradient.addColorStop(0, 'rgba(58, 77, 46, 1)')
      gradient.addColorStop(0.45, 'rgba(58, 77, 46, 0.45)')
      gradient.addColorStop(1, 'rgba(58, 77, 46, 0)')
      drawing.fillStyle = gradient
      drawing.fillRect(0, 0, 64, 64)
    })
    shadowTexture.generateMipmaps = false
    shadowTexture.minFilter = LinearFilter
    const shadowGeometry = track(geometries, new PlaneGeometry(4.4, 0.8))
    const shadowMaterial = track(materials, new MeshBasicMaterial({
      map: shadowTexture, transparent: true, opacity: 0.15, depthWrite: false, toneMapped: false,
    }))
    const shadow = new Mesh(shadowGeometry, shadowMaterial)
    shadow.position.set(0.1, -1.91, -1.8)
    scene.add(shadow)

    const bounds = host.getBoundingClientRect()
    resize(bounds.width || 350, bounds.height || 280)
    host.appendChild(canvas)
    observer = new ResizeObserver(entries => {
      if (disposed) return
      try {
        for (const entry of entries) {
          if (entry.target === host) {
            resize(entry.contentRect.width, entry.contentRect.height)
            break
          }
        }
      } catch {
        unavailable()
      }
    })
    observer.observe(host)
    updateMotion()
    if (!draw(view.performance.now())) return null
    // One initial still frame, with visibility/reduced-motion policy owned by the parent.
    return { setRunning, dispose: () => cleanup(true) }
  } catch {
    unavailable()
    return null
  }
}