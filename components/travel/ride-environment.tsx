'use client'

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  BackSide,
  CanvasTexture,
  Color,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type DirectionalLight,
  ShaderMaterial,
  type Group,
  type Mesh,
} from 'three'
import type { GfxSettings, GfxTier } from '@/lib/game/gfx-quality'
import { mulberry32 } from '@/lib/game/world-layout'
import { devPinnedMinute, watMinuteOfDay } from '@/lib/game/wat-clock'

/*
 * Look of the ride: sky, sun, haze, the red earth beside the road and the wear on the tarmac.
 * Everything here is cheap on purpose: one sky shader, one sun (with a shadow map near the camera
 * on the medium and high tiers only), a couple of small canvas textures, no extra lights.
 */

type Offset = { current: number }

/* —— light by the game clock —— */

type Key = {
  h: number
  zenith: string
  horizon: string
  sun: string
  sunInt: number
  hemiSky: string
  hemiGround: string
  hemiInt: number
  /** Street lights: 0 off, 1 fully lit */
  lamp: number
  cloud: number
  stars: number
}

/** Hours are WAT. Golden at both ends of the day, bright and clear at noon, lamps lit from dusk to dawn. */
const KEYS: Key[] = [
  { h: 0, zenith: '#060b1c', horizon: '#18233f', sun: '#8fa6ff', sunInt: 0.5, hemiSky: '#46598a', hemiGround: '#1a1f1a', hemiInt: 0.55, lamp: 1, cloud: 0.35, stars: 1 },
  { h: 5, zenith: '#10183a', horizon: '#3b3a5c', sun: '#8fa6ff', sunInt: 0.5, hemiSky: '#46598a', hemiGround: '#1a1f1a', hemiInt: 0.55, lamp: 1, cloud: 0.4, stars: 0.8 },
  { h: 6.25, zenith: '#5a79a8', horizon: '#f6b27a', sun: '#ffb26a', sunInt: 1.7, hemiSky: '#ffd2a8', hemiGround: '#7a5a42', hemiInt: 0.6, lamp: 0.55, cloud: 0.6, stars: 0.1 },
  { h: 7.75, zenith: '#4f8fd0', horizon: '#f7d9ae', sun: '#ffd9a0', sunInt: 2.3, hemiSky: '#d6e6f5', hemiGround: '#9a8560', hemiInt: 0.6, lamp: 0, cloud: 0.7, stars: 0 },
  { h: 10, zenith: '#3f8fe0', horizon: '#cfe6f5', sun: '#fff1da', sunInt: 2.9, hemiSky: '#eaf3fb', hemiGround: '#a99a70', hemiInt: 0.62, lamp: 0, cloud: 0.75, stars: 0 },
  { h: 13, zenith: '#2f86e6', horizon: '#d4ecfa', sun: '#ffffff', sunInt: 3.1, hemiSky: '#eaf3fb', hemiGround: '#a99a70', hemiInt: 0.62, lamp: 0, cloud: 0.7, stars: 0 },
  { h: 16, zenith: '#4a90dc', horizon: '#ead9b8', sun: '#fff0cf', sunInt: 2.8, hemiSky: '#e6eef6', hemiGround: '#a58f68', hemiInt: 0.6, lamp: 0, cloud: 0.7, stars: 0 },
  { h: 17.75, zenith: '#5f86b8', horizon: '#f8c283', sun: '#ffbd70', sunInt: 2.2, hemiSky: '#ffd9b4', hemiGround: '#7a5a42', hemiInt: 0.6, lamp: 0.2, cloud: 0.65, stars: 0 },
  { h: 18.6, zenith: '#4a5b8c', horizon: '#f08a5a', sun: '#ff8f55', sunInt: 1.4, hemiSky: '#ffbf94', hemiGround: '#5a4838', hemiInt: 0.55, lamp: 0.75, cloud: 0.6, stars: 0.1 },
  { h: 19.4, zenith: '#232b52', horizon: '#8e5a6e', sun: '#a08cc8', sunInt: 0.7, hemiSky: '#7c78a8', hemiGround: '#2c2832', hemiInt: 0.5, lamp: 1, cloud: 0.5, stars: 0.5 },
  { h: 20.5, zenith: '#0a1228', horizon: '#1f2a48', sun: '#8fa6ff', sunInt: 0.5, hemiSky: '#46598a', hemiGround: '#1a1f1a', hemiInt: 0.55, lamp: 1, cloud: 0.4, stars: 1 },
  { h: 24, zenith: '#060b1c', horizon: '#18233f', sun: '#8fa6ff', sunInt: 0.5, hemiSky: '#46598a', hemiGround: '#1a1f1a', hemiInt: 0.55, lamp: 1, cloud: 0.35, stars: 1 },
]

