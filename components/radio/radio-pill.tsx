'use client'

import { Loader2, Pause, Play, Radio, SkipBack, SkipForward, X } from 'lucide-react'
import { useEffect } from 'react'
import { hapticTap } from '@/components/hud/haptic'
import { lastStationId, loadStations, playStation, stepStation, stopRadio, useRadio, type RadioSource, type RadioStation } from '@/lib/game/radio'
import styles from './radio-pill.module.css'

/** What "play" starts when nothing is tuned: the last station on this device, else Esan Binoculars (Edo, our home
 * station), else Cool FM (Lagos), else the first. */
function firstStation(list: RadioStation[]): RadioStation | null {
  const last = lastStationId()
  return (
    list.find((s) => s.id === last) ??
    list.find((s) => /esan\s*binoculars/i.test(s.name)) ??
    list.find((s) => /cool\s*fm/i.test(s.name) && /lagos/i.test(s.city ?? '')) ??
    list.find((s) => /cool\s*fm/i.test(s.name)) ??
    list[0] ??
    null
  )
}

/** The round radio button for a tool column or dock. Glows while a station is playing. */
export function RadioButton({ onClick, open, className }: { onClick: () => void; open: boolean; className?: string }) {
  const radio = useRadio()
  return (
    <button
      type="button"
      className={className ?? styles.button}
      data-on={radio.playing}
      aria-label={open ? 'Close the radio' : 'Open the radio'}
      aria-pressed={open}
      onClick={() => {
        hapticTap()
        onClick()
      }}
    >
      <Radio size={18} aria-hidden="true" />
    </button>
  )
}

/**
 * The radio: one small solid pill with the station's logo and name, back / play / next and close.
 * It never starts by itself; Play tunes the last station (first time ever: Cool FM). Closing the pill
 * leaves the station playing. `bottom` is how far above the screen's bottom edge it sits, so each
 * screen can keep it clear of its own controls.
 */
export function RadioPill({ source, onClose, bottom = 12 }: { source: RadioSource; onClose: () => void; bottom?: number | string }) {
  const radio = useRadio()
  const { stations, current, playing, buffering, error, loaded } = radio

  useEffect(() => {
    void loadStations()
  }, [])

  const base = current ?? firstStation(stations)
  const noList = loaded && stations.length === 0
  const status = noList
    ? 'Radio is unavailable'
    : error
      ? error.startsWith('Tap play')
        ? 'Tap play to start'
        : 'Off air, try another'
      : buffering
        ? 'Tuning in…'
        : playing
          ? [current?.frequency, current?.city].filter(Boolean).join(' · ') || 'On air'
          : current
            ? 'Paused'
            : 'Tap play'

  const step = (dir: 1 | -1) => {
    hapticTap()
    if (current) return stepStation(dir, source)
    if (!base) return
    const i = stations.findIndex((s) => s.id === base.id)
    void playStation(stations[(i + dir + stations.length) % stations.length]!, source)
  }
  const toggle = () => {
    hapticTap()
    if (playing || buffering) stopRadio()
    else if (base) void playStation(base, source)
  }

  return (
    <div className={styles.pill} style={{ bottom }} role="group" aria-label="Radio">
      <span className={styles.logo} aria-hidden="true">
        {base?.logo ? <img src={base.logo} alt="" width={30} height={30} loading="lazy" /> : <Radio size={16} />}
      </span>
      <div className={styles.text} aria-live="polite">
        <strong>{base ? base.name : loaded ? 'Radio' : 'Loading…'}</strong>
        <small className={error || noList ? styles.warn : playing ? styles.air : ''}>{status}</small>
      </div>
      <button type="button" className={styles.step} aria-label="Previous station" disabled={!stations.length} onClick={() => step(-1)}>
        <SkipBack size={14} aria-hidden="true" />
      </button>
      <button type="button" className={styles.play} aria-label={playing || buffering ? 'Stop the radio' : 'Play the radio'} disabled={!base} onClick={toggle}>
        {buffering ? <Loader2 size={17} className={styles.spin} aria-hidden="true" /> : playing ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
      </button>
      <button type="button" className={styles.step} aria-label="Next station" disabled={!stations.length} onClick={() => step(1)}>
        <SkipForward size={14} aria-hidden="true" />
      </button>
      <button type="button" className={styles.close} aria-label="Close the radio" onClick={onClose}>
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
