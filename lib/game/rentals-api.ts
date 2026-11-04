import { apiGet, apiPost } from '@/lib/api/client'

/** A place for rent in the phone's Houses app (backend/src/game/rentals.ts). */
export type Rental = {
  id: string
  name: string
  address: string
  about: string
  moveIn: number
  rentWeekly: number
  kitchen: boolean
  /** Can hold furniture (the hostel bunk can't) */
  decorate: boolean
  current: boolean
}

export const fetchRentals = () =>
  apiGet<{ ok: true; current: string; owesRent: boolean; nextMoveAt: string | null; houses: Rental[] }>('/rentals')

export const moveToRental = (lodgingId: string) =>
  apiPost<{ ok: true; lodgingId: string; message: string }>('/rentals/move', { lodgingId })
