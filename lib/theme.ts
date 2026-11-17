'use client'

import { useSyncExternalStore } from 'react'

export type ThemePref = 'light' | 'dark' | 'auto'
const KEY = 'ekpoma-theme'
const listeners = new Set<() => void>()

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'auto') return v
  } catch {
    /* storage blocked */
  }
  return 'light'
}

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'auto') return pref
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyTheme(pref: ThemePref): void {
  const theme = resolveTheme(pref)
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#1c1c1e' : '#ffffff')
}

export function setThemePref(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref)
  } catch {
    /* storage blocked */
  }
  applyTheme(pref)
  listeners.forEach((l) => l())
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  let mq: MediaQueryList | null = null
  const onChange = () => {
    if (readThemePref() === 'auto') applyTheme('auto')
  }
  try {
    mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', onChange)
  } catch {
    /* no matchMedia */
  }
  return () => {
    listeners.delete(cb)
    mq?.removeEventListener('change', onChange)
  }
}

export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, readThemePref, () => 'light' as ThemePref)
}

/** Inline <head> script: sets data-theme before first paint. Keep in sync with the functions above. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem('${KEY}');var t=p==='dark'?'dark':p==='auto'&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#1c1c1e':'#ffffff')}catch(e){}})()`
