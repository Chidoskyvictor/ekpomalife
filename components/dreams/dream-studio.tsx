'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { LobbyButton } from '@/components/auth/lobby-button'
import { CreateStage } from '@/components/create/create-stage'
import {
  CardCopy,
  DreamList,
  Emoji3D,
  NameField,
  PanelPrompt,
  Selectable,
  StudioPanel,
  dreamCardClass,
} from '@/components/create/studio-panel'
import { ensureLocalPlayer } from '@/lib/game/accounts'
import { firstNameFor, loadCreation, rememberDream } from '@/lib/game/creation'
import { DREAMS, type DreamId } from '@/lib/game/dreams'
import { DEFAULT_APPEARANCE, type Appearance } from '@/lib/game/look'
import { type TraitId } from '@/lib/game/traits'

export function DreamStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [traits, setTraits] = useState<TraitId[]>([])
  const [picked, setPicked] = useState<DreamId | null>(null)

  useEffect(() => {
    const session = ensureLocalPlayer()
    const draft = loadCreation(session)
    if (!draft.appearance) {
      router.replace('/look')
      return
    }
    if (draft.traits.length < 2) {
      router.replace('/traits')
      return
    }
    setAppearance(draft.appearance)
    setTraits(draft.traits)
    setPicked(draft.dreamId)
    setPlayerName(firstNameFor(session))
    setUsername(session)
  }, [router])

  const preview = useMemo(() => appearance, [appearance])

  const select = (id: DreamId) => {
    setPicked(id)
    if (username) rememberDream(username, appearance, traits, id)
  }

  const finish = () => {
    if (!username || !picked) return
    rememberDream(username, appearance, traits, picked)
    router.replace('/live')
  }

  if (!username) return null

  return (
    <main className="app-wash flex h-dvh flex-col overflow-hidden lg:flex-row">
      <CreateStage title="Dream" step={3} backHref="/traits" appearance={preview} />

      <StudioPanel
        action={
          <LobbyButton type="button" disabled={!picked} onClick={finish}>
            Next: Where you live ▶
          </LobbyButton>
        }
      >
        <NameField username={username} />
        <PanelPrompt>What's {playerName}'s big dream?</PanelPrompt>
        <DreamList>
          {DREAMS.map((dream, index) => (
            <Selectable
              key={dream.id}
              index={index}
              pressed={picked === dream.id}
              role="radio"
              className={dreamCardClass()}
              onClick={() => select(dream.id)}
            >
              <Emoji3D src={dream.icon} size={40} />
              <CardCopy title={dream.title} description={dream.subtitle} />
            </Selectable>
          ))}
        </DreamList>
      </StudioPanel>
    </main>
  )
}
