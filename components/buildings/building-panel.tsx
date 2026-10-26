'use client'

import confetti from 'canvas-confetti'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Drawer } from 'vaul'
import { QuizFlow } from '@/components/buildings/quiz-flow'
import { JobsPanel } from '@/components/hud/jobs-panel'
import { ShopGrid } from '@/components/hud/shop-grid'
import { useEconomy } from '@/hooks/use-economy'
import { useGame } from '@/hooks/use-game'
import {
  chipLabel,
  isBuildingOpen,
  resolveBuilding,
  type BuildingActionDef,
  type BuildingDef,
} from '@/lib/game/buildings'
import { emptyCampus, feesBalance, type CampusState } from '@/lib/game/campus'
import { MAP_ZONES } from '@/lib/game/world-layout'
import { stickerForZone } from '@/lib/game/zone-stickers'
import { hapticTap } from '@/components/hud/haptic'
import econStyles from '@/components/hud/economy.module.css'
import styles from './building-panel.module.css'

function formatHour(hour: number) {
  const h12 = hour % 12 || 12
  return `${h12}${hour < 12 ? 'am' : 'pm'}`
}

function useIsMobile() {
  const [mobile, setMobile] = useState(true)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const apply = () => setMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  return mobile
}

function ActionCard({
  action,
  lockedReason,
  busy,
  onRun,
}: {
  action: BuildingActionDef
  lockedReason: string | null
  busy: boolean
  onRun: () => void
}) {
  const locked = Boolean(lockedReason)
  return (
    <article className={`${styles.actionCard} ${locked ? styles.actionLocked : ''}`}>
      <div className={styles.actionTop}>
        <span className={styles.actionEmoji} aria-hidden="true">
          {action.emoji}
        </span>
        <div>
          <p className={styles.actionTitle}>{action.title}</p>
          <p className={styles.actionSub}>{action.subtitle}</p>
        </div>
      </div>
      <div className={styles.chipRow}>
        {action.chips.map((chip, i) => (
          <span key={`${chip.kind}-${i}`} className={styles.chip}>
            {chipLabel(chip)}
          </span>
        ))}
      </div>
      {lockedReason ? <p className={styles.lockReason}>{lockedReason}</p> : null}
      <button
        type="button"
        className={styles.btn}
        disabled={locked || busy}
        onClick={onRun}
      >
        {action.buttonLabel}
      </button>
    </article>
  )
}

function PanelBody({
  building,
  campus,
  gameHour,
  isHere,
  closedReason,
  busy,
  onAction,
}: {
  building: BuildingDef
  campus: CampusState
  gameHour: number
  isHere: boolean
  closedReason: string | null
  busy: boolean
  onAction: (action: BuildingActionDef) => void
}) {
  const { state, act: runTravel } = useGame()
  const { shopItems, loadShop, loading } = useEconomy()
  const traits = state?.traits ?? []

  useEffect(() => {
    if (!building.showShop || !isHere) return
    void loadShop(building.id)
  }, [building.id, building.showShop, isHere, loadShop])

  return (
    <div className={styles.body}>
      {!isHere ? (
        <div className={styles.travelHint}>
          <p style={{ margin: '0 0 10px' }}>
            You are not here yet. Take a keke over, then these actions unlock.
          </p>
          <button
            type="button"
            className={styles.btn}
            disabled={busy}
            onClick={() => void runTravel('travel')}
          >
            Go by keke
          </button>
        </div>
      ) : null}

      {building.kind === 'student-affairs' && isHere ? (
        <div className={styles.feesBar}>
          <span>School fees balance</span>
          <strong>₦{feesBalance(campus).toLocaleString()}</strong>
        </div>
      ) : null}

      {building.actions.map((action) => {
        const lockedReason =
          !isHere
            ? 'Come to this building first.'
            : closedReason
              ? closedReason
              : action.lock?.({
                  campus,
                  gameHour,
                  traits,
                  placeId: building.id,
                }) ?? null
        return (
          <ActionCard
            key={action.id}
            action={action}
            lockedReason={lockedReason}
            busy={busy}
            onRun={() => onAction(action)}
          />
        )
      })}

      {isHere && building.showJobs ? <JobsPanel placeId={building.id} /> : null}
      {isHere && building.showShop ? (
        <div className={econStyles.section}>
          <p className={econStyles.sectionTitle}>Shop</p>
          {loading && shopItems.length === 0 ? (
            <>
              <div className={econStyles.skeleton} />
              <div className={econStyles.skeleton} />
            </>
          ) : (
            <ShopGrid items={shopItems} />
          )}
        </div>
      ) : null}
    </div>
  )
}

