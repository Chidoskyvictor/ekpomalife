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

const POLL_MS = 60_000

export type PhoneCache = {
  phone: PhoneState | null
  clock: PhoneGetResponse['clock'] | null
  location: PhoneGetResponse['location'] | null
  promos: PhoneGetResponse['promos']
  bundles: PhoneGetResponse['bundles'] | null
  cash: number | null
  notifications: PhoneNotificationsResponse['items']
  totalUnread: number
  noPhone: boolean
  error: string | null
  loading: boolean
}

function unreadTotal(unread: Partial<Record<PhoneAppId, number>> | undefined) {
  if (!unread) return 0
  return Object.values(unread).reduce((sum, n) => sum + (n ?? 0), 0)
}

const EMPTY: PhoneCache = {
  phone: null,
  clock: null,
  location: null,
  promos: [],
  bundles: null,
  cash: null,
  notifications: [],
  totalUnread: 0,
  noPhone: false,
  error: null,
  loading: true,
}

export function usePhone(enabled = true) {
  const [cache, setCache] = useState<PhoneCache>(EMPTY)
  const mounted = useRef(true)
  const idemRef = useRef<Map<string, string>>(new Map())

  const applyPhone = useCallback((phone: PhoneState, extra?: Partial<PhoneCache>) => {
    setCache((prev) => ({
      ...prev,
      phone,
      totalUnread: unreadTotal(phone.unread),
      noPhone: false,
      error: null,
      loading: false,
      ...extra,
    }))
  }, [])

  const refresh = useCallback(async () => {
    if (!enabled) return
    const [phoneRes, notifRes] = await Promise.all([getPhone(), getNotifications()])
    if (!mounted.current) return

    if (!phoneRes.ok) {
      const fail = phoneRes as ApiFail
      setCache((prev) => ({
        ...prev,
        loading: false,
        noPhone: fail.code === 'NO_PHONE' || fail.status === 403,
        error: fail.code === 'NO_PHONE' ? null : fail.error,
        phone: fail.code === 'NO_PHONE' ? null : prev.phone,
      }))
      return
    }

    const notifs =
      notifRes.ok
        ? notifRes.items
        : ([] as PhoneNotificationsResponse['items'])

    setCache({
      phone: phoneRes.phone,
      clock: phoneRes.clock,
      location: phoneRes.location,
      promos: phoneRes.promos,
      bundles: phoneRes.bundles,
      cash: phoneRes.cash,
      notifications: notifs,
      totalUnread: unreadTotal(phoneRes.phone.unread),
      noPhone: false,
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
    const id = window.setInterval(() => void refresh(), POLL_MS)
    return () => {
      mounted.current = false
      window.clearInterval(id)
    }
  }, [enabled, refresh])

  const open = useCallback(
    async (appId: PhoneAppId) => {
      // Optimistic badge clear
      setCache((prev) => {
        if (!prev.phone) return prev
        const unread = { ...prev.phone.unread }
        delete unread[appId]
        const next = {
          ...prev.phone,
          unread,
          newApps: prev.phone.newApps.filter((id) => id !== appId),
        }
        return { ...prev, phone: next, totalUnread: unreadTotal(unread) }
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