export type RideLook = {
  zenith: Color
  horizon: Color
  sunColor: Color
  sunInt: number
  hemiSky: Color
  hemiGround: Color
  hemiInt: number
  ambient: number
  lamp: number
  level: 'day' | 'dusk' | 'night'
  cloud: number
  cloudColor: Color
  stars: number
  /** Where the sun (or moon) light comes from, and where the visible disc sits */
  lightDir: Vector3
  discDir: Vector3
  discVis: number
  fogNear: number
  fogFar: number
  /** 1 by day, down to 0 at night */
  day: number
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Minute of the day (WAT) for the ride; in development `?time=21:30` pins it. */
export function rideMinute(): number {
  if (typeof window === 'undefined') return 12 * 60
  return devPinnedMinute(window.location.search) ?? watMinuteOfDay()
}

export function rideLookAt(minute: number): RideLook {
  const hour = (minute / 60) % 24
  let i = 0
  while (i < KEYS.length - 2 && hour >= KEYS[i + 1]!.h) i++
  const a = KEYS[i]!
  const b = KEYS[i + 1]!
  const t = smooth(Math.min(1, Math.max(0, (hour - a.h) / (b.h - a.h))))
  const col = (x: string, y: string) => new Color(x).lerp(new Color(y), t)
  const horizon = col(a.horizon, b.horizon)
  const lamp = mix(a.lamp, b.lamp, t)
  const day = Math.min(1, Math.max(0, 1 - lamp * 1.1))
  // Sun path: rises 6:15, sets 18:30, in front and a little to one side so the disc shows ahead and shadows fall toward us
  const span = (hour - 6.25) / 12.25
  const inDay = span > 0 && span < 1
  const arc = Math.PI * Math.min(1, Math.max(0, span))
  const elevation = inDay ? (72 * Math.sin(arc) + 2) * (Math.PI / 180) : -0.1
  const side = Math.cos(arc)
  const dir = (el: number) => new Vector3(side * 0.55 * Math.cos(el), Math.sin(el), -0.8 * Math.cos(el)).normalize()
  // Light never drops below ~16 degrees (long shadows at golden hour, not flat ones), and the moon takes over at night
  const lightEl = inDay ? Math.max(elevation, 0.28) : 0.9
  const lightDir = inDay ? dir(lightEl) : new Vector3(-0.35, 0.8, -0.5).normalize()
  const cloudBase = new Color('#ffffff').lerp(horizon, 0.35).multiplyScalar(0.28 + 0.72 * day)
  return {
    zenith: col(a.zenith, b.zenith),
    horizon,
    sunColor: col(a.sun, b.sun),
    sunInt: mix(a.sunInt, b.sunInt, t),
    hemiSky: col(a.hemiSky, b.hemiSky),
    hemiGround: col(a.hemiGround, b.hemiGround),
    hemiInt: mix(a.hemiInt, b.hemiInt, t),
    ambient: 0.22 + 0.2 * day,
    lamp,
    level: lamp > 0.8 ? 'night' : lamp > 0.3 ? 'dusk' : 'day',
    cloud: mix(a.cloud, b.cloud, t),
    cloudColor: cloudBase,
    stars: mix(a.stars, b.stars, t),
    lightDir,
    discDir: dir(inDay ? Math.max(elevation, 0.005) : -0.2),
    discVis: inDay ? Math.min(1, Math.max(0, elevation * 18)) : 0,
    fogNear: mix(34, 62, day),
    fogFar: mix(170, 245, day),
    day,
  }
}

/* —— sky: gradient, sun disc, soft clouds, stars —— */

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const skyFrag = (octaves: number) => /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSun; uniform vec3 uSunDir; uniform vec3 uCloudCol;
uniform float uSunVis; uniform float uCloud; uniform float uStars; uniform float uTime;
varying vec3 vDir;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){ float a = 0.5; float s = 0.0; for (int i = 0; i < ${octaves}; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
  // a warm band hugging the horizon, and the glow round the sun
  float s = max(dot(d, uSunDir), 0.0);
  col += uSun * (pow(s, 6.0) * 0.22 + pow(s, 40.0) * 0.35) * uSunVis;
  // soft clouds on a flat layer overhead, thinning out toward the horizon
  if (d.y > 0.015) {
    vec2 uv = d.xz / (d.y + 0.28) * 1.5 + vec2(uTime * 0.012, uTime * 0.004);
    float c = smoothstep(0.46, 0.86, fbm(uv)) * uCloud * smoothstep(0.015, 0.22, d.y);
    vec3 lit = uCloudCol + uSun * pow(s, 4.0) * 0.35 * uSunVis;
    col = mix(col, lit, c * 0.85);
  }
  // sun disc
  col = mix(col, uSun * 1.5 + 0.2, smoothstep(0.99935, 0.99965, s) * uSunVis);
  // stars
  float st = step(0.9965, hash(floor(d.xz / (d.y + 0.4) * 160.0))) * uStars * smoothstep(0.08, 0.35, d.y);
  col += vec3(st);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export function RideSky({ look, tier }: { look: RideLook; tier: GfxTier }) {
  const mesh = useRef<Mesh>(null)
  const camera = useThree((s) => s.camera)
  const geometry = useMemo(() => new SphereGeometry(280, tier === 'low' ? 14 : 24, tier === 'low' ? 8 : 14), [tier])
  const material = useMemo(() => {
    const m = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: SKY_VERT,
      fragmentShader: skyFrag(tier === 'low' ? 2 : 4),
      uniforms: {
        uZenith: { value: look.zenith.clone() },
        uHorizon: { value: look.horizon.clone() },
        uSun: { value: look.sunColor.clone() },
        uSunDir: { value: look.discDir.clone() },
        uCloudCol: { value: look.cloudColor.clone() },
        uSunVis: { value: look.discVis },
        uCloud: { value: look.cloud },
        uStars: { value: look.stars },
        uTime: { value: 0 },
      },
    })
    return m
  }, [look, tier])
  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )
  useFrame(({ clock }) => {
    if (mesh.current) mesh.current.position.copy(camera.position)
    material.uniforms.uTime!.value = clock.elapsedTime
  })
  return <mesh ref={mesh} geometry={geometry} material={material} renderOrder={-10} frustumCulled={false} />
}

