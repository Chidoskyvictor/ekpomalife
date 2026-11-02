'use client'

import { Html, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber'
import { Suspense, use, useMemo, useRef, useState } from 'react'
import { Box3, CanvasTexture, SRGBColorSpace, type Group } from 'three'
import { CharacterFigure, type FigurePose } from '@/components/look/character-figure'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import { meshoptDecoder } from '@/lib/game/meshopt'

/*
 * Wise Gourmet, the same scene as the launch video: the kiosk (public/models/wise.glb) with its
 * name on top, a seller at each window, customers ordering, VIP high tables with people eating,
 * and the real players in your group of 5 standing around. Tap the window or a seller to order,
 * tap anyone to talk. Drag to look around; it turns slowly on its own.
 */

const WISE_GLB = '/models/wise.glb'
const STOOL_SEAT = 0.78
const CHROME = { color: '#C9CED6', metalness: 0.8, roughness: 0.25 }

export type WiseNpc = { id: string; name: string; role: 'seller' | 'customer' | 'diner'; look: Partial<Appearance>; line: string }
export type WisePlayer = { userId: string; username: string; appearance: unknown; me?: boolean }

/** Sellers, one per window section (x across the counter). */
export const SELLERS: (WiseNpc & { x: number })[] = [
  { id: 'seller-1', name: 'Aunty Joy', role: 'seller', x: -1.55, line: 'Welcome to Wise! Shawarma is hot now 🔥', look: { body: 'woman', hair: 'bun', skin: '#5A3420', topColor: '#FFFFFF', bottomColor: '#B91C1C' } },
  { id: 'seller-2', name: 'Emeka', role: 'seller', x: 0, line: 'Chicken and chips? E dey ready in 2 minutes.', look: { body: 'man', hair: 'lowcut', skin: '#7A4A2A', topColor: '#F97316', bottomColor: '#1F2937' } },
  { id: 'seller-3', name: 'Blessing', role: 'seller', x: 1.55, line: 'Try our chapman, e cold well well 🍹', look: { body: 'woman', hair: 'braids', skin: '#9B5B33', topColor: '#14B8A6', bottomColor: '#111827' } },
]

const CUSTOMERS: (WiseNpc & { at: [number, number]; heading: number; bubble: string })[] = [
  { id: 'cust-1', name: 'Tunde', role: 'customer', at: [-1.55, 2.2], heading: Math.PI, bubble: '1 shawarma abeg 🌯', line: 'Their shawarma na the best for Ekpoma.', look: { body: 'man', hair: 'lowcut', skin: '#5C3317', topColor: '#2F6BF0', bottomColor: '#111827' } },
  { id: 'cust-2', name: 'Ada', role: 'customer', at: [1.55, 2.2], heading: Math.PI, bubble: 'Chicken and chips 🍗', line: 'I just finished lectures, I dey hungry die 😩', look: { body: 'woman', hair: 'bun', skin: '#3E2414', topColor: '#8B5CF6', bottomColor: '#111827' } },
]

const DINERS: { at: [number, number]; turn: number; npcs: [WiseNpc, WiseNpc] }[] = [
  {
    at: [-1.7, 4.9],
    turn: Math.PI / 2,
    npcs: [
      { id: 'diner-1', name: 'Chioma', role: 'diner', line: 'Come join us! This jollof is too sweet 😋', look: { body: 'woman', hair: 'braids', skin: '#8D4E2A', topColor: '#E02060', bottomColor: '#1F2937' } },
      { id: 'diner-2', name: 'Kelvin', role: 'diner', line: 'Na here I dey chop every Friday.', look: { body: 'man', hair: 'lowcut', skin: '#A56C3A', topColor: '#FFC531', bottomColor: '#1F2937' } },
    ],
  },
  {
    at: [1.8, 5.3],
    turn: Math.PI / 2 + 0.3,
    npcs: [
      { id: 'diner-3', name: 'Zainab', role: 'diner', line: 'You be fresher? Welcome to AAU 🎓', look: { body: 'woman', hair: 'afro', skin: '#6B3F28', topColor: '#3DCB5A', bottomColor: '#374151' } },
      { id: 'diner-4', name: 'Osas', role: 'diner', line: 'Abeg who get charger? 😅', look: { body: 'man', hair: 'lowcut', skin: '#5C3317', topColor: '#0EA5E9', bottomColor: '#111827' } },
    ],
  },
]

/** Where real players stand: you first, then up to 4 others (group of 5). */
const PLAYER_SPOTS: { at: [number, number]; heading: number }[] = [
  { at: [-0.2, 3.9], heading: Math.PI },
  { at: [-3.5, 3.4], heading: Math.PI * 0.8 },
  { at: [3.6, 3.6], heading: -Math.PI * 0.8 },
  { at: [-0.4, 7.2], heading: Math.PI },
  { at: [3.8, 6.9], heading: -Math.PI * 0.75 },
]

/** The seller window nearest to x. */
export const nearestWindow = (x: number) =>
  SELLERS.reduce((best, s) => (Math.abs(s.x - x) < Math.abs(best.x - x) ? s : best), SELLERS[0]!)

/** Where you stand to order at a window: at the counter, or behind the customer already there. */
export function orderSpot(windowX: number): [number, number] {
  const taken = CUSTOMERS.some((c) => Math.abs(c.at[0] - windowX) < 0.4)
  return [windowX, taken ? 2.95 : 2.2]
}

const tap = (fn: () => void) => (e: ThreeEvent<MouseEvent>) => {
  e.stopPropagation()
  fn()
}

const pointer = {
  onPointerOver: (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    document.body.style.cursor = 'pointer'
  },
  onPointerOut: () => {
    document.body.style.cursor = ''
  },
}

/** "WISE GOURMET" painted on a board, drawn on a canvas (no font downloads). */
function useSignTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 192
    const g = c.getContext('2d')!
    g.fillStyle = '#B91C1C'
    g.fillRect(0, 0, c.width, c.height)
    g.strokeStyle = '#FFC531'
    g.lineWidth = 12
    g.strokeRect(10, 10, c.width - 20, c.height - 20)
    g.fillStyle = '#FFFFFF'
    g.font = '800 104px "Fredoka", "Plus Jakarta Sans", system-ui, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('WISE GOURMET', c.width / 2, c.height / 2 + 6)
    const t = new CanvasTexture(c)
    t.colorSpace = SRGBColorSpace
    t.anisotropy = 4
    return t
  }, [])
}

