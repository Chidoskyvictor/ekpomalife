'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from './look'

/*
 * Face pictures of players' characters (head and shoulders), drawn once per look by ONE shared
 * hidden 3D canvas (components/look/face-renderer.tsx) and kept as small images: in memory and
 * in localStorage (the 60 most recent). Lists of players (chats, ẹta, profiles) show these <img>s,
 * so a screen of 20 people never opens 20 WebGL canvases (iPhones only allow a few).
 */

const STORE_KEY = 'ekpoma-faces-v1'
const MAX_STORED = 60

const urls = new Map<string, string>()
const queue: { key: string; look: Appearance }[] = []
const listeners = new Set<() => void>()
let version = 0
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

let loaded = false
function loadStored() {
  if (loaded || typeof window === 'undefined') return
  loaded = true
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (raw) for (const [k, v] of JSON.parse(raw) as [string, string][]) urls.set(k, v)
  } catch {
    /* blocked or corrupt: draw again */
  }
}

function saveStored() {
  try {
    const entries = [...urls.entries()].slice(-MAX_STORED)
    window.localStorage.setItem(STORE_KEY, JSON.stringify(entries))
  } catch {
    /* full: keep the most recent half */
    try {
      window.localStorage.setItem(STORE_KEY, JSON.stringify([...urls.entries()].slice(-MAX_STORED / 2)))
    } catch {
      /* give up on storing; memory still has it */
    }
  }
}

/** A stable key for a look (or null when there's no usable look). */
export function faceKey(look: unknown): string | null {
  if (!look || typeof look !== 'object') return null
  return JSON.stringify(normalizeAppearance({ ...DEFAULT_APPEARANCE, ...(look as Partial<Appearance>) }))
}

export function faceUrl(key: string | null): string | null {
  loadStored()
  return key ? (urls.get(key) ?? null) : null
}

function enqueue(key: string) {
  if (urls.has(key) || queue.some((q) => q.key === key)) return
  queue.push({ key, look: JSON.parse(key) as Appearance })
  emit()
}

/** The next face to draw (the renderer takes them one at a time). */
export const nextFace = () => queue[0] ?? null

/** The renderer finished one: store it and move on. */
export function faceDrawn(key: string, url: string | null) {
  const i = queue.findIndex((q) => q.key === key)
  if (i >= 0) queue.splice(i, 1)
  if (url) {
    urls.delete(key)
    urls.set(key, url)
    saveStored()
  }
  emit()
}

export function subscribeFaces(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The face picture for a look, or null while it's being drawn (or when there's no look). */
export function useFace(look: unknown): string | null {
  const key = faceKey(look)
  useEffect(() => {
    if (key && !faceUrl(key)) enqueue(key)
  }, [key])
  useSyncExternalStore(subscribeFaces, () => version, () => 0)
  return faceUrl(key)
}

/** Faces waiting to be drawn (the host only loads the 3D renderer while this is > 0). */
export const pendingFaces = () => queue.length
