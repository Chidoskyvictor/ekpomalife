'use client'

import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { CharacterFigure } from '@/components/look/character-figure'
import lookStyles from '@/components/look/look-studio.module.css'
import { Button } from '@/components/ui/button'
import { getSession, loadDraft, saveDraft } from '@/lib/game/accounts'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'
import { TRAIT_LIMIT, TRAITS, normalizeTraits, type TraitId } from '@/lib/game/traits'
import styles from './trait-studio.module.css'

export function TraitStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [picked, setPicked] = useState<TraitId[]>([])

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/signup')
      return
    }
    const draft = loadDraft(session)
    if (!draft?.appearance) {
      router.replace('/look')
      return
    }
    setUsername(session)
    setAppearance(normalizeAppearance(draft.appearance as Appearance))
    setPicked(normalizeTraits(draft.traits))
  }, [router])

  const remaining = TRAIT_LIMIT - picked.length
  const ready = remaining <= 0
  const preview = useMemo(() => appearance, [appearance])

  const toggle = (id: TraitId) => {
    setPicked((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : current.length >= TRAIT_LIMIT
          ? current
          : [...current, id]
      if (username) saveDraft(username, { appearance, traits: next })
      return next
    })
  }

  const finish = () => {
    if (!username || !ready) return
    saveDraft(username, { appearance, traits: picked })
    router.replace('/dream')
  }

  if (!username) return null

  const actionLabel = ready ? 'Continue' : remaining === 1 ? 'Choose 1 more' : `Choose ${remaining} more`

  return (
    <main className="app-wash flex h-dvh flex-col overflow-hidden lg:flex-row">
      <div className="relative min-h-0 flex-[1.15] pt-14 lg:flex-1">
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4">
          <Link
            href="/look"
            className="flex size-10 items-center justify-center rounded-full bg-white text-neutral-800 shadow-sm ring-1 ring-black/5"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="flex flex-col items-center gap-2">
            <p className={styles.stepTitle}>Personality</p>
            <div className="flex gap-1.5">
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              <span className="h-1.5 w-6 rounded-full bg-neutral-200" />
            </div>
          </div>
          <span className="size-10" aria-hidden="true" />
        </header>

        <Canvas
          camera={{ position: [0, 1.15, 4.1], fov: 32 }}
          className="h-full bg-transparent"
          style={{ background: 'transparent' }}
          shadows
          dpr={[1, 1.5]}
          gl={{ alpha: true, antialias: true, powerPreference: 'default', failIfMajorPerformanceCaveat: false }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0)
          }}
        >
          <ambientLight intensity={1.05} />
          <hemisphereLight args={['#FFF7EC', '#B8C4C0', 0.55]} />
          <directionalLight position={[2.2, 4.2, 2]} intensity={1.15} castShadow />
          <mesh position={[0, -0.06, 0]} receiveShadow>
            <cylinderGeometry args={[1.08, 1.14, 0.12, 48]} />
            <meshStandardMaterial color="#EEF1F5" roughness={0.72} metalness={0.04} />
          </mesh>
          <ContactShadows position={[0, 0.01, 0]} opacity={0.32} scale={3.2} blur={2.4} far={1.4} />
          <Suspense fallback={null}>
            <CharacterFigure appearance={preview} />
          </Suspense>
          <OrbitControls enablePan={false} enableZoom={false} minPolarAngle={1.1} maxPolarAngle={1.45} target={[0, 0.85, 0]} />
        </Canvas>
        <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-neutral-400">Drag to spin</p>
      </div>

      <aside className={lookStyles.panel}>
        <div className="shrink-0 px-5 pt-6 lg:px-8 lg:pt-8">
          <div className={lookStyles.identity}>
            <p className="boogaloo-regular look-username min-w-0 truncate text-black">@{username}</p>
            <p className={`${styles.hint} shrink-0`}>your Sim's name</p>
          </div>
        </div>

        <div className={lookStyles.options}>
          <section className="space-y-3">
            <div>
              <h2 className={styles.heading}>Character traits</h2>
              <p className={styles.lede}>Pick two that fit how you play.</p>
            </div>
            <div className={styles.grid} role="group" aria-label="Character traits">
              {TRAITS.map((trait) => {
                const selected = picked.includes(trait.id)
                return (
                  <button
                    key={trait.id}
                    type="button"
                    className={styles.card}
                    aria-pressed={selected}
                    onClick={() => toggle(trait.id)}
                  >
                    <img
                      className={styles.sticker}
                      src={trait.sticker}
                      alt=""
                      width={32}
                      height={32}
                      aria-hidden="true"
                    />
                    <span className={styles.title}>{trait.label}</span>
                    <span className={styles.blurb}>{trait.description}</span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <div className={lookStyles.footer}>
          <Button
            onClick={finish}
            disabled={!ready}
            className="h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
          >
            {actionLabel}
          </Button>
        </div>
      </aside>
    </main>
  )
}
