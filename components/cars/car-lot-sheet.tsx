'use client'

import { Canvas, useFrame } from '@react-three/fiber'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Group } from 'three'
import { useGame } from '@/hooks/use-game'
import {
  buyCar,
  buyParking,
  closeCarLot,
  driveCar,
  fixCar,
  newIdempotencyKey,
  openCarLot,
  paintCar,
  sellCar,
  useCarLot,
  useCarLotModel,
  useGarage,
  type CarFail,
  type OwnedCar,
} from '@/lib/game/cars-api'
import { CARS, PAINTS, PARKING_PRICE, carById, carSellBack, dentFixPrice } from '@/lib/game/cars-rules'
import type { ServerGameState } from '@/lib/game/game-api'
import base from '@/components/hud/map-place-sheet.module.css'
import { CarModel } from './car-model'
import styles from './car-lot-sheet.module.css'

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`
/** ₦4.5m, ₦500k: short enough for a chip. */
const short = (n: number) => (n >= 1_000_000 ? `₦${+(n / 1_000_000).toFixed(1)}m` : n >= 1000 ? `₦${Math.round(n / 1000)}k` : `₦${n}`)

function Spin({ id, color, dents }: { id: string; color: string; dents: number }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.6
  })
  return (
    <group ref={ref} rotation={[0, -0.6, 0]}>
      <CarModel id={id} color={color} dents={dents} />
    </group>
  )
}

function Preview({ id, color, dents = 0 }: { id: string; color: string; dents?: number }) {
  return (
    <div className={styles.preview} aria-hidden="true">
      <Canvas dpr={[1, 1.5]} camera={{ position: [5.2, 2.6, 6.2], fov: 30 }} gl={{ antialias: true, alpha: true }} onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)}>
        <ambientLight intensity={1.5} />
        <directionalLight position={[4, 8, 5]} intensity={2.2} />
        <Spin id={id} color={color} dents={dents} />
      </Canvas>
    </div>
  )
}

type Step = 'idle' | 'confirm' | 'paint' | 'sell' | 'parking'

/**
 * Magmus Autos car lot: Showroom (buy, with a confirm step that shows price and wallet) and
 * My garage (drive, paint, sell back at 60%). Opens from the bar inside the Magmus Autos showroom,
 * by tapping a car on display there, or by tapping a car parked at your house.
 */
export function CarLotSheet({ hidden = false }: { hidden?: boolean }) {
  const { state, isGuest, applyServerState, notifyToast } = useGame()
  const signedIn = !isGuest && Boolean(state)
  const tab = useCarLot()
  const garage = useGarage(signedIn && tab !== null)
  const [modelId, setModelId] = useState(CARS[0]!.id)
  const [carId, setCarId] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [busy, setBusy] = useState(false)
  const key = useRef(newIdempotencyKey())

  // A car tapped on the showroom floor opens the sheet on that car
  const tapped = useCarLotModel()
  useEffect(() => {
    if (tapped) setModelId(tapped)
  }, [tapped])
  // Never left open behind another screen
  useEffect(() => () => closeCarLot(), [])

  useEffect(() => {
    setStep('idle')
    key.current = newIdempotencyKey()
  }, [tab, modelId, carId])

  useEffect(() => {
    if (!tab) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeCarLot()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab])

  if (!tab || hidden || !signedIn) return null

  const cash = state?.cash ?? 0
  const atMechanic = state?.locationId === 'magmus-autos'
  const cars = garage?.cars ?? []
  const needsParking = garage?.needsParking ?? false
  const model = carById(modelId) ?? CARS[0]!
  const owned: OwnedCar | null = cars.find((c) => c.id === carId) ?? cars.find((c) => c.active) ?? cars[0] ?? null
  const ownedModel = owned ? carById(owned.model) : null
  const total = model.price + (needsParking ? PARKING_PRICE : 0)
  const totalValue = cars.reduce((sum, c) => sum + c.paid, 0)

  /** Runs one paid/saved action; the key is reused if the same tap is retried after a failure. */
  const run = async (call: (k: string) => Promise<{ ok: true; state: ServerGameState; message: string } | CarFail>, after?: () => void) => {
    setBusy(true)
    try {
      const res = await call(key.current)
      if (!res.ok) {
        notifyToast(res.error ?? 'Something went wrong. Try again.', false)
        if (!res.network) key.current = newIdempotencyKey()
        return
      }
      key.current = newIdempotencyKey()
      applyServerState(res.state)
      notifyToast(res.message, true)
      setStep('idle')
      after?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={`${base.sheet} ${styles.sheet}`} aria-label="Magmus Autos car lot">
      <div className={base.handle} aria-hidden="true" />
      <header className={styles.head}>
        <div className={styles.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'showroom'} className={tab === 'showroom' ? styles.tabOn : ''} onClick={() => openCarLot('showroom')}>
            Showroom
          </button>
          <button type="button" role="tab" aria-selected={tab === 'garage'} className={tab === 'garage' ? styles.tabOn : ''} onClick={() => openCarLot('garage')}>
            My garage
          </button>
        </div>
        <span className={styles.wallet} title="Your wallet">
          {short(cash)}
        </span>
        <button type="button" className={base.close} aria-label="Close" onClick={closeCarLot}>
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <div className={`${base.body} ${styles.body}`}>
        {tab === 'showroom' ? (
          <>
            <div className={styles.card}>
              <Preview id={model.id} color={model.color} />
              <div className={styles.info}>
                <h2>{model.name}</h2>
                <span className={styles.nick}>“{model.nickname}”</span>
                <p>{model.blurb}</p>
                {model.topKmh ? <span className={styles.nick}>Top speed {model.topKmh} km/h</span> : null}
              </div>
            </div>
            {step === 'confirm' ? (
              <div className={styles.confirm} role="dialog" aria-label={`Buy ${model.name}`}>
                <dl>
                  <div>
                    <dt>{model.name}</dt>
                    <dd>{naira(model.price)}</dd>
                  </div>
                  {needsParking ? (
                    <div>
                      <dt>Parking space (one-time)</dt>
                      <dd>{naira(PARKING_PRICE)}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Your wallet</dt>
                    <dd>{naira(cash)}</dd>
                  </div>
                  <div className={styles.after}>
                    <dt>Left after</dt>
                    <dd>{naira(cash - total)}</dd>
                  </div>
                </dl>
                <div className={styles.row}>
                  <button type="button" className={styles.btn} disabled={busy} onClick={() => setStep('idle')}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.primary}`}
                    disabled={busy}
                    onClick={() => void run((k) => buyCar(model.id, needsParking, k), () => openCarLot('garage'))}
                  >
                    {busy ? 'Paying…' : `Pay ${short(total)}`}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.chips} role="listbox" aria-label="Cars for sale">
                  {CARS.map((car) => (
                    <button key={car.id} type="button" role="option" aria-selected={car.id === model.id} className={`${styles.chip} ${car.id === model.id ? styles.chipOn : ''}`} onClick={() => setModelId(car.id)}>
                      <strong>{car.name.replace(/^(Toyota|Lexus|Mercedes) /, '')}</strong>
                      <small>{short(car.price)}</small>
                    </button>
                  ))}
                </div>
                {needsParking ? <p className={styles.note}>🅿️ Your home has no parking. A {short(PARKING_PRICE)} space is added to your first car.</p> : null}
                <button type="button" className={`${styles.btn} ${styles.primary} ${styles.wide}`} disabled={!garage || cash < total} onClick={() => setStep('confirm')}>
                  {cash < total ? `Need ${short(total)}` : `Buy · ${short(model.price)}`}
                </button>
              </>
            )}
          </>
        ) : !owned || !ownedModel ? (
          <div className={styles.empty}>
            <p>{garage ? 'No car yet. Pick one in the Showroom and it parks at your house.' : 'Opening your garage…'}</p>
            {garage && needsParking ? (
              step === 'parking' ? (
                <div className={styles.row}>
                  <button type="button" className={styles.btn} disabled={busy} onClick={() => setStep('idle')}>
                    Cancel
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.primary}`} disabled={busy} onClick={() => void run((k) => buyParking(k))}>
                    Pay {naira(PARKING_PRICE)}
                  </button>
                </div>
              ) : (
                <button type="button" className={`${styles.btn} ${styles.wide}`} disabled={cash < PARKING_PRICE} onClick={() => setStep('parking')}>
                  🅿️ Buy parking space · {short(PARKING_PRICE)}
                </button>
              )
            ) : null}
          </div>
        ) : (
          <>
            <div className={styles.card}>
              <Preview id={owned.model} color={owned.color} dents={owned.dents} />
              <div className={styles.info}>
                <h2>{ownedModel.name}</h2>
                <span className={styles.nick}>{owned.active ? '🔑 Driving this one' : `“${ownedModel.nickname}”`}</span>
                <p>
                  Paid {naira(owned.paid)}
                  <br />
                  Garage value {naira(totalValue)}
                  {owned.dents > 0 ? (
                    <>
                      <br />
                      🔧 {owned.dents} {owned.dents === 1 ? 'dent' : 'dents'}
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            {cars.length > 1 ? (
              <div className={styles.chips} role="listbox" aria-label="Your cars">
                {cars.map((car) => (
                  <button key={car.id} type="button" role="option" aria-selected={car.id === owned.id} className={`${styles.chip} ${car.id === owned.id ? styles.chipOn : ''}`} onClick={() => setCarId(car.id)}>
                    <strong>
                      <i style={{ background: car.color }} />
                      {(carById(car.model)?.name ?? 'Car').replace(/^(Toyota|Lexus|Mercedes) /, '')}
                    </strong>
                    <small>{car.active ? 'Driving' : short(car.paid)}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {step === 'paint' ? (
              <div className={styles.swatches} role="listbox" aria-label="Paint colour">
                {PAINTS.map((c) => (
                  <button key={c} type="button" role="option" aria-selected={c === owned.color} aria-label={`Paint ${c}`} disabled={busy} className={c === owned.color ? styles.swatchOn : ''} onClick={() => void run((k) => paintCar(owned.id, c, k))}>
                    <i style={{ background: c }} />
                  </button>
                ))}
              </div>
            ) : step === 'sell' ? (
              <div className={styles.confirm} role="dialog" aria-label="Sell car">
                <p className={styles.note}>
                  Sell your {ownedModel.name} back to the dealer for <b>{naira(carSellBack(owned.paid))}</b> (60%)?
                </p>
                <div className={styles.row}>
                  <button type="button" className={styles.btn} disabled={busy} onClick={() => setStep('idle')}>
                    Keep it
                  </button>
                  <button type="button" className={`${styles.btn} ${styles.danger}`} disabled={busy} onClick={() => void run((k) => sellCar(owned.id, k), () => setCarId(null))}>
                    {busy ? 'Selling…' : 'Sell'}
                  </button>
                </div>
              </div>
            ) : (
              <>
              {owned.dents > 0 ? (
                <button
                  type="button"
                  className={`${styles.btn} ${styles.wide}`}
                  disabled={busy || !atMechanic || cash < dentFixPrice(owned.paid)}
                  onClick={() => void run((k) => fixCar(owned.id, k))}
                >
                  🔧 {atMechanic ? `Fix dents · ${naira(dentFixPrice(owned.paid))}` : `Fix at Magmus Autos · ${naira(dentFixPrice(owned.paid))}`}
                </button>
              ) : null}
              <div className={styles.row3}>
                <button type="button" className={`${styles.btn} ${owned.active ? '' : styles.primary}`} disabled={busy || owned.active} onClick={() => void run((k) => driveCar(owned.id, k))}>
                  {owned.active ? '🔑 Driving' : '🔑 Drive'}
                </button>
                <button type="button" className={styles.btn} onClick={() => setStep('paint')}>
                  🎨 Paint
                </button>
                <button type="button" className={styles.btn} onClick={() => setStep('sell')}>
                  💸 Sell
                </button>
              </div>
              </>
            )}
          </>
        )}
      </div>
    </section>
  )
}
