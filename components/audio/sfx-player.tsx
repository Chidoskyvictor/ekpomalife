'use client'

import { useEffect } from 'react'
import { playSfx, preloadSfx, SFX, type SfxName } from '@/lib/audio/sfx'

const TAPPABLE = 'button, a[href], [role="button"], [role="tab"], [role="switch"], [role="menuitem"], [role="option"], label[for], input[type="checkbox"], input[type="radio"], summary'
const BACK = /^(✕|×|x|back|close|cancel|dismiss|not now|no thanks|skip|exit|leave)$/i
const BACK_LABEL = /\b(close|back|dismiss|cancel|exit|leave)\b/i

/** Which sound a tapped control makes. `data-sfx="off"` silences it, `data-sfx="<name>"` picks one. */
function soundFor(el: Element): SfxName | null {
  const tagged = el.closest('[data-sfx]')?.getAttribute('data-sfx')
  if (tagged === 'off') return null
  if (tagged && tagged in SFX) return tagged as SfxName
  if ((el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return null
  const role = el.getAttribute('role')
  if (role === 'switch' || (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio'))) return 'toggle'
  const text = (el.textContent ?? '').trim()
  if (BACK.test(text) || BACK_LABEL.test(el.getAttribute('aria-label') ?? '')) return 'back'
  return 'tap'
}

/**
 * Mounted once in the root layout: every button, link, tab and switch in the app gets a tap sound
 * without each screen wiring it. Specific moments (success, coins, cards…) call playSfx() themselves.
 */
export function SfxPlayer() {
  useEffect(() => {
    let preloaded = false
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return
      if (!preloaded) {
        preloaded = true
        preloadSfx()
      }
      const control = event.target.closest(TAPPABLE)
      if (!control) return
      const name = soundFor(control)
      if (name) playSfx(name)
    }
    // Capture: runs even when a handler stops the click from bubbling
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])
  return null
}
