'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { apiGet, apiPost } from '@/lib/api/client'
import type { ApiFail } from '@/lib/api/errors'
import type { CarModel } from './cars-rules'
import type { ServerGameState } from './game-api'
import { newIdempotencyKey } from './room-api'

export type OwnedCar = { id: string; model: string; color: string; paid: number; active: boolean; dents: number }

type Garage = { catalog: CarModel[]; cars: OwnedCar[]; parkingPrice: number; needsParking: boolean }
type OkGarage = { ok: true } & Garage
type OkWrite = { ok: true; cars: OwnedCar[]; needsParking: boolean; state: ServerGameState; message: string; refunded?: number }
export type CarFail = ApiFail & { reason?: string }

/*
 * Your garage (cars you own, whether you still need a parking space) plus which tab of the car
 * lot sheet is open. One shared store: the sheet, the carport at your house and the lot use it.
 */
let garage: Garage | null = null
let loading = false
let lotTab: 'showroom' | 'garage' | null = null
let lotModel: string | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export async function loadGarage(force = false) {
  if (loading || (garage && !force)) return
  loading = true
  const res = await apiGet<OkGarage>('/cars')
  loading = false
  if (res.ok) {
    garage = { catalog: res.catalog, cars: res.cars, parkingPrice: res.parkingPrice, needsParking: res.needsParking }
    emit()
  }
}

/** Your garage; loads once when `active` (signed-in players only). */
export function useGarage(active: boolean) {
  useEffect(() => {
    if (active) void loadGarage()
  }, [active])
  return useSyncExternalStore(subscribe, () => garage, () => garage)
}

export function useCarLot() {
  return useSyncExternalStore(subscribe, () => lotTab, () => lotTab)
}

/** The showroom car to open on (set by tapping a car on display). */
export function useCarLotModel() {
  return useSyncExternalStore(subscribe, () => lotModel, () => lotModel)
}

export function openCarLot(tab: 'showroom' | 'garage', modelId?: string) {
  lotTab = tab
  if (modelId) lotModel = modelId
  emit()
}

export function closeCarLot() {
  lotTab = null
  lotModel = null
  emit()
}

async function write(path: string, body: Record<string, unknown>, key: string): Promise<OkWrite | CarFail> {
  const res = await apiPost<OkWrite>(path, body, { 'Idempotency-Key': key })
  if (res.ok && garage) {
    garage = { ...garage, cars: res.cars, needsParking: res.needsParking }
    emit()
  }
  return res
}

export { newIdempotencyKey }
/** One key per tap; pass the same key again when retrying so nobody is charged twice. */
export const buyCar = (modelId: string, withParking: boolean, key: string) => write('/cars/buy', { modelId, withParking }, key)
export const buyParking = (key: string) => write('/cars/parking', {}, key)
export const driveCar = (carId: string, key: string) => write('/cars/drive', { carId }, key)
export const paintCar = (carId: string, color: string, key: string) => write('/cars/paint', { carId, color }, key)
export const sellCar = (carId: string, key: string) => write('/cars/sell', { carId }, key)
