import type { GameActionId } from './places'

/** Tappable furniture in the homes and what you can do with each. Which pieces a home has: room-layouts.ts. */
export type FurnitureId =
  | 'bed'
  | 'red-chair'
  | 'desk-chair'
  | 'sofa'
  | 'toilet'
  | 'bucket'
  | 'cooker'
  // Club spots (used from the club HUD, not tapped)
  | 'dance-floor'
  | 'bar-stool'
  | 'vip-sofa'

/** How the character uses the piece: lie on it, sit on it, crouch for a bucket bath, stand at it, or dance. */
export type UseStyle = 'lie' | 'sit' | 'bath' | 'stand' | 'dance'

export type FurnitureAction = {
  id: GameActionId
  emoji: string
  title: string
  /** In-game time the action takes (mirrors backend ACTIONS durations). */
  minutes: number
  gains: string[]
  style: UseStyle
  /** Real seconds the character stays in the pose. */
  seconds: number
  /** Naira it costs (mirrors backend ACTIONS cost); free when unset. */
  cost?: number
}

export type Furniture = {
  id: FurnitureId
  label: string
  emoji: string
  /** One fun line under the name in the item menu. */
  blurb: string
  actions: FurnitureAction[]
}

export const FURNITURE: Record<FurnitureId, Furniture> = {
  bed: {
    id: 'bed',
    label: 'Bed',
    emoji: '🛏️',
    blurb: 'Foam wey don flat small, but e still dey sweet after lectures.',
    actions: [
      { id: 'sleep', emoji: '😴', title: 'Sleep', minutes: 240, gains: ['Energy'], style: 'lie', seconds: 8 },
      { id: 'nap', emoji: '🥱', title: 'Take a nap', minutes: 60, gains: ['Energy'], style: 'lie', seconds: 5 },
    ],
  },
  'red-chair': {
    id: 'red-chair',
    label: 'Chair',
    emoji: '🪑',
    blurb: 'Plastic chair, strong like Nigerian spirit.',
    actions: [{ id: 'rest', emoji: '🪑', title: 'Sit down', minutes: 15, gains: ['Energy', 'Fun'], style: 'sit', seconds: 6 }],
  },
  'desk-chair': {
    id: 'desk-chair',
    label: 'Desk chair',
    emoji: '🪑',
    blurb: 'Where first class dreams are made (and naps happen).',
    actions: [
      { id: 'rest', emoji: '🪑', title: 'Sit down', minutes: 15, gains: ['Energy', 'Fun'], style: 'sit', seconds: 6 },
      { id: 'study', emoji: '📚', title: 'Study', minutes: 90, gains: ['Study'], style: 'sit', seconds: 7 },
    ],
  },
  sofa: {
    id: 'sofa',
    label: 'Sofa',
    emoji: '🛋️',
    blurb: 'Soft enough to forget you get 8am lecture.',
    actions: [{ id: 'rest', emoji: '🛋️', title: 'Sit down', minutes: 15, gains: ['Energy', 'Fun'], style: 'sit', seconds: 6 }],
  },
  toilet: {
    id: 'toilet',
    label: 'Toilet (WC)',
    emoji: '🚽',
    blurb: 'Fetch water first if NEPA don take light.',
    actions: [{ id: 'toilet', emoji: '🚽', title: 'Use the toilet', minutes: 5, gains: ['Hygiene'], style: 'sit', seconds: 4 }],
  },
  bucket: {
    id: 'bucket',
    label: 'Bucket',
    emoji: '🪣',
    blurb: 'Bucket bath: the original Ekpoma spa.',
    actions: [{ id: 'bucket-bath', emoji: '🛁', title: 'Bucket bath', minutes: 25, gains: ['Hygiene'], style: 'bath', seconds: 6 }],
  },
  'dance-floor': { id: 'dance-floor', label: 'Dance floor', emoji: '💃', blurb: '', actions: [] },
  'bar-stool': { id: 'bar-stool', label: 'Bar', emoji: '🍹', blurb: '', actions: [] },
  'vip-sofa': { id: 'vip-sofa', label: 'VIP lounge', emoji: '🛋️', blurb: '', actions: [] },
  cooker: {
    id: 'cooker',
    label: 'Gas cooker',
    emoji: '🍳',
    blurb: 'Two burners, one works. Mind the gas.',
    actions: [{ id: 'cook', emoji: '🍲', title: 'Cook a pot of rice', minutes: 45, gains: ['Hunger'], style: 'stand', seconds: 7, cost: 400 }],
  },
}

export function gameTimeLabel(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`
}
