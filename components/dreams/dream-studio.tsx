'use client'

import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { CharacterFigure } from '@/components/look/character-figure'
import { Button } from '@/components/arc/button/button'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { dreamRadioOptions } from '@/components/dreams/dream-options'
import lookStyles from '@/components/look/look-studio.module.css'
import { startNewLife } from '@/hooks/use-game'
import { clearDraft, getAccount, getProfile, getSession, loadDraft, saveDraft } from '@/lib/game/accounts'
import { saveCharacterDream } from '@/lib/game/character-api'
import { normalizeDreamId, type DreamId } from '@/lib/game/dreams'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from '@/lib/game/look'
import { normalizeTraits, type TraitId } from '@/lib/game/traits'
import styles from '@/components/traits/trait-studio.module.css'

export function DreamStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [traits, setTraits] = useState<TraitId[]>([])
  const [picked, setPicked] = useState<DreamId | null>(null)

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
    const nextTraits = normalizeTraits(draft.traits)
    if (nextTraits.length < 2) {
      router.replace('/traits')
      return
    }
    setUsername(session)
    setAppearance(normalizeAppearance(draft.appearance as Appearance))
    setTraits(nextTraits)
    setPicked(normalizeDreamId(draft.dreamId))
  }, [router])

  const preview = useMemo(() => appearance, [appearance])

  const select = (id: DreamId) => {
    setPicked(id)
    if (username) {
      const draft = loadDraft(username)
      saveDraft(username, { ...draft, appearance, traits, dreamId: id })
    }
  }

  const finish = async () => {
    if (!username || !picked) return
    const account = getAccount(username) ?? getProfile()
    saveDraft(username, { appearance, traits, dreamId: picked })
    await saveCharacterDream(picked)
    startNewLife(account?.name ?? username, username, appearance, traits, picked)
    clearDraft(username)
    router.replace('/')
  }

  if (!username) return null

  return (
    <main className="app-wash flex h-dvh flex-col overflow-hidden lg:flex-row">
      <div className="relative min-h-0 flex-[1.15] pt-14 lg:flex-1">
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4">
          <Link
            href="/traits"
            className="flex size-10 items-center justify-center rounded-full bg-white text-neutral-800 shadow-sm ring-1 ring-black/5"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="flex flex-col items-center gap-2">
            <p className={styles.stepTitle}>Dream</p>
            <div className="flex gap-1.5">
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              <span className="h-1.5 w-6 rounded-full bg-primary" />
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
          <RadioCards
            aria-label="Big dream"
            layout="list"
            value={picked}
            onValueChange={(value) => select(value as DreamId)}
            options={dreamRadioOptions()}
          />
        </div>

        <div className={lookStyles.footer}>
          <Button type="button" disabled={!picked} onClick={() => void finish()} style={{ width: '100%' }}>
            Continue
          </Button>
        </div>
      </aside>
    </main>
  )
}