/* —— sun, sky light, haze —— */

/** Half-width of the area around the camera that gets shadows (m). */
const SHADOW_REACH = 30

export function RideLights({ look, gfx, pose }: { look: RideLook; gfx: GfxSettings; pose: { x: number } }) {
  const sun = useRef<DirectionalLight>(null)
  useLayoutEffect(() => {
    const l = sun.current
    if (!l) return
    const c = l.shadow.camera
    c.left = -SHADOW_REACH
    c.right = SHADOW_REACH
    c.top = SHADOW_REACH
    c.bottom = -SHADOW_REACH
    c.near = 1
    c.far = 170
    c.updateProjectionMatrix()
  }, [gfx.shadows])
  useFrame(() => {
    const l = sun.current
    if (!l) return
    // The shadow box rides with the vehicle: a little ahead of it, where the camera is looking
    l.position.set(pose.x + look.lightDir.x * 80, look.lightDir.y * 80, -12 + look.lightDir.z * 80)
    l.target.position.set(pose.x, 0, -12)
    l.target.updateMatrixWorld()
  })
  return (
    <>
      <color attach="background" args={[look.horizon]} />
      <fog attach="fog" args={[look.horizon, look.fogNear, look.fogFar]} />
      <ambientLight intensity={look.ambient} />
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemiInt]} />
      <directionalLight
        ref={sun}
        color={look.sunColor}
        intensity={look.sunInt}
        castShadow={gfx.shadows}
        shadow-mapSize={[gfx.shadowMap || 512, gfx.shadowMap || 512]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.04}
      />
    </>
  )
}

/* —— red-brown laterite beside the road —— */

