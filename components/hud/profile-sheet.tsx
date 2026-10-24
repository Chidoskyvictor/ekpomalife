'use client'

import { Pencil, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/arc/button/button'
import { PlayerProfilePanel } from '@/components/profile/player-profile-panel'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import { useMyHostel } from '@/hooks/use-hostel'
import { emptyCampus, feesBalance } from '@/lib/game/campus'
import { dreamProgress, getDream, snapshotFromLife } from '@/lib/game/dreams'
import { fetchNeighbours, type Neighbour } from '@/lib/game/hostels-api'
import { normalizeAppearance, type Appearance } from '@/lib/game/look'
import { fetchMyProfile } from '@/lib/game/profile-api'
import {
  criticalNeed,
  levelFromXp,
  moodFromNeeds,
  NEED_GRID,
  NEED_META,
  needTone,
  needValue,
  type NeedId,
} from '@/lib/game/needs'
import { TRAITS } from '@/lib/game/traits'
import type { GameState } from '@/lib/game/types'
import { AvatarPortrait } from './avatar-portrait'
import { CharacterSpinner } from './character-spinner'
import { HudDrawer } from './hud-drawer'
import { LookEditor } from './look-editor'
import styles from './profile-sheet.module.css'

const TONE = {
  good: '#22c55e',
  warn: '#f59e0b',
  bad: '#ef4444',
} as const

type Tab = 'profile' | 'needs' | 'goals' | 'skills' | 'people' | 'career'

const TABS: { id: Tab; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'needs', label: 'Needs' },
  { id: 'goals', label: 'Goals' },
  { id: 'skills', label: 'Skills' },
  { id: 'people', label: 'People' },
  { id: 'career', label: 'Career' },
]

/** "Feelings" worked out from needs — low needs hurt, high needs help. */
const FEELING_LOW: Record<NeedId, { title: string; text: string; points: number }> = {
  hunger: { title: 'Starving', text: 'Eat something now.', points: -30 },
  energy: { title: 'Exhausted', text: 'Find somewhere to sleep.', points: -20 },
  fun: { title: 'Bored', text: 'Hang out or watch a match.', points: -10 },
  social: { title: 'Lonely', text: 'Chat with your neighbours.', points: -12 },
  hygiene: { title: 'Needs a bath', text: 'A shower will sort it out.', points: -12 },
  study: { title: 'Behind on books', text: 'Hit the library.', points: -10 },
}

const FEELING_HIGH: Record<NeedId, { title: string; text: string; points: number }> = {
  hunger: { title: 'Well fed', text: 'Belly full, mind clear.', points: 10 },
  energy: { title: 'Well rested', text: 'Ready for anything.', points: 10 },
  fun: { title: 'Having fun', text: 'Life is sweet right now.', points: 8 },
  social: { title: 'Connected', text: 'Your people have your back.', points: 8 },
  hygiene: { title: 'Fresh & clean', text: 'Nothing beats a good bath.', points: 10 },
  study: { title: 'On top of studies', text: 'Lectures are making sense.', points: 8 },
}

function feelings(state: GameState) {
  const list: { id: string; emoji: string; title: string; text: string; points: number }[] = []
  for (const id of NEED_GRID) {
    const value = needValue(state, id)
    const meta = NEED_META[id]
    if (value < 25) list.push({ id: `${id}-low`, emoji: meta.emoji, ...FEELING_LOW[id] })
    else if (value >= 80) list.push({ id: `${id}-high`, emoji: meta.emoji, ...FEELING_HIGH[id] })
  }
  return list.sort((a, b) => b.points - a.points)
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <span className={styles.track} aria-hidden="true">
      <span className={styles.fill} style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </span>
  )
}

