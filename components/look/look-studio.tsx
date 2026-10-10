'use client'

import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { getAccount, getSession } from '@/lib/game/accounts'
import {
  BODIES,
  DEFAULT_APPEARANCE,
  FABRICS,
  HAIR_BY_BODY,
  OUTFIT_BY_BODY,
  normalizeAppearance,
  type Appearance,
  type BodyId,
} from '@/lib/game/look'
import { startNewLife } from '@/hooks/use-game'
import { cn } from '@/lib/utils'
import { CharacterFigure } from './character-figure'

function Pill({
  selected,
  children,
  onClick,
}: {
  selected: boolean
  children: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-10 rounded-full px-4 text-sm font-semibold transition-colors',
        selected ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-800 ring-1 ring-neutral-200 hover:bg-neutral-50',
      )}
    >
      {children}
    </button>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-[11px] font-bold tracking-[0.16em] text-neutral-400 uppercase">{title}</h2>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

export function LookStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/signup')
      return
    }
    const account = getAccount(session)
    setUsername(session)
    setDisplayName(account?.name ?? session)
  }, [router])

  const hair = HAIR_BY_BODY[appearance.body]
  const outfits = OUTFIT_BY_BODY[appearance.body]

  const setBody = (body: BodyId) => setAppearance((current) => normalizeAppearance({ body, fabric: current.fabric }))

  const finish = () => {
    if (!username) return
    const account = getAccount(username)
    startNewLife(account?.name ?? displayName, username, appearance)
    router.replace('/')
  }

  const preview = useMemo(() => appearance, [appearance])

  if (!username) return null

  return (
    <main className="flex h-dvh flex-col bg-[#F4F7FB] lg:flex-row">
      <div className="relative min-h-[58vh] flex-1 pt-14 lg:min-h-0">
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4">
          <Link
            href="/signup"
            className="flex size-10 items-center justify-center rounded-full bg-white text-neutral-800 shadow-sm ring-1 ring-black/5"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm font-semibold text-neutral-700">Look</p>
            <div className="flex gap-1.5">
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              <span className="h-1.5 w-6 rounded-full bg-neutral-200" />
            </div>
          </div>
          <span className="size-10" aria-hidden="true" />
        </header>

        <Canvas camera={{ position: [0, 0.95, 3.6], fov: 32 }} className="h-full">
          <color attach="background" args={['#F4F7FB']} />
          <ambientLight intensity={1.05} />
          <hemisphereLight args={['#FFF7EC', '#B8C4C0', 0.55]} />
          <directionalLight position={[2.2, 4.2, 2]} intensity={1.15} />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <circleGeometry args={[1.05, 48]} />
            <meshBasicMaterial color="#EEF1F5" />
          </mesh>
          <CharacterFigure appearance={preview} />
          <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={1.15} maxPolarAngle={1.4} target={[0, 0.82, 0]} />
        </Canvas>
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-neutral-400">Drag to spin</p>
      </div>

      <aside className="z-10 flex w-full flex-col gap-5 overflow-y-auto rounded-t-3xl bg-white px-5 py-6 shadow-[0_-8px_30px_rgb(15_40_80/0.08)] lg:h-full lg:max-w-md lg:rounded-none lg:px-8 lg:py-8 lg:shadow-none">
        <label className="block">
          <span className="sr-only">Display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="w-full border-b border-neutral-200 bg-transparent pb-2 text-sm text-neutral-800 outline-none"
            placeholder="@your Sim's name"
          />
          <span className="mt-1 block text-xs text-neutral-400">@{username}</span>
        </label>

        <Section title="Body">
          {BODIES.map((body) => (
            <Pill key={body.id} selected={appearance.body === body.id} onClick={() => setBody(body.id)}>
              {body.label}
            </Pill>
          ))}
        </Section>

        <Section title="Hairstyle">
          {hair.map((item) => (
            <Pill key={item.id} selected={appearance.hair === item.id} onClick={() => setAppearance((current) => ({ ...current, hair: item.id }))}>
              {item.label}
            </Pill>
          ))}
        </Section>

        <Section title="Outfit">
          {outfits.map((item) => (
            <Pill key={item.id} selected={appearance.outfit === item.id} onClick={() => setAppearance((current) => ({ ...current, outfit: item.id }))}>
              {item.label}
            </Pill>
          ))}
        </Section>

        <Section title="Fabric">
          <select
            value={appearance.fabric}
            onChange={(event) => setAppearance((current) => ({ ...current, fabric: event.target.value as Appearance['fabric'] }))}
            className="h-10 w-full rounded-full bg-neutral-50 px-4 text-sm font-semibold text-neutral-800 ring-1 ring-neutral-200"
          >
            {FABRICS.map((fabric) => (
              <option key={fabric.id} value={fabric.id}>
                {fabric.label}
              </option>
            ))}
          </select>
        </Section>

        <Button onClick={finish} className="mt-auto h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90">
          Continue
        </Button>
      </aside>
    </main>
  )
}
