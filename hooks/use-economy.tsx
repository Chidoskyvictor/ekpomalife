'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { handleApiFail } from '@/lib/api/handle-fail'
import {
  applyForJob,
  buyShopItem,
  fetchInventory,
  fetchJobs,
  fetchLedger,
  fetchRent,
  fetchShop,
  payRent,
  useInventoryItem,
  workShift,
  type InventoryItem,
  type Job,
  type LedgerEntry,
  type RentInfo,
  type ShopItem,
} from '@/lib/game/economy-api'
import { useGame } from '@/hooks/use-game'

type EconomyContextValue = {
  jobs: Job[]
  currentJobId: string | null
  shopItems: ShopItem[]
  shopPlaceId: string | null
  inventory: InventoryItem[]
  rent: RentInfo | null
  ledger: LedgerEntry[]
  ledgerCash: number | null
  ledgerNextCursor: string | null
  loading: boolean
  working: boolean
  busy: boolean
  networkDown: boolean
  loadJobs: (placeId?: string | null) => Promise<void>
  loadShop: (placeId: string) => Promise<void>
  loadInventory: () => Promise<void>
  loadRent: () => Promise<void>
  loadLedger: (opts?: { reset?: boolean }) => Promise<void>
  loadMoreLedger: () => Promise<void>
  apply: (jobId: string) => Promise<boolean>
  doShift: () => Promise<{ earned: number; levelUp?: boolean } | null>
  buy: (itemId: string, qty: number) => Promise<{ questComplete?: string } | null>
  useItem: (itemId: string) => Promise<boolean>
  pay: () => Promise<boolean>
}

const EconomyContext = createContext<EconomyContextValue | null>(null)