export function ProfileSheet({
  open,
  onOpenChange,
  state,
  onChangeDream,
  onOpenSettings,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  state: GameState
  onChangeDream: () => void
  onOpenSettings?: () => void
}) {
  const [tab, setTab] = useState<Tab>('profile')
  const { changeLook } = useGame()
  // While editing, the 3D stage previews this draft instead of the saved look
  const [lookDraft, setLookDraft] = useState<Appearance | null>(null)
  useEffect(() => {
    if (!open) setLookDraft(null)
  }, [open])
  // Header shows the player's profile display name (game state only has a generic character name)
  const [displayName, setDisplayName] = useState<string | null>(null)
  useEffect(() => {
    if (!open || displayName) return
    fetchMyProfile()
      .then((profile) => setDisplayName(profile.displayName))
      .catch(() => {})
  }, [open, displayName])
  const mood = moodFromNeeds(state)
  const critical = criticalNeed(state)
  const status = critical ? `${mood.label} · ${FEELING_LOW[critical].title}` : mood.label
  const initial = ((displayName ?? state.characterName).trim()[0] || state.username[0] || 'E').toUpperCase()

  return (
    <HudDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={displayName ?? state.characterName}
      description={status}
      tall
      leading={
        <span className={styles.headAvatar}>
          <AvatarPortrait
            appearance={state.appearance}
            fallbackColor={state.avatarColor}
            initial={initial}
            className={styles.headAvatarImg}
          />
        </span>
      }
    >
      <div className={styles.tabs} role="tablist" aria-label="Profile sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        {onOpenSettings ? (
          <button type="button" className={styles.tab} aria-label="Settings" onClick={onOpenSettings}>
            <Settings size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <div className={styles.panel} role="tabpanel">
        {tab === 'profile' ? (
          <>
            {open ? <CharacterSpinner appearance={lookDraft ?? state.appearance} /> : null}
            {lookDraft ? (
              <LookEditor
                draft={lookDraft}
                onDraft={setLookDraft}
                onCancel={() => setLookDraft(null)}
                onSaved={(saved) => {
                  changeLook(saved)
                  setLookDraft(null)
                }}
              />
            ) : (
              <>
                <button
                  type="button"
                  className={styles.editLook}
                  onClick={() => setLookDraft(normalizeAppearance(state.appearance))}
                >
                  <Pencil size={15} aria-hidden="true" />
                  Edit your look
                </button>
                <PlayerProfilePanel compact />
              </>
            )}
          </>
        ) : null}
        {tab === 'needs' ? <NeedsTab state={state} /> : null}
        {tab === 'goals' ? (
          <GoalsTab
            state={state}
            onChangeDream={() => {
              onOpenChange(false)
              onChangeDream()
            }}
          />
        ) : null}
        {tab === 'skills' ? <SkillsTab state={state} /> : null}
        {tab === 'people' ? <PeopleTab /> : null}
        {tab === 'career' ? <CareerTab state={state} /> : null}
      </div>
    </HudDrawer>
  )
}

function NeedsTab({ state }: { state: GameState }) {
  const list = feelings(state)
  const traits = TRAITS.filter((t) => state.traits?.includes(t.id))
  return (
    <>
      <div className={styles.card}>
        {NEED_GRID.map((id) => {
          const value = Math.round(needValue(state, id))
          const meta = NEED_META[id]
          return (
            <div key={id} className={styles.needRow}>
              <img src={meta.emoji} alt="" width={20} height={20} />
              <span className={styles.needLabel}>{meta.label}</span>
              <Bar value={value} color={TONE[needTone(value)]} />
              <span className={styles.needValue}>{value}</span>
            </div>
          )
        })}
      </div>

      <p className={styles.section}>Feelings</p>
      {list.length === 0 ? <p className={styles.muted}>Feeling normal — nothing pulling you up or down.</p> : null}
      {list.map((f) => (
        <div key={f.id} className={styles.feeling}>
          <img src={f.emoji} alt="" width={22} height={22} />
          <span className={styles.feelingText}>
            <strong>{f.title}</strong>
            <span>{f.text}</span>
          </span>
          <span className={f.points > 0 ? styles.plus : styles.minus}>
            {f.points > 0 ? `+${f.points}` : f.points}
          </span>
        </div>
      ))}

      {traits.length ? (
        <p className={styles.muted}>
          Traits: {traits.map((t) => t.label).join(' · ')}
        </p>
      ) : null}
    </>
  )
}

function GoalsTab({ state, onChangeDream }: { state: GameState; onChangeDream: () => void }) {
  const dream = getDream(state.dreamId)
  const progress = dream ? dreamProgress(dream, snapshotFromLife(state.cash, state.dream)) : null
  const ratio = progress && progress.target > 0 ? Math.min(1, progress.current / progress.target) : 0
  return (
    <>
      <p className={styles.section}>Lifetime dream</p>
      {dream && progress ? (
        <div className={styles.card}>
          <div className={styles.row}>
            <span className={styles.bigEmoji} aria-hidden="true">
              {dream.emoji}
            </span>
            <span className={styles.rowText}>
              <strong>{dream.title}</strong>
              <span>{progress.complete ? 'Achieved 🏆' : progress.label}</span>
            </span>
          </div>
          <Bar value={ratio * 100} color={progress.complete ? TONE.good : '#2f7cf6'} />
        </div>
      ) : (
        <p className={styles.muted}>No dream yet. Pick one to unlock quest tips.</p>
      )}
      <Button type="button" variant="secondary" onClick={onChangeDream}>
        Change dream
      </Button>

      <p className={styles.section}>Badges</p>
      {state.badges.length ? (
        <div className={styles.chips}>
          {state.badges.map((badge) => (
            <span key={badge} className={styles.chip}>
              🏅 {badge}
            </span>
          ))}
        </div>
      ) : (
        <p className={styles.muted}>Badges you earn around campus show up here.</p>
      )}
    </>
  )
}

