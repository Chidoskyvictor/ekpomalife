'use client'

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, Color, ShaderMaterial, SRGBColorSpace, type MeshBasicMaterial } from 'three'
import type { PromotedSong } from '@/lib/game/venues-api'

/*
 * The big LED video wall behind the DJ booth. A cheap fragment shader (one plane, no textures)
 * paints a flickering LED-pixel grid in the club's colours and pulses on the beat; a second
 * plane in front carries "Now promoting: title, artist" (canvas texture). Low-perf phones get a
 * flat colour-cycling material instead of the shader. Positions are the GLB's own (game coords).
 */

const PALETTES: Record<string, [string, string, string]> = {
  sazza: ['#ff3fb4', '#29e7ff', '#a65bff'],
  forbes: ['#f5c542', '#10b981', '#fff3c4'],
}
const BPM = 112

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`

const FRAG = /* glsl */ `
precision mediump float;
varying vec2 vUv;
uniform float uTime;
uniform float uBeat;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  // LED grid: 64 x 22 pixels, each lit by its own colour field
  vec2 grid = vec2(64.0, 22.0);
  vec2 cell = floor(vUv * grid);
  vec2 local = fract(vUv * grid) - 0.5;
  float dotMask = smoothstep(0.52, 0.28, length(local));
  vec2 p = (cell / grid) * 2.0 - 1.0;
  float t = uTime;
  float w = sin(p.x * 5.0 + t * 1.7) + sin(p.y * 7.0 - t * 2.3) + sin((p.x + p.y) * 4.0 + t * 1.1)
          + sin(length(p * vec2(1.6, 1.0)) * 9.0 - t * 3.0);
  float f = w * 0.25 + 0.5;
  vec3 col = mix(uA, uB, smoothstep(0.2, 0.8, f));
  col = mix(col, uC, smoothstep(0.65, 1.0, sin(f * 6.2831 + t) * 0.5 + 0.5) * 0.7);
  // Bars that jump on the beat
  float bar = step(p.y * 0.5 + 0.5, 0.25 + 0.7 * hash(vec2(cell.x, floor(t * 7.0))) * uBeat);
  col += uC * bar * 0.35;
  // Flicker, like a real LED wall
  float flick = 0.82 + 0.18 * hash(cell + floor(t * 14.0));
  float glow = (0.55 + 0.9 * uBeat) * flick;
  vec3 outc = col * glow * dotMask + col * 0.04;
  gl_FragColor = vec4(outc, 1.0);
}`

function drawCaption(canvas: HTMLCanvasElement, song: PromotedSong | null, club: string, cover: HTMLImageElement | null) {
  const ctx = canvas.getContext('2d')!
  const { width: w, height: h } = canvas
  ctx.clearRect(0, 0, w, h)
  ctx.textBaseline = 'middle'
  if (!song) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'
    ctx.fillRect(0, h - 120, w, 120)
    ctx.fillStyle = '#fff'
    ctx.font = '800 54px system-ui, sans-serif'
    ctx.fillText(club.toUpperCase(), 40, h - 60)
    return
  }
  ctx.fillStyle = 'rgba(8,4,20,0.62)'
  ctx.fillRect(0, h - 190, w, 190)
  let x = 40
  if (cover) {
    try {
      ctx.drawImage(cover, 40, h - 170, 150, 150)
      x = 220
    } catch {
      /* a cover that can't be drawn is just skipped */
    }
  }
  ctx.fillStyle = '#ffd23a'
  ctx.font = '800 36px system-ui, sans-serif'
  ctx.fillText('♪ NOW PROMOTING', x, h - 150)
  const fit = (text: string, max: number) => {
    let t = text
    while (ctx.measureText(t).width > max && t.length > 3) t = t.slice(0, -2)
    return t === text ? t : `${t}…`
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = '900 64px system-ui, sans-serif'
  ctx.fillText(fit(song.title, w - x - 40), x, h - 92)
  ctx.fillStyle = '#ff9cf0'
  ctx.font = '700 44px system-ui, sans-serif'
  ctx.fillText(fit(`— ${song.artist}`, w - x - 40), x, h - 36)
}

export function ClubLedWall({
  venueId,
  clubName,
  song,
  lowPerf,
}: {
  venueId: string
  clubName: string
  song: PromotedSong | null
  lowPerf: boolean
}) {
  const palette = PALETTES[venueId] ?? PALETTES.sazza!
  const shader = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        toneMapped: false,
        uniforms: {
          uTime: { value: 0 },
          uBeat: { value: 0 },
          uA: { value: new Color(palette[0]) },
          uB: { value: new Color(palette[1]) },
          uC: { value: new Color(palette[2]) },
        },
      }),
    [palette],
  )
  const flat = useRef<MeshBasicMaterial>(null)
  const caption = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 360
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return { canvas, texture }
  }, [])

  // Redraw the caption when the song changes (the cover loads later and redraws once)
  useEffect(() => {
    if (!caption) return
    const paint = (cover: HTMLImageElement | null) => {
      drawCaption(caption.canvas, song, clubName, cover)
      caption.texture.needsUpdate = true
    }
    paint(null)
    if (!song?.coverUrl) return
    let live = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.referrerPolicy = 'no-referrer'
    img.onload = () => live && paint(img)
    img.src = song.coverUrl
    return () => {
      live = false
    }
  }, [caption, song, clubName])
  useEffect(() => () => caption?.texture.dispose(), [caption])
  useEffect(() => () => shader.dispose(), [shader])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const beatPos = (t * BPM) / 60
    const beat = 1 - (beatPos - Math.floor(beatPos))
    if (lowPerf) {
      if (flat.current) flat.current.color.setHSL((t * 0.08) % 1, 0.8, 0.28 + beat * 0.12)
      return
    }
    shader.uniforms.uTime!.value = t
    shader.uniforms.uBeat!.value = beat * beat
  })

  // Back wall of the club, above the DJ stage (stage spans z -7.95..-5.6)
  return (
    <group position={[0, 3.0, -7.62]}>
      <mesh>
        <planeGeometry args={[6.4, 2.1]} />
        {lowPerf ? <meshBasicMaterial ref={flat} toneMapped={false} /> : <primitive object={shader} attach="material" />}
      </mesh>
      {caption ? (
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[6.4, 2.1]} />
          <meshBasicMaterial map={caption.texture} transparent toneMapped={false} depthWrite={false} />
        </mesh>
      ) : null}
    </group>
  )
}
