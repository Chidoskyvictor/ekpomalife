'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { LobbyButton } from '@/components/auth/lobby-button'
import { CourseSearch } from '@/components/create/course-search'
import { CreateStage } from '@/components/create/create-stage'
import { StartingMoneySpin } from '@/components/create/starting-money-spin'
import {
  Blurb,
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
import { assignNavigation, replaceNavigation } from '@/lib/navigation/safe-nav'
import { ensureLocalPlayer, getAccount, getProfile } from '@/lib/game/accounts'
import { loadCharacter, saveCharacterSetup } from '@/lib/game/character-api'
import { firstNameFor, loadCreation, rememberLive, rememberStartingMoney } from '@/lib/game/creation'
import panelStyles from '@/components/create/studio-panel.module.css'
import { DEFAULT_APPEARANCE, type Appearance } from '@/lib/game/look'
import {
  CHARACTER_TYPES,
  canAffordLodging,
  formatNaira,
  getLodging,
  lodgingsFor,
  needsCourse,
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
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [entering, setEntering] = useState(false)
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
    if (!draft.dreamId) {
      replaceNavigation(router, '/dream')
      return
    }
    setAppearance(draft.appearance)
    setTraits(draft.traits)
    setDreamId(draft.dreamId)
    const type = draft.characterType ?? 'student'
    setCharacterType(type)
    // An older draft may hold the student hostel for someone who is not a student
    setLodgingId(getLodging(draft.lodgingId)?.studentOnly && type !== 'student' ? null : draft.lodgingId)
    setCourseId(needsCourse(type) ? (draft.courseId ?? null) : null)
    setPlayerName(firstNameFor(session))
    setUsername(session)
    if (draft.startingCash && draft.startingCash > 0) setPocket(draft.startingCash)
    // The spin comes first: no starting money on the server yet means the spinner opens right away
    void loadCharacter().then((character) => {
      const cash = character.ok ? (character.startingCash ?? null) : null
      if (cash && cash > 0) {
        setPocket(cash)
        if (character.ok && character.startingTier) rememberStartingMoney(session, cash, character.startingTier)
        // A house picked earlier that this money can't cover is un-picked
        if (character.ok && character.lodgingId && !canAffordLodging(getLodging(character.lodgingId) ?? { moveInFee: 0 }, cash)) {
          setLodgingId(null)
          setCourseId(null)
        }
      } else if (!character.ok && draft.startingCash && draft.startingCash > 0) {
        // Offline blip: keep the local roll
      } else {
        setSpinOpen(true)
      }
      setChecked(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount; router is unstable in dev
  }, [])

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

  const chosen = getLodging(lodgingId)
  const cash = pocket ?? 0
  const fee = chosen?.moveInFee ?? 0
  const canMoveIn =
    pocket !== null && Boolean(chosen) && canAffordLodging(chosen!, cash) && (!needsCourse(characterType) || Boolean(courseId))

  const finish = async () => {
    if (!username || !dreamId || !lodgingId || !canMoveIn || busy) return
    setBusy(true)
    setError(null)

    // Pays the move-in fee out of the spin and starts the game (the server does it once)
    const saved = await saveCharacterSetup({
      characterType,
      lodgingId,
      courseId,
      moveIn: true,
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
    setBusy(false)
    enterCampus(Math.max(0, cash - fee))
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
            assignNavigation('/')
            return
          }
          if (me) {
            assignNavigation(getPostAuthRoute(me))
            return
          }
          if (attempt < 3) await new Promise((resolve) => window.setTimeout(resolve, 350))
        }
        assignNavigation('/')
      } catch {
        assignNavigation('/')
      }
    })()
  }

  if (!username || !dreamId) return null
  // Wait for the server's word on the spin, so the house list never flashes before the spinner
  if (!checked && !spinOpen && pocket === null) return null

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
          onEnter={(rolled) => {
            setPocket(rolled)
            setSpinOpen(false)
          }}
          onDismiss={() => replaceNavigation(router, '/dream')}
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
          {pocket !== null
            ? `You start with ${formatNaira(pocket)}. Where will ${playerName} live? Rent is paid every Saturday.`
            : `Where will ${playerName} live? Rent is paid every Saturday.`}
        </PanelPrompt>
        {chosen && fee > 0 ? (
          <p className="mb-3 text-left text-sm font-medium text-emerald-800" role="status">
            Move-in {formatNaira(fee)} comes out of your {formatNaira(cash)}, leaving {formatNaira(Math.max(0, cash - fee))}.
          </p>
        ) : null}
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
                  // Only students have a course, and only students can live in the AAU hostel
                  const nextCourse = needsCourse(item.id) ? courseId : null
                  const stays = !getLodging(lodgingId)?.studentOnly || item.id === 'student'
                  const nextLodge = stays ? lodgingId : null
                  setCourseId(nextCourse)
                  setLodgingId(nextLodge)
                  saveLive(item.id, nextLodge, nextCourse)
                }}
              >
                {item.label}
              </Selectable>
            ))}
          </PillRow>
        </PanelGroup>
        {needsCourse(characterType) ? (
          <div className="mb-3">
            <CourseSearch
              value={courseId}
              onChange={(id) => {
                setCourseId(id)
                saveLive(characterType, lodgingId, id)
              }}
            />
            {!courseId ? (
              <p className="mt-2 text-left text-sm font-medium text-amber-800" role="status">
                Pick your course to move in.
              </p>
            ) : null}
          </div>
        ) : null}
        <PanelSection label="Where to live">
          <LodgeList label="Where to live">
            {lodgingsFor(characterType).map((item, index) => {
              const picked = lodgingId === item.id
              const locked = pocket !== null && !canAffordLodging(item, pocket)
              return (
                <div key={item.id} className={lodgeCardClass(picked, locked)}>
                  <Selectable
                    index={index}
                    pressed={picked}
                    role="radio"
                    disabled={locked}
                    className={lodgeHitClass()}
                    onClick={() => {
                      setLodgingId(item.id)
                      saveLive(characterType, item.id, courseId)
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
                    <LodgeMoney
                      rent={formatNaira(item.rentWeekly)}
                      moveIn={item.moveInFee > 0 ? formatNaira(item.moveInFee) : 'free'}
                      locked={locked}
                    />
                  </Selectable>
                </div>
              )
            })}
          </LodgeList>
        </PanelSection>
      </StudioPanel>
    </main>
  )
}
