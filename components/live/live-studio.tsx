'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { LobbyButton } from '@/components/auth/lobby-button'
import { CreateStage } from '@/components/create/create-stage'
import { StartingMoneySpin } from '@/components/create/starting-money-spin'
import {
  Blurb,
  LodgeDetails,
  LodgeHead,
  LodgeList,
  LodgeMoney,
  NameField,
  PanelGroup,
  PanelPrompt,
  PanelSection,
  PillRow,
  Selectable,
  StudioPanel,
  lodgeCardClass,
  lodgeHitClass,
  pillClass,
} from '@/components/create/studio-panel'
import { Coins } from 'lucide-react'
import { startNewLife } from '@/hooks/use-game'
import { fetchAuthMe } from '@/lib/auth/fetch-auth-me'
import { getPostAuthRoute } from '@/lib/auth/post-auth-redirect'
import { ensureLocalPlayer, getAccount, getProfile } from '@/lib/game/accounts'
import { commitCharacter, loadCharacter, saveCharacterSetup } from '@/lib/game/character-api'
import { firstNameFor, loadCreation, rememberLive, rememberStartingMoney } from '@/lib/game/creation'
import panelStyles from '@/components/create/studio-panel.module.css'
import { DEFAULT_APPEARANCE, type Appearance } from '@/lib/game/look'
import {
  CHARACTER_TYPES,
  LODGINGS,
  formatNaira,
  lodgingNeedsCourse,
  type CharacterTypeId,
  type LodgingId,
} from '@/lib/game/live'
import { type DreamId } from '@/lib/game/dreams'
import { type TraitId } from '@/lib/game/traits'