/** The kiosk plus its sign; tells the scene how big the kiosk is so the sellers stand inside it. */
function Kiosk({ onWindow }: { onWindow: (x: number) => void }) {
  const decoder = use(meshoptDecoder)
  const { scene } = useGLTF(WISE_GLB, true, false, (loader) => {
    loader.setMeshoptDecoder(decoder)
  })
  const copy = useMemo(() => scene.clone(true), [scene])
  const box = useMemo(() => new Box3().setFromObject(copy), [copy])
  const sign = useSignTexture()
  const width = Math.min(5.2, (box.max.x - box.min.x) * 0.8)
  const front = box.max.z
  return (
    <group>
      <primitive object={copy} />
      {/* name board on the roof edge, facing the forecourt */}
      <group position={[(box.min.x + box.max.x) / 2, box.max.y + 0.32, front - 0.25]}>
        <mesh position={[0, 0, -0.04]}>
          <boxGeometry args={[width + 0.12, width / 5.33 + 0.12, 0.06]} />
          <meshStandardMaterial color="#1A1A1A" />
        </mesh>
        <mesh>
          <planeGeometry args={[width, width / 5.33]} />
          <meshBasicMaterial map={sign as never} toneMapped={false} />
        </mesh>
      </group>
      {/* the whole window is one big tap target: tap it to order */}
      <mesh position={[0, (0.8 + box.max.y - 0.25) / 2, front + 0.05]} onClick={(e) => {
          e.stopPropagation()
          onWindow(e.point.x)
        }}
        {...pointer}
      >
        <planeGeometry args={[box.max.x - box.min.x - 0.4, box.max.y - 1.05]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}

function Bubble({ text, y = 2.15, tone = 'light' }: { text: string; y?: number; tone?: 'light' | 'me' }) {
  return (
    <Html position={[0, y, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          padding: '6px 12px',
          borderRadius: 14,
          background: tone === 'me' ? '#2F6BF0' : '#FFFFFF',
          color: tone === 'me' ? '#FFFFFF' : '#111827',
          font: '700 14px/1.2 system-ui, sans-serif',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(0,0,0,.18)',
        }}
      >
        {text}
      </div>
    </Html>
  )
}

function NameTag({ text, me }: { text: string; me?: boolean }) {
  return (
    <Html position={[0, 1.95, 0]} center distanceFactor={9} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
      <div style={{ padding: '2px 8px', borderRadius: 10, background: me ? '#2F6BF0' : 'rgba(17,24,39,.75)', color: '#fff', font: '700 12px system-ui, sans-serif', whiteSpace: 'nowrap' }}>
        {text}
      </div>
    </Html>
  )
}

/**
 * Someone in the scene. A see-through capsule over the body takes the tap. `sway` makes a
 * standing figure turn a little side to side (sellers serving, customers ordering).
 */
function Figure({
  look,
  pose,
  position,
  heading = 0,
  sway = 0,
  onTap,
  children,
}: {
  look: Partial<Appearance> | Appearance
  pose: FigurePose
  position: [number, number, number]
  heading?: number
  sway?: number
  onTap?: () => void
  children?: React.ReactNode
}) {
  const poseRef = useRef<FigurePose | null>(pose)
  poseRef.current = pose
  const appearance = useMemo(() => normalizeAppearance(look as Partial<Appearance>), [look])
  const body = useRef<Group>(null)
  const phase = useMemo(() => Math.random() * 10, [])
  useFrame(({ clock }) => {
    if (!sway || !body.current) return
    body.current.rotation.y = Math.sin(clock.elapsedTime * 0.9 + phase) * sway
  })
  return (
    <group position={position} rotation={[0, heading, 0]}>
      <group ref={body}>
        <CharacterFigure appearance={appearance} pose={poseRef} />
      </group>
      {onTap ? (
        <mesh position={[0, pose === 'sit' ? 1.2 : 0.95, 0]} onClick={tap(onTap)} {...pointer}>
          <capsuleGeometry args={[0.32, pose === 'sit' ? 0.7 : 1.2, 4, 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      ) : null}
      {children}
    </group>
  )
}

/**
 * You: walks from your spot to `target` (walk cycle while moving), then faces the window.
 * Calls onArrive once when you get there.
 */
function Walker({
  look,
  start,
  startHeading,
  target,
  onArrive,
  children,
}: {
  look: Partial<Appearance>
  start: [number, number]
  startHeading: number
  target: [number, number] | null
  onArrive?: () => void
  children?: React.ReactNode
}) {
  const appearance = useMemo(() => normalizeAppearance(look), [look])
  const root = useRef<Group>(null)
  const moving = useRef(false)
  const pose = useRef<FigurePose | null>(null)
  const arrivedFor = useRef<string | null>(null)
  useFrame((_, dt) => {
    const g = root.current
    if (!g) return
    const [tx, tz] = target ?? start
    const dx = tx - g.position.x
    const dz = tz - g.position.z
    const dist = Math.hypot(dx, dz)
    const step = Math.min(dist, 1.8 * Math.min(dt, 0.05))
    if (dist > 0.03) {
      g.position.x += (dx / dist) * step
      g.position.z += (dz / dist) * step
      g.rotation.y = Math.atan2(dx, dz)
      moving.current = true
      arrivedFor.current = null
    } else {
      moving.current = false
      // Face the window once you're there (or your usual way back at your spot)
      g.rotation.y = target ? Math.PI : startHeading
      const key = target ? `${tx},${tz}` : null
      if (key && arrivedFor.current !== key) {
        arrivedFor.current = key
        onArrive?.()
      }
    }
  })
  return (
    <group ref={root} position={[start[0], 0, start[1]]} rotation={[0, startHeading, 0]}>
      <CharacterFigure appearance={appearance} moving={moving} pose={pose} />
      {children}
    </group>
  )
}

function Plate({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.2, 0.17, 0.03, 20]} />
        <meshStandardMaterial color="#FFFFFF" />
      </mesh>
      <mesh position={[-0.04, 0.04, 0]}>
        <sphereGeometry args={[0.11, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#E2572A" roughness={0.9} />
      </mesh>
      <mesh position={[0.09, 0.06, 0.03]} rotation={[0, 0, 0.6]}>
        <capsuleGeometry args={[0.045, 0.09, 4, 8]} />
        <meshStandardMaterial color="#B5651D" />
      </mesh>
    </group>
  )
}

/** VIP standalone bar stool: chrome pole, round padded seat, foot ring. */
function Stool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, STOOL_SEAT, 0]}>
        <cylinderGeometry args={[0.22, 0.2, 0.09, 24]} />
        <meshStandardMaterial color="#1A1A1A" roughness={0.45} />
      </mesh>
      <mesh position={[0, STOOL_SEAT / 2, 0]}>
        <cylinderGeometry args={[0.035, 0.035, STOOL_SEAT, 10]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <mesh position={[0, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.17, 0.015, 8, 24]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.2, 0.22, 0.04, 24]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
    </group>
  )
}

/** High round table with a plate and a drink. */
function HighTable({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1.08, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.05, 28]} />
        <meshStandardMaterial color="#F5EFE6" roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.54, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.08, 10]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <mesh position={[0, 0.02, 0]}>
        <cylinderGeometry args={[0.28, 0.3, 0.04, 24]} />
        <meshStandardMaterial {...CHROME} />
      </mesh>
      <Plate position={[-0.15, 1.12, 0.05]} />
      <mesh position={[0.2, 1.22, -0.12]}>
        <cylinderGeometry args={[0.045, 0.04, 0.2, 12]} />
        <meshStandardMaterial color="#C0392B" />
      </mesh>
    </group>
  )
}