export function EconomyProvider({ children }: { children: ReactNode }) {
  const { applyServerState, notifyToast, refreshServer, isGuest } = useGame()
  const [jobs, setJobs] = useState<Job[]>([])
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [shopItems, setShopItems] = useState<ShopItem[]>([])
  const [shopPlaceId, setShopPlaceId] = useState<string | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [rent, setRent] = useState<RentInfo | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [ledgerCash, setLedgerCash] = useState<number | null>(null)
  const [ledgerNextCursor, setLedgerNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [networkDown, setNetworkDown] = useState(false)
  const inflight = useRef(0)

  const onFail = useCallback(
    async (fail: Parameters<typeof handleApiFail>[0]) => {
      if (fail.network) setNetworkDown(true)
      await handleApiFail(fail, { toast: notifyToast, refreshServer })
    },
    [notifyToast, refreshServer],
  )

  const withBusy = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    if (inflight.current > 0) return null
    inflight.current += 1
    setBusy(true)
    try {
      return await fn()
    } finally {
      inflight.current = Math.max(0, inflight.current - 1)
      setBusy(inflight.current > 0)
    }
  }, [])

  const loadJobs = useCallback(
    async (placeId?: string | null) => {
      setLoading(true)
      const result = await fetchJobs(placeId)
      setLoading(false)
      if (!result.ok) {
        await onFail(result)
        return
      }
      setNetworkDown(false)
      setJobs(result.jobs)
      setCurrentJobId(result.currentJobId)
    },
    [onFail],
  )

  const loadShop = useCallback(
    async (placeId: string) => {
      setLoading(true)
      const result = await fetchShop(placeId)
      setLoading(false)
      if (!result.ok) {
        await onFail(result)
        return
      }
      setNetworkDown(false)
      setShopItems(result.items)
      setShopPlaceId(result.placeId)
    },
    [onFail],
  )

  const loadInventory = useCallback(async () => {
    const result = await fetchInventory()
    if (!result.ok) {
      await onFail(result)
      return
    }
    setNetworkDown(false)
    setInventory(result.items)
  }, [onFail])

  const loadRent = useCallback(async () => {
    const result = await fetchRent()
    if (!result.ok) {
      await onFail(result)
      return
    }
    setNetworkDown(false)
    setRent(result.rent)
  }, [onFail])

  const loadLedger = useCallback(
    async (opts?: { reset?: boolean }) => {
      setLoading(true)
      const result = await fetchLedger({ limit: 20 })
      setLoading(false)
      if (!result.ok) {
        await onFail(result)
        return
      }
      setNetworkDown(false)
      setLedger(result.entries)
      setLedgerCash(result.cash)
      setLedgerNextCursor(result.nextCursor ?? null)
      if (opts?.reset) {
        /* already reset via replace */
      }
    },
    [onFail],
  )

  const loadMoreLedger = useCallback(async () => {
    if (!ledgerNextCursor || loading) return
    setLoading(true)
    const result = await fetchLedger({ limit: 20, cursor: ledgerNextCursor })
    setLoading(false)
    if (!result.ok) {
      await onFail(result)
      return
    }
    setNetworkDown(false)
    setLedger((prev) => {
      const seen = new Set(prev.map((row) => row.id))
      return [...prev, ...result.entries.filter((row) => !seen.has(row.id))]
    })
    setLedgerCash(result.cash)
    setLedgerNextCursor(result.nextCursor ?? null)
  }, [ledgerNextCursor, loading, onFail])

  useEffect(() => {
    if (isGuest) return
    void loadRent()
    void loadInventory()
  }, [isGuest, loadRent, loadInventory])

  const apply = useCallback(
    async (jobId: string) => {
      const done = await withBusy(async () => {
        const result = await applyForJob(jobId)
        if (!result.ok) {
          await onFail(result)
          return false
        }
        setNetworkDown(false)
        setCurrentJobId(result.job.id)
        notifyToast(result.message, true)
        void loadJobs()
        return true
      })
      return done ?? false
    },
    [withBusy, onFail, notifyToast, loadJobs],
  )

  const doShift = useCallback(async () => {
    setWorking(true)
    const done = await withBusy(async () => {
      const result = await workShift()
      if (!result.ok) {
        await onFail(result)
        return null
      }
      setNetworkDown(false)
      applyServerState(result.state)
      notifyToast(result.message, true)
      void loadLedger()
      return { earned: result.earned, levelUp: result.levelUp }
    })
    setWorking(false)
    return done
  }, [withBusy, onFail, applyServerState, notifyToast, loadLedger])

  const buy = useCallback(
    async (itemId: string, qty: number) => {
      const done = await withBusy(async () => {
        const result = await buyShopItem(itemId, qty)
        if (!result.ok) {
          await onFail(result)
          return null
        }
        setNetworkDown(false)
        applyServerState(result.state)
        setInventory(result.inventory)
        notifyToast(result.message, true)
        void loadLedger()
        void refreshServer()
        return { questComplete: result.questComplete }
      })
      return done
    },
    [withBusy, onFail, applyServerState, notifyToast, loadLedger, refreshServer],
  )

  const useItem = useCallback(
    async (itemId: string) => {
      const done = await withBusy(async () => {
        const result = await useInventoryItem(itemId)
        if (!result.ok) {
          await onFail(result)
          return false
        }
        setNetworkDown(false)
        applyServerState(result.state)
        setInventory(result.inventory)
        notifyToast(result.message, true)
        void loadLedger()
        return true
      })
      return done ?? false
    },
    [withBusy, onFail, applyServerState, notifyToast, loadLedger],
  )

  const pay = useCallback(async () => {
    const done = await withBusy(async () => {
      const result = await payRent()
      if (!result.ok) {
        await onFail(result)
        return false
      }
      setNetworkDown(false)
      applyServerState(result.state)
      setRent(result.rent)
      notifyToast(result.message, true)
      void loadLedger()
      return true
    })
    return done ?? false
  }, [withBusy, onFail, applyServerState, notifyToast, loadLedger])

  const value = useMemo(
    () => ({
      jobs,
      currentJobId,
      shopItems,
      shopPlaceId,
      inventory,
      rent,
      ledger,
      ledgerCash,
      ledgerNextCursor,
      loading,
      working,
      busy,
      networkDown,
      loadJobs,
      loadShop,
      loadInventory,
      loadRent,
      loadLedger,
      loadMoreLedger,
      apply,
      doShift,
      buy,
      useItem,
      pay,
    }),
    [
      jobs,
      currentJobId,
      shopItems,
      shopPlaceId,
      inventory,
      rent,
      ledger,
      ledgerCash,
      ledgerNextCursor,
      loading,
      working,
      busy,
      networkDown,
      loadJobs,
      loadShop,
      loadInventory,
      loadRent,
      loadLedger,
      loadMoreLedger,
      apply,
      doShift,
      buy,
      useItem,
      pay,
    ],
  )

  return <EconomyContext.Provider value={value}>{children}</EconomyContext.Provider>
}

export function useEconomy() {
  const context = useContext(EconomyContext)
  if (!context) throw new Error('useEconomy must be used inside EconomyProvider')
  return context
}
