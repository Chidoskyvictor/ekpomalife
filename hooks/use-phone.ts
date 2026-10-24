'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  buyData,
  charge,
  getNotifications,
  getPhone,
  openApp,
  setWallpaper,
  type PhoneGetResponse,
  type PhoneNotificationsResponse,
} from '@/lib/game/phone-api'
import type { DataBundleId, PhoneAppId, PhoneState, WallpaperId } from '@/lib/game/phone'
import type { ApiFail } from '@/lib/api/errors'
import { PHONE_FREE_FOR_ALL } from '@/lib/flags'

const POLL_MS = 60_000

export type PhoneCache = {
  /** Avoid property name `phone` on the hook object (webpack/HMR TDZ with `phoneApi.phone`). */
  device: PhoneState | null
  clock: PhoneGetResponse['clock'] | null
  location: PhoneGetResponse['location'] | null
  promos: PhoneGetResponse['promos']
  bundles: PhoneGetResponse['bundles'] | null
  cash: number | null
  notifications: PhoneNotificationsResponse['items']
  totalUnread: number
  missingDevice: boolean
  error: string | null
  loading: boolean
}

function unreadTotal(unread: Partial<Record<PhoneAppId, number>> | undefined) {
  if (!unread) return 0
  return Object.values(unread).reduce((sum, n) => sum + (n ?? 0), 0)
}

const EMPTY: PhoneCache = {
  device: null,
  clock: null,
  location: null,
  promos: [],
  bundles: null,
  cash: null,
  notifications: [],
  totalUnread: 0,
  missingDevice: false,
  error: null,
  loading: true,
}

export type UsePhoneOptions = {
  /** Background refresh while the phone UI is closed (off avoids NO_PHONE noise). */
  poll?: boolean
}

export function usePhone(enabled = true, options?: UsePhoneOptions) {
  const poll = options?.poll ?? false
  const [cache, setCache] = useState<PhoneCache>(EMPTY)
  const mounted = useRef(true)
  const idemRef = useRef<Map<string, string>>(new Map())

  const applyPhone = useCallback((device: PhoneState, extra?: Partial<PhoneCache>) => {
    setCache((prev) => ({
      ...prev,
      device,
      totalUnread: unreadTotal(device.unread),
      missingDevice: false,
      error: null,
      loading: false,
      ...extra,
    }))
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled) return
    // First load after opening: show "Opening phone…" instead of the error screen while we wait
    setCache((prev) => (prev.device || prev.loading ? prev : { ...prev, loading: true, error: null }))
    const [phoneRes, notifRes] = await Promise.all([getPhone(), getNotifications()])
    if (!mounted.current) return

    if (!phoneRes.ok) {
      const fail = phoneRes as ApiFail
      setCache((prev) => ({
        ...prev,
        loading: false,
        missingDevice: !PHONE_FREE_FOR_ALL && (fail.code === 'NO_PHONE' || fail.status === 403),
        error: fail.code === 'NO_PHONE' ? null : fail.error,
        device: fail.code === 'NO_PHONE' && !PHONE_FREE_FOR_ALL ? null : prev.device,
      }))
      return
    }

    const notifs =
      notifRes.ok
        ? notifRes.items
        : ([] as PhoneNotificationsResponse['items'])

    setCache({
      device: phoneRes.phone,
      clock: phoneRes.clock,
      location: phoneRes.location,
      promos: phoneRes.promos,
      bundles: phoneRes.bundles,
      cash: phoneRes.cash,
      notifications: notifs,
      totalUnread: unreadTotal(phoneRes.phone.unread),
      missingDevice: false,
      error: null,
      loading: false,
    })
  }, [enabled])

  useEffect(() => {
    mounted.current = true
    if (!enabled) {
      setCache((prev) => ({ ...prev, loading: false }))
      return
    }
    void refresh()
    if (!poll) {
      return () => {
        mounted.current = false
      }
    }
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      mounted.current = false
      window.clearInterval(id)
    }
  }, [enabled, poll, refresh])

  const open = useCallback(
    async (appId: PhoneAppId) => {
      // Optimistic badge clear
      setCache((prev) => {
        if (!prev.device) return prev
        const unread = { ...prev.device.unread }
        delete unread[appId]
        const next = {
          ...prev.device,
          unread,
          newApps: prev.device.newApps.filter((id) => id !== appId),
        }
        return { ...prev, device: next, totalUnread: unreadTotal(unread) }
      })
      const res = await openApp(appId)
      if (!res.ok) {
        void refresh()
        return res
      }
      applyPhone(res.phone)
      return res
    },
    [applyPhone, refresh],
  )

  const purchaseData = useCallback(
    async (bundleId: DataBundleId) => {
      const keyName = `data:${bundleId}`
      let key = idemRef.current.get(keyName)
      if (!key) {
        key = crypto.randomUUID()
        idemRef.current.set(keyName, key)
      }
      const res = await buyData(bundleId, key)
      if (res.ok) {
        idemRef.current.delete(keyName)
        applyPhone(res.phone, { cash: res.cash })
      }
      return res
    },
    [applyPhone],
  )

  const setWall = useCallback(
    async (wallpaper: WallpaperId) => {
      const res = await setWallpaper(wallpaper)
      if (res.ok) applyPhone(res.phone)
      return res
    },
    [applyPhone],
  )

  const setCharge = useCallback(
    async (action: 'start' | 'stop') => {
      const res = await charge(action)
      if (res.ok) applyPhone(res.phone)
      return res
    },
    [applyPhone],
  )

  const patchLocal = useCallback((partial: Partial<PhoneCache>) => {
    setCache((prev) => ({ ...prev, ...partial }))
  }, [])

  return {
    ...cache,
    refresh,
    open,
    purchaseData,
    setWall,
    setCharge,
    patchLocal,
    applyPhone,
    idemKeyFor: (intent: string) => {
      let key = idemRef.current.get(intent)
      if (!key) {
        key = crypto.randomUUID()
        idemRef.current.set(intent, key)
      }
      return key
    },
    clearIdem: (intent: string) => {
      idemRef.current.delete(intent)
    },
  }
}