/** Paved forecourt (interlocking slabs), like the campus paving. */
function Forecourt() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 3]}>
        <planeGeometry args={[40, 30]} />
        <meshStandardMaterial color="#C9B8A0" roughness={0.95} />
      </mesh>
      {Array.from({ length: 12 }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-11 + i * 2, 0, 3]}>
          <planeGeometry args={[0.04, 30]} />
          <meshBasicMaterial color="#B3A189" />
        </mesh>
      ))}
    </group>
  )
}

/** Sellers stand just inside the window, facing out. */
function Sellers({ onSeller }: { onSeller: (npc: WiseNpc) => void }) {
  const decoder = use(meshoptDecoder)
  const { scene } = useGLTF(WISE_GLB, true, false, (loader) => {
    loader.setMeshoptDecoder(decoder)
  })
  const front = useMemo(() => new Box3().setFromObject(scene).max.z, [scene])
  return (
    <>
      {/* kitchen light so the sellers show through the glass */}
      <pointLight position={[0, 2.2, front - 0.15]} color="#FFE2B0" intensity={10} distance={4} />
      {SELLERS.map((s) => (
        <Figure key={s.id} look={s.look} pose="idle" position={[s.x, 0.3, front - 0.5]} sway={0.35} onTap={() => onSeller(s)} />
      ))}
    </>
  )
}

