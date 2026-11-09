'use client'

import { Html } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, SRGBColorSpace, type Group } from 'three'
import type { Appearance } from '@/lib/game/look'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { HUB_DESKS, HUB_SEATS, SEATED_Y, type HubDeskId } from '@/lib/game/hub-desks'

/** The wall TV's slides: a colour, a headline and two lines under it. */
const SLIDES = [
  { top: '#1d4ed8', bottom: '#0b1d5e', title: 'PITCH DAY', lines: ['in Ekpoma Life', 'Today at the Innovation Hub'] },
  { top: '#7e22ce', bottom: '#2e0a55', title: 'Pitch your deck', lines: ['to the investors in the Pitch Room', 'Sammy has your slot'] },
  { top: '#0f766e', bottom: '#052e2b', title: 'Got an idea?', lines: ['Suggest it at the Ideas desk', 'or message the Developer Team'] },
  { top: '#c2410c', bottom: '#4a1605', title: '5 pitches a day', lines: ['Make each one count', 'Good luck!'] },
]
const SLIDE_S = 5
const FADE_OUT = 0.5
const FADE_IN = 0.7

function drawSlide(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const index = Math.floor(t / SLIDE_S) % SLIDES.length
  const local = t % SLIDE_S
  const slide = SLIDES[index]!
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, slide.top)
  g.addColorStop(1, slide.bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // faint sweep, like a studio backdrop
  const sweep = ctx.createRadialGradient(w * 0.8, h * 0.1, 10, w * 0.8, h * 0.1, w * 0.7)
  sweep.addColorStop(0, 'rgba(255,255,255,0.22)')
  sweep.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sweep
  ctx.fillRect(0, 0, w, h)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${Math.round(h * 0.2)}px system-ui, sans-serif`
  ctx.fillText(slide.title, w / 2, h * 0.43)
  ctx.font = `600 ${Math.round(h * 0.095)}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.fillText(slide.lines[0]!, w / 2, h * 0.62)
  ctx.font = `500 ${Math.round(h * 0.075)}px system-ui, sans-serif`
  ctx.fillStyle = 'rgba(255,255,255,0.75)'
  ctx.fillText(slide.lines[1]!, w / 2, h * 0.78)
  // little "live" tag, blinking
  ctx.textAlign = 'left'
  if (Math.floor(t * 1.6) % 2 === 0) {
    ctx.fillStyle = '#ef4444'
    ctx.beginPath()
    ctx.arc(w * 0.06, h * 0.09, h * 0.028, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(h * 0.055)}px system-ui, sans-serif`
  ctx.fillText('LIVE', w * 0.09, h * 0.108)
  // scanlines
  ctx.fillStyle = 'rgba(0,0,0,0.12)'
  for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1.5)
  // fade through black with a burst of static between slides
  const out = local > SLIDE_S - FADE_OUT ? (local - (SLIDE_S - FADE_OUT)) / FADE_OUT : 0
  const into = local < FADE_IN ? 1 - local / FADE_IN : 0
  const dark = Math.max(out, into)
  if (dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dark})`
    ctx.fillRect(0, 0, w, h)
    const bursts = Math.floor(70 * Math.min(out, 1 - into * 0.6))
    for (let i = 0; i < bursts; i++) {
      const v = 90 + Math.floor(Math.random() * 150)
      ctx.fillStyle = `rgba(${v},${v},${v},${0.35 * dark})`
      ctx.fillRect(Math.random() * w, Math.random() * h, 20 + Math.random() * 90, 1 + Math.random() * 3)
    }
  }
}

/** The big screen on the hub's slat wall: slides that fade through black like a TV, each in its own colour. */
function HubScreen() {
  const { canvas, texture } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 283
    const texture = new CanvasTexture(canvas)
    texture.colorSpace = SRGBColorSpace
    return { canvas, texture }
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  const clock = useRef({ t: 0, since: 1 })
  useFrame((_, delta) => {
    const c = clock.current
    c.t += Math.min(delta, 0.1)
    c.since += delta
    if (c.since < 1 / 12) return
    c.since = 0
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawSlide(ctx, canvas.width, canvas.height, c.t)
    texture.needsUpdate = true
  })
  return (
    <mesh position={[-2.0, 1.85, -4.335]}>
      <planeGeometry args={[2.68, 1.48]} />
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  )
}

