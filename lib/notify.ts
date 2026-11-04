'use client'

import { useSyncExternalStore } from 'react'

/*
 * Background notifications (Notifications API + /sw.js). Off until the player turns them on in
 * phone Settings (a tap, so the permission prompt only ever follows a user gesture). They only
 * fire while the game is hidden; tapping one focuses the game and opens the right screen.
 */

export type NotifyScreen = 'messages' | 'games'
export const NOTIFICATION_OPEN_EVENT = 'ekpoma:notification-open'
const KEY = 'ekpoma.notifications'
const listeners = new Set<() => void>()

export const notificationsSupported = () =>
  typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator

function stored(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** On = the player switched it on and the browser still allows it. */
export function notificationsOn(): boolean {
  return notificationsSupported() && stored() && Notification.permission === 'granted'
}

export function useNotificationsOn(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    notificationsOn,
    () => false,
  )
}

function registerWorker() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

/** Call from a tap only. Returns why it couldn't turn on, or null. */
export async function setNotifications(on: boolean): Promise<string | null> {
  if (!notificationsSupported()) return "This browser can't show notifications."
  if (on) {
    const permission =
      Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    if (permission !== 'granted') return 'Notifications are blocked. Allow them in your browser settings for this site.'
    await registerWorker()
  }
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l())
  return null
}

/** Show a notification, only while the game is hidden and only if the player turned them on. */
export async function notifyInBackground(title: string, body: string, screen: NotifyScreen, tag: string) {
  if (document.visibilityState !== 'hidden' || !notificationsOn()) return
  try {
    const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await registerWorker())
    await reg.showNotification(title, { body, tag, icon: '/apple-icon.png', data: { screen } })
  } catch {
    /* no worker yet: skip this one */
  }
}

/** Re-register the worker on load when notifications are on. */
export function ensureWorker() {
  if (notificationsOn()) void registerWorker().catch(() => {})
}
