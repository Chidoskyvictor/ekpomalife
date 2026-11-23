'use client'

import { useState } from 'react'
import { RadioButton, RadioPill } from './radio-pill'
import styles from './radio-pill.module.css'

/**
 * Inside a building or your house: a round radio button above the tab bar; tap it and the radio
 * pill opens at the bottom middle. Everyone tunes their own radio (nothing is shared in the room).
 */
export function RadioDock() {
  const [open, setOpen] = useState(false)
  // Clear of the tab bar (about 76px) and the phone's home bar
  const lift = 'calc(88px + env(safe-area-inset-bottom))'
  return (
    <>
      {open ? null : (
        <div className={styles.dock} style={{ bottom: lift }}>
          <RadioButton open={false} onClick={() => setOpen(true)} />
        </div>
      )}
      {open ? <RadioPill source="building" bottom={lift} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