function Header({
  building,
  openLabel,
  open,
  onClose,
}: {
  building: BuildingDef
  openLabel: string
  open: boolean
  onClose: () => void
}) {
  return (
    <div className={styles.header}>
      <span className={styles.emoji} aria-hidden="true">
        {building.emoji}
      </span>
      <div className={styles.headerText}>
        <h2 className={styles.title}>{building.label}</h2>
        <div className={styles.metaRow}>
          <span className={`${styles.pill} ${open ? styles.pillOpen : styles.pillClosed}`}>
            {openLabel}
          </span>
        </div>
      </div>
      <button type="button" className={styles.closeBtn} aria-label="Close" onClick={onClose}>
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  )
}

export function BuildingPanel() {
  const mobile = useIsMobile()
  const { state, selectedId, select, act, travelTo, serverVersion, notifyToast } = useGame()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [quiz, setQuiz] = useState<{
    mode: 'quiz' | 'exam'
    bankId: string
    actionId: string
  } | null>(null)
  const [payOpen, setPayOpen] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [gpaOpen, setGpaOpen] = useState(false)
  const [ceremonyOpen, setCeremonyOpen] = useState(false)
  const [notices, setNotices] = useState<string[] | null>(null)

  const zone = useMemo(
    () => (selectedId ? MAP_ZONES.find((entry) => entry.id === selectedId) : null),
    [selectedId],
  )

  const building = useMemo(() => {
    if (!selectedId) return null
    const sticker = stickerForZone(selectedId, zone?.label ?? selectedId)
    return resolveBuilding(selectedId, zone?.label, sticker)
  }, [selectedId, zone])

  const campus = state?.campus ?? emptyCampus(100)
  const gameTime = state?.gameTime ?? 10 * 60
  const gameHour = Math.floor((((gameTime % 1440) + 1440) % 1440) / 60)
  const openInfo = building ? isBuildingOpen(building, gameTime) : { open: true, label: 'Open' }
  const isHere = Boolean(state && building && state.locationId === building.id)
  const open = Boolean(selectedId && building)

  const close = () => {
    select(null)
    setQuiz(null)
    setPayOpen(false)
    setGpaOpen(false)
    setCeremonyOpen(false)
    setNotices(null)
  }

  const runWithConfetti = async (action: BuildingActionDef, payload?: {
    amount?: number
    answers?: number[]
    questionIds?: string[]
  }) => {
    if (busy) return
    setBusy(true)
    const result = await act(action.id, { payload })
    setBusy(false)
    if (!result) return
    if (result.confetti) {
      void confetti({ particleCount: 90, spread: 70, origin: { y: 0.65 } })
    }
    if (result.resultView) setGpaOpen(true)
    if (result.notices) setNotices(result.notices)
    if (result.travelStub) {
      notifyToast('Other slabs coming soon. Hold tight.', true)
    }
    if (action.flow === 'ceremony' && result.ok) setCeremonyOpen(true)
  }

  const onAction = (action: BuildingActionDef) => {
    if (action.href) {
      router.push(action.href)
      return
    }
    if (action.flow === 'quiz' || action.flow === 'exam') {
      setQuiz({
        mode: action.flow === 'exam' ? 'exam' : 'quiz',
        bankId: action.quizBank ?? 'general',
        actionId: action.id,
      })
      return
    }
    if (action.flow === 'pay-fees') {
      setPayAmount(String(feesBalance(campus) || 1000))
      setPayOpen(true)
      return
    }
    if (action.flow === 'gpa') {
      void runWithConfetti(action).then(() => setGpaOpen(true))
      return
    }
    if (action.flow === 'ceremony') {
      void runWithConfetti(action)
      return
    }
    if (action.flow === 'travel-stub') {
      void runWithConfetti(action)
      return
    }
    void runWithConfetti(action)
  }

  if (!building || !open) return null

  const header = (
    <Header
      building={building}
      open={openInfo.open}
      openLabel={openInfo.label}
      onClose={close}
    />
  )

  const closedReason =
    !openInfo.open && building.openHours
      ? `Opens at ${formatHour(building.openHours.open)}`
      : null

  const body = (
    <PanelBody
      building={building}
      campus={campus}
      gameHour={gameHour}
      isHere={isHere}
      closedReason={closedReason}
      busy={busy}
      onAction={onAction}
    />
  )

  return (
    <>
      {mobile ? (
        <Drawer.Root
          open={open}
          onOpenChange={(next) => {
            if (next) hapticTap()
            if (!next) close()
          }}
          shouldScaleBackground={false}
        >
          <Drawer.Portal>
            <Drawer.Overlay className={styles.overlay} />
            <Drawer.Content className={styles.sheet} aria-describedby={undefined}>
              <div className={styles.handle} aria-hidden="true" />
              <Drawer.Title className="sr-only">{building.label}</Drawer.Title>
              {header}
              {body}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      ) : (
        <div className={styles.desktopRoot} role="presentation" onClick={close}>
          <div
            className={styles.desktopCard}
            role="dialog"
            aria-modal="true"
            aria-label={building.label}
            onClick={(event) => event.stopPropagation()}
          >
            {header}
            {body}
          </div>
        </div>
      )}

      {quiz ? (
        <QuizFlow
          mode={quiz.mode}
          bankId={quiz.bankId}
          placeId={building.id}
          version={serverVersion}
          onCancel={() => setQuiz(null)}
          onSubmit={(payload) => {
            const action = building.actions.find((row) => row.id === quiz.actionId)
            setQuiz(null)
            if (!action) return
            void runWithConfetti(action, payload)
          }}
        />
      ) : null}

      {payOpen ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Pay school fees">
          <div className={styles.modalCard}>
            <p className={styles.modalTitle}>Pay school fees</p>
            <p className={styles.modalMeta}>
              Balance ₦{feesBalance(campus).toLocaleString()}. Partial payment is fine.
            </p>
            <div className={styles.amountRow}>
              <input
                className={styles.amountInput}
                inputMode="numeric"
                value={payAmount}
                onChange={(event) => setPayAmount(event.target.value.replace(/[^\d]/g, ''))}
                aria-label="Amount"
              />
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                className={styles.btn}
                disabled={busy}
                onClick={() => {
                  const amount = Number(payAmount)
                  if (!Number.isFinite(amount) || amount <= 0) {
                    notifyToast('Enter an amount that makes sense.', false)
                    return
                  }
                  setPayOpen(false)
                  const action = building.actions.find((row) => row.id === 'pay-school-fees')
                  if (!action) return
                  void runWithConfetti(action, { amount })
                }}
              >
                Pay now
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={() => setPayOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {gpaOpen ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Results">
          <div className={styles.modalCard}>
            <p className={styles.modalTitle}>Result / transcript</p>
            <p className={styles.modalMeta}>GPA history from the school portal.</p>
            {(campus.gpaHistory.length === 0 && campus.pendingExamScore == null) ? (
              <p className={styles.actionSub}>No results yet. Write an exam at ICT when season opens.</p>
            ) : null}
            {campus.pendingExamScore != null ? (
              <p className={styles.actionSub}>
                Exam score pending release… check again after the portal refreshes.
              </p>
            ) : null}
            {campus.gpaHistory.map((row) => (
              <div key={`${row.semester}-${row.gpa}`} className={styles.gpaRow}>
                <span>
                  {row.semester}
                  {row.label ? ` · ${row.label}` : ''}
                </span>
                <strong>{row.gpa.toFixed(1)}</strong>
              </div>
            ))}
            <button type="button" className={styles.btn} onClick={() => setGpaOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      {ceremonyOpen ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Convocation">
          <div className={styles.modalCard}>
            <div className={styles.ceremony}>
              <div className={styles.ceremonyEmoji} aria-hidden="true">
                🎓
              </div>
              <p className={styles.modalTitle}>You walked the stage</p>
              <p className={styles.modalMeta}>
                Caps in the air. Your family is cheering your name. Ekpoma will remember.
              </p>
            </div>
            <button type="button" className={styles.btn} onClick={() => setCeremonyOpen(false)}>
              Felt that
            </button>
          </div>
        </div>
      ) : null}

      {notices ? (
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Notices">
          <div className={styles.modalCard}>
            <p className={styles.modalTitle}>Faculty notices</p>
            {notices.map((line) => (
              <p key={line} className={styles.actionSub} style={{ marginBottom: 8 }}>
                {line}
              </p>
            ))}
            <button type="button" className={styles.btn} onClick={() => setNotices(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
