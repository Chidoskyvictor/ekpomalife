'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { LobbyButton } from '@/components/auth/lobby-button'
import { CreateStage } from '@/components/create/create-stage'
import {
  ColorSwatches,
  NameField,
  PanelSection,
  PillRow,
  Selectable,
  StudioPanel,
  pillClass,
} from '@/components/create/studio-panel'
import { ensureLocalPlayer } from '@/lib/game/accounts'
import { loadCreation, rememberLook } from '@/lib/game/creation'
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

export function LookStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)

  useEffect(() => {
    const session = ensureLocalPlayer()
    setUsername(session)
    const draft = loadCreation(session)
    if (draft.appearance) setAppearance(draft.appearance)
  }, [router])

  const hair = HAIR_BY_BODY[appearance.body]
  const outfits = OUTFIT_BY_BODY[appearance.body]

  const setBody = (body: BodyId) => {
    setAppearance((current) => normalizeAppearance({ ...current, body }))
  }

  const finish = () => {
    if (!username) return
    rememberLook(username, appearance)
    router.replace('/traits')
  }

  const preview = useMemo(() => appearance, [appearance])

  if (!username) return null

  return (
    <main className="app-wash flex h-dvh flex-col overflow-hidden lg:flex-row">
      <CreateStage title="Look" step={1} backHref="/signup" appearance={preview} />

      <StudioPanel
        action={
          <LobbyButton onClick={finish}>
            Next: Personality ▶
          </LobbyButton>
        }
      >
        <NameField username={username} />
        <PanelSection label="Body">
          <PillRow split>
            {BODIES.map((body, index) => (
              <Selectable
                key={body.id}
                index={index}
                pressed={appearance.body === body.id}
                className={pillClass()}
                onClick={() => setBody(body.id)}
              >
                {body.label}
              </Selectable>
            ))}
          </PillRow>
        </PanelSection>
        <PanelSection label="Hair style">
          <PillRow>
            {hair.map((item, index) => (
              <Selectable
                key={item.id}
                index={index}
                pressed={appearance.hair === item.id}
                className={pillClass()}
                onClick={() => setAppearance((current) => ({ ...current, hair: item.id }))}
              >
                {item.label}
              </Selectable>
            ))}
          </PillRow>
        </PanelSection>
        <PanelSection label="Outfit">
          <PillRow>
            {outfits.map((item, index) => (
              <Selectable
                key={item.id}
                index={index}
                pressed={appearance.outfit === item.id}
                className={pillClass()}
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
              >
                {item.label}
              </Selectable>
            ))}
          </PillRow>
        </PanelSection>
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
      </StudioPanel>
    </main>
  )
}
