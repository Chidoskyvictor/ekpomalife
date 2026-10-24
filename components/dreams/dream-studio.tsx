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
import { saveCharacterDream } from '@/lib/game/character-api'
import { firstNameFor, loadCreation, rememberDream } from '@/lib/game/creation'
import { DREAMS, type DreamId } from '@/lib/game/dreams'
import { DEFAULT_APPEARANCE, type Appearance } from '@/lib/game/look'
import { replaceNavigation } from '@/lib/navigation/safe-nav'
import { type TraitId } from '@/lib/game/traits'

export function DreamStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [traits, setTraits] = useState<TraitId[]>([])
  const [picked, setPicked] = useState<DreamId | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const session = ensureLocalPlayer()
    const draft = loadCreation(session)
    if (!draft.appearance) {
      replaceNavigation(router, '/look')
      return
    }
    if (draft.traits.length < 2) {
      replaceNavigation(router, '/traits')
      return
    }
    setAppearance(draft.appearance)
    setTraits(draft.traits)
    setPicked(draft.dreamId)
    setPlayerName(firstNameFor(session))
    setUsername(session)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, [])

  const preview = useMemo(() => appearance, [appearance])

  const select = (id: DreamId) => {
    setPicked(id)
    if (username) rememberDream(username, appearance, traits, id)
  }

  const finish = async () => {
    if (!username || !picked || busy) return
    setBusy(true)
    setError(null)
    rememberDream(username, appearance, traits, picked)
    const saved = await saveCharacterDream(picked)
    if (!saved.ok) {
      setError(saved.error || 'Could not save your dream. Log in and try again.')
      setBusy(false)
      return
    }
    replaceNavigation(router, '/live')
  }

  if (!username) return null

  return (
    <main className="app-wash flex h-dvh max-w-full flex-col overflow-x-hidden overflow-y-hidden lg:flex-row">
      <CreateStage title="Dream" step={3} backHref="/traits" appearance={preview} />

      <StudioPanel
        action={
          <LobbyButton type="button" loading={busy} disabled={!picked} onClick={() => void finish()}>
            Next: Where you live ▶
          </LobbyButton>
        }
      >
        <NameField username={username} />
        {error ? (
          <p className="mb-3 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
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