export function WiseScene({
  players,
  bubbles,
  onWindow,
  onNpc,
  onPlayer,
  meTarget = null,
  onArrive,
}: {
  /** You first, then the others in your group. */
  players: WisePlayer[]
  /** Short-lived speech bubbles, by NPC id or player userId. */
  bubbles: Record<string, string>
  onWindow: (x: number) => void
  onNpc: (npc: WiseNpc) => void
  onPlayer: (player: WisePlayer) => void
  /** Where you're walking to (a window), or null to stay at your spot. */
  meTarget?: [number, number] | null
  onArrive?: () => void
}) {
  // Customers' "ordering" bubbles come and go so it looks like they're talking to the seller
  const [orderTick, setOrderTick] = useState(0)
  return (
    <Canvas
      dpr={[1, 1.85]}
      camera={{ position: [3.2, 3.6, 12.5], fov: 48, near: 0.1, far: 80 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ width: '100%', height: '100%', touchAction: 'none' }}
    >
      <OrderClock onTick={() => setOrderTick((n) => n + 1)} />
      <color attach="background" args={['#F4C99A']} />
      <fog attach="fog" args={['#F4C99A', 20, 48]} />
      <ambientLight intensity={0.75} color="#FFE9CC" />
      <hemisphereLight args={['#FFE2B8', '#8A6A4A', 0.6]} />
      <directionalLight position={[-6, 9, 8]} intensity={1.1} color="#FFD7A0" />
      <Forecourt />
      <Suspense fallback={null}>
        <Kiosk onWindow={onWindow} />
        {/* warm glow from the kitchen through the window */}
        <pointLight position={[0, 1.7, 0.6]} color="#FFB45C" intensity={14} distance={6} />
        <pointLight position={[0, 1.6, 2.3]} color="#FFC77A" intensity={5} distance={5} />
        <Sellers onSeller={onNpc} />
        {/* customers at the window, ordering */}
        {CUSTOMERS.map((c, i) => (
          <Figure key={c.id} look={c.look} pose="idle" position={[c.at[0], 0, c.at[1]]} heading={c.heading} sway={0.12} onTap={() => onNpc(c)}>
            {bubbles[c.id] ? <Bubble text={bubbles[c.id]!} /> : (orderTick + i) % 3 !== 2 ? <Bubble text={c.bubble} /> : null}
          </Figure>
        ))}
        {/* VIP tables out front, two people eating at each */}
        {DINERS.map(({ at, turn, npcs }, t) => {
          const [x, z] = at
          const off = 0.62
          const sx = Math.sin(turn) * off
          const sz = Math.cos(turn) * off
          // A seated figure's hips sit 0.84 above its origin and 0.1 above the seat
          const y = STOOL_SEAT + 0.1 - 0.84
          return (
            <group key={t}>
              <HighTable position={[x, 0, z]} />
              <Stool position={[x + sx, 0, z + sz]} />
              <Stool position={[x - sx, 0, z - sz]} />
              <Figure look={npcs[0].look} pose="sit" position={[x + sx, y, z + sz]} heading={turn + Math.PI} onTap={() => onNpc(npcs[0])}>
                {bubbles[npcs[0].id] ? <Bubble text={bubbles[npcs[0].id]!} y={2.3} /> : null}
              </Figure>
              <Figure look={npcs[1].look} pose="sit" position={[x - sx, y, z - sz]} heading={turn} onTap={() => onNpc(npcs[1])}>
                {bubbles[npcs[1].id] ? <Bubble text={bubbles[npcs[1].id]!} y={2.3} /> : null}
              </Figure>
            </group>
          )
        })}
        {/* real players in your group */}
        {players.slice(0, PLAYER_SPOTS.length).map((p, i) => {
          const spot = PLAYER_SPOTS[i]!
          if (p.me) {
            return (
              <Walker key={p.userId} look={p.appearance as Partial<Appearance>} start={spot.at} startHeading={spot.heading} target={meTarget} onArrive={onArrive}>
                {bubbles.me ? <Bubble text={bubbles.me} tone="me" /> : <NameTag text="You" me />}
              </Walker>
            )
          }
          return (
            <Figure
              key={p.userId}
              look={p.appearance as Partial<Appearance>}
              pose="idle"
              position={[spot.at[0], 0, spot.at[1]]}
              heading={spot.heading}
              onTap={p.me ? undefined : () => onPlayer(p)}
            >
              {bubbles[p.userId] ? <Bubble text={bubbles[p.userId]!} tone={p.me ? 'me' : 'light'} /> : <NameTag text={p.me ? 'You' : p.username} me={p.me} />}
            </Figure>
          )
        })}
      </Suspense>
      <OrbitControls
        target={[0, 1.1, 3]}
        enablePan={false}
        minDistance={5}
        maxDistance={15}
        minPolarAngle={0.6}
        maxPolarAngle={1.45}
        minAzimuthAngle={-1.2}
        maxAzimuthAngle={1.2}
        autoRotate
        autoRotateSpeed={0.3}
        enableDamping
      />
    </Canvas>
  )
}

/** Ticks every ~2.5 s inside the render loop (stops with the canvas). */
function OrderClock({ onTick }: { onTick: () => void }) {
  const last = useRef(0)
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current > 2.5) {
      last.current = clock.elapsedTime
      onTick()
    }
  })
  return null
}