/** dreality walks the floor, stopping a while at each desk (x, z; he faces +z, toward the desk in front of him). */
const ROUND: [number, number][] = [
  [-4.15, 1.12], [-1.95, 1.12], [0.25, 1.12], [1.4, 1.12],
  [1.4, -1.3], [0.25, -1.3], [-1.95, -1.3], [-4.15, -1.3], [-5.3, -1.3],
  [-5.3, 1.12],
]
const STOP_S = 3.2
const WALK_SPEED = 0.95
const DREALITY: Appearance = {
  body: 'man',
  hair: 'classic',
  outfit: 'office',
  skin: '#6B3F28',
  hairColor: '#1b1410',
  topColor: '#0f766e',
  bottomColor: '#1f2937',
}

/** An extra NPC, "dreality", going round the desks one after another. */
function Dreality() {
  const group = useRef<Group>(null)
  const moving = useRef(false)
  const idle = useRef<FigurePose | null>(null)
  const state = useRef({ x: ROUND[0]![0], z: ROUND[0]![1], next: 1, wait: STOP_S, heading: 0 })
  useFrame((_, delta) => {
    const g = group.current
    if (!g) return
    const dt = Math.min(delta, 0.1)
    const st = state.current
    const goal = ROUND[st.next]!
    if (st.wait > 0) {
      st.wait -= dt
      moving.current = false
      // Face the desk while standing there
      st.heading += (((0 - st.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6)
    } else {
      const dx = goal[0] - st.x
      const dz = goal[1] - st.z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.06) {
        st.next = (st.next + 1) % ROUND.length
        // Only the desk stops are long; corners pass straight on
        const here = ROUND[(st.next + ROUND.length - 1) % ROUND.length]!
        st.wait = here[0] === 1.4 || here[0] === -5.3 ? 0 : STOP_S
      } else {
        const step = Math.min(dist, WALK_SPEED * dt)
        st.x += (dx / dist) * step
        st.z += (dz / dist) * step
        moving.current = true
        const want = Math.atan2(dx, dz)
        st.heading += (((want - st.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 8)
      }
    }
    g.position.set(st.x, 0, st.z)
    g.rotation.y = st.heading
  })
  const look = useMemo(() => DREALITY, [])
  return (
    <group ref={group} position={[ROUND[0]![0], 0, ROUND[0]![1]]}>
      <CharacterFigure appearance={look} pose={idle} moving={moving} />
      <Html position={[0, 1.95, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
        <span
          style={{
            display: 'inline-block',
            padding: '2px 8px',
            borderRadius: 999,
            background: 'rgba(17,12,40,0.78)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 700,
            whiteSpace: 'nowrap',
          }}
        >
          dreality
        </span>
      </Html>
    </group>
  )
}

/**
 * The Innovation Hub NPCs, seated on their desks' chairs with name tags. Tapping an NPC or their
 * desk opens their task (you walk over first).
 */
export function HubNpcs({ onTap, onSeat }: { onTap?: (id: HubDeskId) => void; onSeat?: (seatId: string) => void }) {
  // Seated NPCs type at their laptops
  const sit = useRef<FigurePose | null>('type')
  const still = useRef(false)
  const tap = (id: HubDeskId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onTap?.(id)
  }
  return (
    <>
      <Dreality />
      <HubScreen />
      {HUB_DESKS.map((desk) => (
        <group key={desk.id}>
          <group position={[desk.npc.x, SEATED_Y, desk.npc.z]} rotation={[0, desk.npc.heading, 0]}>
            <CharacterFigure appearance={desk.npc.appearance} pose={sit} moving={still} />
            {/* See-through capsule over the body takes the tap */}
            <mesh position={[0, 0.95, 0]} onClick={tap(desk.id)}>
              <capsuleGeometry args={[0.32, 1.0, 4, 8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            <Html position={[0, 1.95, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(17,12,40,0.78)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                }}
              >
                {desk.emoji} {desk.npc.name}
              </span>
            </Html>
          </group>
          {/* The desk itself is tappable too */}
          <mesh position={[desk.desk.x, 0.4, desk.desk.z]} onClick={tap(desk.id)}>
            <boxGeometry args={[1.55, 0.85, 0.8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* Free chairs and bar stools: tap one to sit on it */}
      {onSeat
        ? HUB_SEATS.map((s) => (
            <mesh
              key={s.id}
              position={[s.x, 0.5, s.z]}
              onClick={(e) => {
                e.stopPropagation()
                onSeat(s.id)
              }}
            >
              <boxGeometry args={[0.55, 1.0, 0.55]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
          ))
        : null}
    </>
  )
}
