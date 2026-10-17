'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  applyForJob,
  buyShopItem,
  fetchInventory,
  fetchJobs,
  fetchLedger,
  fetchRent,
  fetchShop,
  friendlyEconomyError,
  payRent,
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
  loading: boolean
  working: boolean
  loadJobs: (placeId?: string | null) => Promise<void>
  loadShop: (placeId: string) => Promise<void>
  loadInventory: () => Promise<void>
  loadRent: () => Promise<void>
  loadLedger: () => Promise<void>
  apply: (jobId: string) => Promise<boolean>
  doShift: () => Promise<{ earned: number; levelUp?: boolean } | null>
  buy: (itemId: string, qty: number) => Promise<{ questComplete?: string } | null>
  pay: () => Promise<boolean>
}

const EconomyContext = createContext<EconomyContextValue | null>(null)

export function EconomyProvider({ children }: { children: ReactNode }) {
  const { applyServerState, notifyToast, refreshServer } = useGame()
  const [jobs, setJobs] = useState<Job[]>([])
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [shopItems, setShopItems] = useState<ShopItem[]>([])
  const [shopPlaceId, setShopPlaceId] = useState<string | null>(null)
  const [inventory, setInventory] = useState<InventoryItem[]>([])
  const [rent, setRent] = useState<RentInfo | null>(null)
  const [ledger, setLedger] = useState<LedgerEntry[]>([])
  const [ledgerCash, setLedgerCash] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [working, setWorking] = useState(false)

  const loadJobs = useCallback(async (placeId?: string | null) => {
    setLoading(true)
    const result = await fetchJobs(placeId)
    setLoading(false)
    if (!result.ok) {
      notifyToast(friendlyEconomyError(result.error), false)
      return
    }
    setJobs(result.jobs)
    setCurrentJobId(result.currentJobId)
  }, [notifyToast])

  const loadShop = useCallback(async (placeId: string) => {
    setLoading(true)
    const result = await fetchShop(placeId)
    setLoading(false)
    if (!result.ok) {
      notifyToast(friendlyEconomyError(result.error), false)
      return
    }
    setShopItems(result.items)
    setShopPlaceId(result.placeId)
  }, [notifyToast])

  const loadInventory = useCallback(async () => {
    const result = await fetchInventory()
    if (!result.ok) {
      notifyToast(friendlyEconomyError(result.error), false)
      return
    }
    setInventory(result.items)
  }, [notifyToast])

  const loadRent = useCallback(async () => {
    const result = await fetchRent()
    if (!result.ok) {
      notifyToast(friendlyEconomyError(result.error), false)
      return
    }
    setRent(result.rent)
  }, [notifyToast])

  const loadLedger = useCallback(async () => {
    const result = await fetchLedger(20)
    if (!result.ok) {
      notifyToast(friendlyEconomyError(result.error), false)
      return
    }
    setLedger(result.entries)
    setLedgerCash(result.cash)
  }, [notifyToast])

  useEffect(() => {
    void loadRent()
    void loadInventory()
  }, [loadRent, loadInventory])

  const apply = useCallback(
    async (jobId: string) => {
      const result = await applyForJob(jobId)
      if (!result.ok) {
        notifyToast(friendlyEconomyError(result.error), false)
        return false
      }
      setCurrentJobId(result.job.id)
      notifyToast(result.message, true)
      void loadJobs()
      return true
    },
    [notifyToast, loadJobs],
  )

  const doShift = useCallback(async () => {
    setWorking(true)
    const result = await workShift()
    setWorking(false)
    if (!result.ok) {
      notifyToast(friendlyEconomyError(result.error), false)
      return null
    }
    applyServerState(result.state)
    notifyToast(result.message, true)
    void loadLedger()
    return { earned: result.earned, levelUp: result.levelUp }
  }, [applyServerState, notifyToast, loadLedger])

  const buy = useCallback(
    async (itemId: string, qty: number) => {
      const result = await buyShopItem(itemId, qty)
      if (!result.ok) {
        notifyToast(friendlyEconomyError(result.error), false)
        return null
      }
      applyServerState(result.state)
      setInventory(result.inventory)
      notifyToast(result.message, true)
      void loadLedger()
      void refreshServer()
      return { questComplete: result.questComplete }
    },
    [applyServerState, notifyToast, loadLedger, refreshServer],
  )

  const pay = useCallback(async () => {
    const result = await payRent()
    if (!result.ok) {
      notifyToast(friendlyEconomyError(result.error), false)
      return false
    }
    applyServerState(result.state)
    setRent(result.rent)
    notifyToast(result.message, true)
    void loadLedger()
    return true
  }, [applyServerState, notifyToast, loadLedger])

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
      loading,
      working,
      loadJobs,
      loadShop,
      loadInventory,
      loadRent,
      loadLedger,
      apply,
      doShift,
      buy,
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
      loading,
      working,
      loadJobs,
      loadShop,
      loadInventory,
      loadRent,
      loadLedger,
      apply,
      doShift,
      buy,
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