function SkillsTab({ state }: { state: GameState }) {
  const level = levelFromXp(state.xp)
  const traits = TRAITS.filter((t) => state.traits?.includes(t.id))
  const stats = [
    { label: 'Academics', value: state.academic, emoji: '📚' },
    { label: 'Reputation', value: state.reputation, emoji: '⭐' },
    { label: 'Health', value: state.health, emoji: '❤️' },
  ]
  return (
    <>
      <div className={styles.card}>
        <div className={styles.row}>
          <span className={styles.levelBadge}>{level.level}</span>
          <span className={styles.rowText}>
            <strong>Level {level.level}</strong>
            <span>
              {level.into} / {level.next} XP to level {level.level + 1}
            </span>
          </span>
        </div>
        <Bar value={level.progress * 100} color="#2f7cf6" />
      </div>
      <div className={styles.card}>
        {stats.map((s) => {
          const value = Math.round(Math.max(0, Math.min(100, s.value)))
          return (
            <div key={s.label} className={styles.needRow}>
              <span className={styles.statEmoji} aria-hidden="true">
                {s.emoji}
              </span>
              <span className={styles.needLabel}>{s.label}</span>
              <Bar value={value} color={TONE[needTone(value)]} />
              <span className={styles.needValue}>{value}</span>
            </div>
          )
        })}
      </div>
      <p className={styles.section}>Traits</p>
      {traits.length ? (
        traits.map((t) => (
          <div key={t.id} className={styles.feeling}>
            <img src={t.sticker} alt="" width={22} height={22} />
            <span className={styles.feelingText}>
              <strong>{t.label}</strong>
              <span>{t.description}</span>
            </span>
          </div>
        ))
      ) : (
        <p className={styles.muted}>No traits picked.</p>
      )}
    </>
  )
}

function PeopleTab() {
  const { hostel, loading } = useMyHostel()
  const [neighbours, setNeighbours] = useState<Neighbour[] | null>(null)

  useEffect(() => {
    if (!hostel) return
    void fetchNeighbours(hostel.id).then((res) => {
      if (res.ok) setNeighbours(res.neighbours)
    })
  }, [hostel])

  if (loading) return <p className={styles.muted}>Loading…</p>
  if (!hostel) {
    return <p className={styles.muted}>Join your hostel from the search on Home to see your neighbours here.</p>
  }
  return (
    <>
      <p className={styles.section}>🏠 {hostel.name}</p>
      {neighbours == null ? <p className={styles.muted}>Loading neighbours…</p> : null}
      {neighbours?.map((n) => (
        <div key={n.userId} className={styles.person}>
          <span className={styles.personAvatar} style={{ background: n.avatar.color }} aria-hidden="true">
            {n.avatar.emoji || n.displayName.trim()[0]?.toUpperCase()}
          </span>
          <span className={styles.rowText}>
            <strong>
              {n.displayName}
              {n.isMe ? <span className={styles.you}> · You</span> : null}
            </strong>
            <span>Neighbour</span>
          </span>
        </div>
      ))}
    </>
  )
}

function CareerTab({ state }: { state: GameState }) {
  const { jobs, currentJobId, loadJobs } = useEconomy()
  const campus = state.campus ?? emptyCampus(100)
  const job = jobs.find((j) => j.id === currentJobId) ?? null
  const fees = feesBalance(campus)
  const lastGpa = campus.gpaHistory.at(-1)

  useEffect(() => {
    if (currentJobId && !jobs.some((j) => j.id === currentJobId)) void loadJobs()
  }, [currentJobId, jobs, loadJobs])

  return (
    <>
      <p className={styles.section}>Job</p>
      <div className={styles.card}>
        {job ? (
          <div className={styles.row}>
            <span className={styles.bigEmoji} aria-hidden="true">
              💼
            </span>
            <span className={styles.rowText}>
              <strong>{job.title}</strong>
              <span>₦{job.payPerShift.toLocaleString()} per shift</span>
            </span>
          </div>
        ) : (
          <p className={styles.mutedInline}>No job yet — check the Jobs app on your phone.</p>
        )}
      </div>

      <p className={styles.section}>Campus</p>
      <div className={styles.card}>
        <div className={styles.factRow}>
          <span>Level</span>
          <strong>{campus.level}L</strong>
        </div>
        <div className={styles.factRow}>
          <span>School fees</span>
          <strong>{fees > 0 ? `₦${fees.toLocaleString()} left` : 'Cleared ✓'}</strong>
        </div>
        <div className={styles.factRow}>
          <span>Course registration</span>
          <strong>{campus.registered ? 'Done ✓' : 'Not yet'}</strong>
        </div>
        <div className={styles.factRow}>
          <span>ID card</span>
          <strong>{campus.hasIdCard ? 'Collected ✓' : 'Not yet'}</strong>
        </div>
        <div className={styles.factRow}>
          <span>Last GPA</span>
          <strong>{lastGpa ? `${lastGpa.gpa.toFixed(2)} (${lastGpa.semester})` : '—'}</strong>
        </div>
      </div>
    </>
  )
}
