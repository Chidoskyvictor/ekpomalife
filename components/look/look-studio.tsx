'use client'

import { ContactShadows, OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Button as ArcButton } from '@/components/arc/button/button'
import { Button } from '@/components/ui/button'
import { getSession, loadDraft, saveDraft } from '@/lib/game/accounts'
import {
  BODIES,
  CLOTH_COLORS,
  DEFAULT_APPEARANCE,
  HAIR_BY_BODY,
  HAIR_COLORS,
  OUTFIT_BY_BODY,
  SKIN_TONES,
  normalizeAppearance,
  type Appearance,
  type BodyId,
} from '@/lib/game/look'
import { outfitColorsFor } from '@/lib/game/outfit-config'
import { CharacterFigure } from './character-figure'
import styles from './look-studio.module.css'

function ColorSwatches({
  label,
  colors,
  value,
  onChange,
}: {
  label: string
  colors: readonly string[]
  value: string
  onChange: (color: string) => void
}) {
  const current = value.toUpperCase()

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium text-neutral-600">{label}</h2>
      <div className="flex flex-wrap gap-2.5">
        {colors.map((color) => {
          const selected = color.toUpperCase() === current
          return (
            <button
              key={color}
              type="button"
              aria-label={`${label} ${color}`}
              aria-pressed={selected}
              onClick={() => onChange(color.toUpperCase())}
              className={styles.swatch}
              style={{
                backgroundColor: color,
                boxShadow: selected ? '0 0 0 2px #2B7FFF' : '0 0 0 1px rgba(15, 23, 42, 0.12)',
              }}
            />
          )
        })}
      </div>
    </section>
  )
}

export function LookStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)

  useEffect(() => {
    const session = getSession()
    if (!session) {
      router.replace('/signup')
      return
    }
    setUsername(session)
    const draft = loadDraft(session)
    if (draft?.appearance) setAppearance(normalizeAppearance(draft.appearance as Appearance))
  }, [router])

  const hair = HAIR_BY_BODY[appearance.body]
  const outfits = OUTFIT_BY_BODY[appearance.body]

  const setBody = (body: BodyId) => {
    setAppearance((current) => normalizeAppearance({ ...current, body }))
  }

  const finish = () => {
    if (!username) return
    const draft = loadDraft(username)
    saveDraft(username, { ...draft, appearance })
    router.replace('/traits')
  }

  const preview = useMemo(() => appearance, [appearance])

  if (!username) return null

  return (
    <main className="app-wash flex h-dvh flex-col overflow-hidden lg:flex-row">
      <div className="relative min-h-0 flex-[1.15] pt-14 lg:flex-1">
        <header className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-4">
          <Link
            href="/signup"
            className="flex size-10 items-center justify-center rounded-full bg-white text-neutral-800 shadow-sm ring-1 ring-black/5"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" />
          </Link>
          <div className="flex flex-col items-center gap-2">
            <p className={styles.stepTitle}>Look</p>
            <div className="flex gap-1.5">
              <span className="h-1.5 w-6 rounded-full bg-primary" />
              <span className="h-1.5 w-6 rounded-full bg-neutral-200" />
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

      <aside className={styles.panel}>
        <div className="shrink-0 px-5 pt-6 lg:px-8 lg:pt-8">
          <div className={styles.identity}>
            <p className="boogaloo-regular look-username min-w-0 truncate text-black">@{username}</p>
            <p className="shrink-0 text-sm text-neutral-400">your Sim's name</p>
          </div>
        </div>

        <div className={styles.options}>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-600">Body</h2>
            <div className="grid grid-cols-2 gap-3">
              {BODIES.map((body) => (
                <ArcButton
                  key={body.id}
                  type="button"
                  size="lg"
                  variant={appearance.body === body.id ? 'primary' : 'secondary'}
                  aria-pressed={appearance.body === body.id}
                  onClick={() => setBody(body.id)}
                  className="w-full"
                  style={{ width: '100%', minHeight: 56, borderRadius: 999 }}
                >
                  <span className="look-body-label">{body.label}</span>
                </ArcButton>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-600">Hair style</h2>
            <div className="flex flex-wrap gap-2.5">
              {hair.map((item) => (
                <ArcButton
                  key={item.id}
                  type="button"
                  size="md"
                  variant={appearance.hair === item.id ? 'primary' : 'secondary'}
                  aria-pressed={appearance.hair === item.id}
                  onClick={() => setAppearance((current) => ({ ...current, hair: item.id }))}
                  style={{ borderRadius: 999, minHeight: 44, paddingInline: 18 }}
                >
                  {item.label}
                </ArcButton>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-neutral-600">Outfit</h2>
            <div className="flex flex-wrap gap-2.5">
              {outfits.map((item) => (
                <ArcButton
                  key={item.id}
                  type="button"
                  size="md"
                  variant={appearance.outfit === item.id ? 'primary' : 'secondary'}
                  aria-pressed={appearance.outfit === item.id}
                  onClick={() =>
                    setAppearance((current) => {
                      const preset = outfitColorsFor(current.body, item.id)
                      return {
                        ...current,
                        outfit: item.id,
                        ...(preset ? { topColor: preset.top, bottomColor: preset.bottom } : {}),
                      }
                    })
                  }
                  style={{ borderRadius: 999, minHeight: 44, paddingInline: 18 }}
                >
                  {item.label}
                </ArcButton>
              ))}
            </div>
          </section>

          <ColorSwatches
            label="Skin tone"
            colors={SKIN_TONES}
            value={appearance.skin}
            onChange={(skin) => setAppearance((current) => ({ ...current, skin }))}
          />
          <ColorSwatches
            label="Hair"
            colors={HAIR_COLORS}
            value={appearance.hairColor}
            onChange={(hairColor) => setAppearance((current) => ({ ...current, hairColor }))}
          />
          <ColorSwatches
            label="Outfit colour"
            colors={CLOTH_COLORS}
            value={appearance.topColor}
            onChange={(topColor) => setAppearance((current) => ({ ...current, topColor }))}
          />
          <ColorSwatches
            label="Bottoms"
            colors={CLOTH_COLORS}
            value={appearance.bottomColor}
            onChange={(bottomColor) => setAppearance((current) => ({ ...current, bottomColor }))}
          />
        </div>

        <div className={styles.footer}>
          <Button onClick={finish} className="h-12 w-full rounded-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90">
            Continue
          </Button>
        </div>
      </aside>
    </main>
  )
}