function lateriteTexture(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(5150)
  ctx.fillStyle = '#9a4a28'
  ctx.fillRect(0, 0, w, h)
  const tones = ['#7f3a1d', '#b2603a', '#8c4326', '#c27646', '#74391f', '#a85830']
  for (let i = 0; i < (w * h) / 90; i++) {
    const x = rand() * w
    const y = rand() * h
    const r = 2 + rand() * (w / 9)
    ctx.fillStyle = tones[Math.floor(rand() * tones.length)]!
    ctx.globalAlpha = 0.18 + rand() * 0.25
    // drawn again a tile away so the texture joins up along the road
    for (const dy of [-h, 0, h]) {
      ctx.beginPath()
      ctx.ellipse(x, y + dy, r, r * (0.5 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  // a few tufts of dry grass
  ctx.globalAlpha = 0.55
  for (let i = 0; i < w / 5; i++) {
    ctx.fillStyle = rand() < 0.5 ? '#6f7a3e' : '#8a8a4a'
    const x = w * 0.35 + rand() * w * 0.6
    const y = rand() * h
    for (const dy of [-h, 0, h]) ctx.fillRect(x, y + dy, 2, 3)
  }
  ctx.globalAlpha = 1
  // opaque by the road, fading to nothing out in the field
  ctx.globalCompositeOperation = 'destination-in'
  const fade = ctx.createLinearGradient(0, 0, w, 0)
  fade.addColorStop(0, 'rgba(0,0,0,1)')
  fade.addColorStop(0.45, 'rgba(0,0,0,0.92)')
  fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, w, h)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(1, 700 / 20)
  texture.anisotropy = 2
  return texture
}

/** A strip of red earth on each side of the road that slides past with the scenery. */
export function Verges({ offset, from, width, tier, receive }: { offset: Offset; from: number; width: number; tier: GfxTier; receive: boolean }) {
  const group = useRef<Group>(null)
  const texture = useMemo(() => (tier === 'low' ? lateriteTexture(64, 128) : lateriteTexture(128, 256)), [tier])
  useEffect(() => () => texture.dispose(), [texture])
  useFrame(() => {
    if (group.current) group.current.position.z = offset.current % 20
  })
  return (
    <group ref={group}>
      {[1, -1].map((side) => (
        // the texture's solid edge is on its left (u = 0), so the left-hand strip is turned round
        <mesh key={side} position={[side * (from + width / 2), -0.015, -120]} rotation={[-Math.PI / 2, 0, side === 1 ? 0 : Math.PI]} receiveShadow={receive}>
          <planeGeometry args={[width, 700]} />
          <meshLambertMaterial map={texture} transparent depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

/* —— worn tarmac —— */

function wearTexture(w: number, h: number) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const rand = mulberry32(8812)
  ctx.clearRect(0, 0, w, h)
  const X = (u: number) => u * w
  const Y = (v: number) => v * h
  // darker rubber tracks down the middle of each lane (our lane at x 4.9, other 8.7, across 2.8 to 10.6)
  for (const lane of [4.9, 8.7]) {
    for (const off of [-0.8, 0.8]) {
      const g = ctx.createLinearGradient(X((lane + off - 0.55 - 2.8) / 7.8), 0, X((lane + off + 0.55 - 2.8) / 7.8), 0)
      g.addColorStop(0, 'rgba(20,16,10,0)')
      g.addColorStop(0.5, 'rgba(20,16,10,0.16)')
      g.addColorStop(1, 'rgba(20,16,10,0)')
      ctx.fillStyle = g
      ctx.fillRect(X((lane + off - 0.55 - 2.8) / 7.8), 0, X(1.1 / 7.8), h)
    }
  }
  // patched strips of newer, darker tarmac
  for (let i = 0; i < 9; i++) {
    const x = X(rand() * 0.8)
    const y = Y(rand())
    ctx.fillStyle = `rgba(30,26,22,${0.18 + rand() * 0.14})`
    ctx.fillRect(x, y, X(0.1 + rand() * 0.18), Y(0.012 + rand() * 0.03))
  }
  // dusty pale patches
  for (let i = 0; i < 12; i++) {
    ctx.fillStyle = `rgba(200,160,110,${0.1 + rand() * 0.1})`
    ctx.beginPath()
    ctx.ellipse(X(rand()), Y(rand()), X(0.03 + rand() * 0.07), Y(0.004 + rand() * 0.012), 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // cracks
  ctx.strokeStyle = 'rgba(25,20,16,0.35)'
  ctx.lineWidth = Math.max(1, w / 256)
  for (let i = 0; i < 14; i++) {
    let x = X(rand())
    let y = Y(rand())
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let k = 0; k < 6; k++) {
      x += (rand() - 0.5) * X(0.05)
      y += rand() * Y(0.008)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // a few shallow potholes: dark hollow, pale broken rim
  for (let i = 0; i < 5; i++) {
    const x = X(0.08 + rand() * 0.84)
    const y = Y(rand())
    const rx = X(0.012 + rand() * 0.016)
    const ry = Y(0.0035 + rand() * 0.004)
    ctx.fillStyle = 'rgba(190,170,140,0.35)'
    ctx.beginPath()
    ctx.ellipse(x, y, rx * 1.3, ry * 1.4, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(28,22,16,0.7)'
    ctx.beginPath()
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 2
  return texture
}

/** Wear laid over the road surface (one 60 m tile, shared by every tile). Our carriageway only: the far one is mostly hidden. */
export function useRoadWear(tier: GfxTier) {
  const texture = useMemo(() => (tier === 'low' ? wearTexture(128, 512) : wearTexture(256, 1024)), [tier])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

/* —— pops in as it loads —— */

/** Grows up from the road over half a second, so a model that arrives late rises into place rather than blinking on. */
export function PopIn({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  const age = useRef(0)
  useLayoutEffect(() => {
    group.current?.scale.set(1, 0.01, 1)
  }, [])
  useFrame((_, delta) => {
    const g = group.current
    if (!g || age.current >= 1) return
    age.current = Math.min(1, age.current + delta / 0.5)
    g.scale.y = Math.max(0.01, smooth(age.current))
  })
  return <group ref={group}>{children}</group>
}