export function LiveStudio() {
  const router = useRouter()
  const [username, setUsername] = useState<string | null>(null)
  const [playerName, setPlayerName] = useState('')
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [traits, setTraits] = useState<TraitId[]>([])
  const [dreamId, setDreamId] = useState<DreamId | null>(null)
  const [characterType, setCharacterType] = useState<CharacterTypeId>('student')
  const [lodgingId, setLodgingId] = useState<LodgingId | null>(null)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [pocket, setPocket] = useState<number | null>(null)
  const [spinOpen, setSpinOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [entering, setEntering] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    if (!draft.dreamId) {
      router.replace('/dream')
      return
    }
    setAppearance(draft.appearance)
    setTraits(draft.traits)
    setDreamId(draft.dreamId)
    setCharacterType(draft.characterType ?? 'student')
    setLodgingId(draft.lodgingId)
    setCourseId(draft.courseId ?? null)
    setPlayerName(firstNameFor(session))
    setUsername(session)
    if (draft.startingCash && draft.startingCash > 0) setPocket(draft.startingCash)
    void loadCharacter().then((character) => {
      if (!character.ok) return
      const cash = character.startingCash ?? character.cash
      if (cash && cash > 0) {
        setPocket(cash)
        if (character.startingTier) rememberStartingMoney(session, cash, character.startingTier)
      }
    })
  }, [router])

  const preview = useMemo(() => appearance, [appearance])

  const saveLive = (nextType: CharacterTypeId, nextLodge: LodgingId | null, nextCourse: string | null) => {
    if (!username) return
    rememberLive(username, {
      appearance,
      traits,
      dreamId,
      characterType: nextType,
      lodgingId: nextLodge,
      courseId: nextCourse,
    })
    if (nextLodge) {
      void saveCharacterSetup({
        characterType: nextType,
        lodgingId: nextLodge,
        courseId: nextCourse,
      })
    }
  }

  const canMoveIn = Boolean(lodgingId) && (!lodgingNeedsCourse(lodgingId) || Boolean(courseId))

  const finish = async () => {
    if (!username || !dreamId || !lodgingId || !canMoveIn || busy) return
    setBusy(true)
    setError(null)

    // Look / traits / dream are local until here — setup requires them on the server.
    const committed = await commitCharacter({ appearance, traits, dreamId })
    if (!committed.ok) {
      setError(committed.error || 'Could not save your character. Log in and try again.')
      setBusy(false)
      return
    }

    const saved = await saveCharacterSetup({
      characterType,
      lodgingId,
      courseId,
    })
    if (!saved.ok) {
      setError(saved.error || 'Could not save where you live.')
      setBusy(false)
      return
    }

    rememberLive(username, {
      appearance,
      traits,
      dreamId,
      characterType,
      lodgingId,
      courseId,
    })
    setSpinOpen(true)
    setBusy(false)
  }

  const enterCampus = (amount: number) => {
    if (!username || !dreamId || entering) return
    setEntering(true)
    const account = getAccount(username) ?? getProfile()
    startNewLife(account?.name ?? username, username, appearance, traits, dreamId, {
      characterType,
      lodgingId: lodgingId ?? undefined,
      courseId: courseId ?? undefined,
      startingCash: amount,
    })
    // Hard nav like post-auth — soft replace('/') often bounces back to /live
    // while AuthGate re-probes, so the button looks like a no-op.
    void (async () => {
      try {
        // game_state row may lag the spin response — probe /auth/me briefly.
        for (let attempt = 0; attempt < 4; attempt += 1) {
          const me = await fetchAuthMe()
          if (me?.setupComplete) {
            window.location.assign('/')
            return
          }
          if (me) {
            window.location.assign(getPostAuthRoute(me))
            return
          }
          if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 350))
        }
        window.location.assign('/')
      } catch {
        window.location.assign('/')
      }
    })()
  }

  if (!username || !dreamId) return null

  return (
    <main className="app-wash relative flex h-dvh max-w-full flex-col overflow-x-hidden overflow-y-hidden lg:flex-row">
      {pocket ? (
        <div className={panelStyles.liveCash} aria-label="Starting money">
          <Coins className="size-3.5" aria-hidden="true" />
          {formatNaira(pocket)}
        </div>
      ) : null}
      {spinOpen ? (
        <StartingMoneySpin
          username={username}
          appearance={appearance}
          traits={traits}
          dreamId={dreamId}
          onEnter={(rolled) => enterCampus(rolled)}
          entering={entering}
          onDismiss={() => setSpinOpen(false)}
        />
      ) : null}
      <CreateStage title="Home" step={4} backHref="/dream" appearance={preview} />

      <StudioPanel
        action={
          <LobbyButton type="button" disabled={!canMoveIn} loading={busy} onClick={() => void finish()}>
            Move in
          </LobbyButton>
        }
      >
        <NameField username={username} />
        {error ? (
          <div
            className="mb-3 rounded-xl bg-red-50 px-3 py-3 text-left text-sm font-medium leading-snug text-red-700"
            role="alert"
          >
            {error}
            <p className="mt-2 text-xs font-normal text-red-600/80">
              Tip: 401 means log in again. Network/timeout means the API at the proxy target is down.
            </p>
          </div>
        ) : null}
        <PanelPrompt>
          Where will {playerName} live? Rent is paid every Saturday.
        </PanelPrompt>
        <PanelGroup label="Character type">
          <PillRow compact>
            {CHARACTER_TYPES.map((item, index) => (
              <Selectable
                key={item.id}
                index={index}
                pressed={characterType === item.id}
                className={pillClass(true)}
                onClick={() => {
                  setCharacterType(item.id)
                  // Graduates (and non-students) keep lodging; course only matters for AAU hostel.
                  const nextCourse = lodgingNeedsCourse(lodgingId) ? courseId : null
                  saveLive(item.id, lodgingId, nextCourse)
                }}
              >
                {item.label}
              </Selectable>
            ))}
          </PillRow>
        </PanelGroup>
        {!canMoveIn && lodgingId && lodgingNeedsCourse(lodgingId) && !courseId ? (
          <p className="mb-3 text-left text-sm font-medium text-amber-800" role="status">
            Pick a course under AAU student lodging, then Move in. Same for Graduate or Student.
          </p>
        ) : null}
        <PanelSection label="Where to live">
          <LodgeList label="Where to live">
            {LODGINGS.map((item, index) => {
              const picked = lodgingId === item.id
              return (
                <div key={item.id} className={lodgeCardClass(picked)}>
                  <Selectable
                    index={index}
                    pressed={picked}
                    role="radio"
                    className={lodgeHitClass()}
                    onClick={() => {
                      const nextCourse = item.details ? courseId : null
                      setLodgingId(item.id)
                      if (!item.details) setCourseId(null)
                      saveLive(characterType, item.id, nextCourse)
                    }}
                  >
                    <LodgeHead
                      icon={item.icon}
                      photo={item.photo}
                      title={item.title}
                      badge={item.badge}
                      badgeTone={item.badgeTone}
                    />
                    <Blurb>{item.description}</Blurb>
                    <LodgeMoney rent={formatNaira(item.rentWeekly)} />
                  </Selectable>
                  {picked && item.details ? (
                    <LodgeDetails
                      perks={item.details.perks}
                      coursesLabel={item.details.coursesLabel}
                      courses={item.details.courses}
                      courseId={courseId}
                      onCourse={(id) => {
                        setCourseId(id)
                        saveLive(characterType, item.id, id)
                      }}
                    />
                  ) : null}
                </div>
              )
            })}
          </LodgeList>
        </PanelSection>
      </StudioPanel>
    </main>
  )
}
