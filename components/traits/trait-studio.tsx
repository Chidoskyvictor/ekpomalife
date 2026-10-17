'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { LobbyButton } from '@/components/auth/lobby-button'
import { CreateStage } from '@/components/create/create-stage'
import {
  CardCopy,
  Emoji3D,
  NameField,
  PanelPrompt,
  Selectable,
  StudioPanel,
  TraitGrid,
  traitCardClass,
} from '@/components/create/studio-panel'
import { ensureLocalPlayer } from '@/lib/game/accounts'
import { firstNameFor, loadCreation, rememberTraits } from '@/lib/game/creation'
import { DEFAULT_APPEARANCE, type Appearance } from '@/lib/game/look'
import { TRAIT_LIMIT, TRAITS, type TraitId } from '@/lib/game/traits'

export function TraitStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [picked, setPicked] = useState<TraitId[]>([])
  useEffect(() => {
    const session = ensureLocalPlayer()
    const draft = loadCreation(session)
    if (!draft.appearance) {
      router.replace('/look')
      return
    }
    setAppearance(draft.appearance)
    setPicked(draft.traits)
    setPlayerName(firstNameFor(session))
    setUsername(session)
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
      if (username) rememberTraits(username, appearance, next)
      return next
    })
  }

  const finish = () => {
    if (!username || !ready) return
    rememberTraits(username, appearance, picked)
    router.replace('/dream')
  }

  if (!username) return null

  const actionLabel = ready ? 'Next: Dream ▶' : remaining === 1 ? 'Choose 1 more' : `Choose ${remaining} more`

  return (
    <main className="app-wash flex h-dvh flex-col overflow-hidden lg:flex-row">
      <CreateStage title="Personality" step={2} backHref="/look" appearance={preview} />

      <StudioPanel
        action={
          <LobbyButton onClick={finish} disabled={!ready}>
            {actionLabel}
          </LobbyButton>
        }
      >
        <NameField username={username} />
        <PanelPrompt>Choose 2 traits for {playerName}.</PanelPrompt>
        <TraitGrid>
          {TRAITS.map((trait, index) => (
            <Selectable
              key={trait.id}
              index={index}
              pressed={picked.includes(trait.id)}
              className={traitCardClass()}
              onClick={() => toggle(trait.id)}
            >
              <Emoji3D src={trait.sticker} size={32} />
              <CardCopy title={trait.label} description={trait.description} />
            </Selectable>
          ))}
        </TraitGrid>
      </StudioPanel>
    </main>
  )
}
