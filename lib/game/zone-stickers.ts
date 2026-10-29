/** Compact emoji stickers for map place labels — full name shows on hover. */
const BY_ID: Record<string, string> = {
  'admin-block': '🏛️',
  // Second slab
  'market-square': '🧺',
  dubious: '❓',
  'innovation-hub': '💡',
  'magmus-autos': '🔧',
  'above-the-hills-church': '⛪',
  'wise-gourmet': '🍽️',
  'market-hub': '🚧',
  park: '🌳',
  'shop-mid-1': '🏪',
  'shop-mid-2': '🏪',
  forbes: '🪩',
  'spot-rite': '🍔',
  'shop-low-1': '🏪',
  'shop-low-2': '🏪',
  'shop-low-3': '🏪',
  'anonymous-zone': '🕶️',
  denco: '🏢',
  'playchill-climax': '⚽',
  'animal-house-1': '🐄',
  'animal-house-2': '🐐',
  'anatomy-secretariat': '🫀',
  'aau-gate': '🚪',
  bamssa: '🎓',
  bukka: '🍛',
  'cattle-market': '🐂',
  clinic: '🩺',
  'college-of-medicine': '🏥',
  'cordelia-hall': '🏫',
  education: '📚',
  engineering: '⚙️',
  'etf-hall': '🏢',
  'hall-100': '1️⃣',
  'hall-200': '2️⃣',
  'ict-exams': '💻',
  'ict-lab': '🖥️',
  'keke-park': '🛵',
  'law-campus': '⚖️',
  'law-ext': '⚖️',
  'life-science': '🧬',
  'management-science': '📈',
  'mass-comm': '🎤',
  'mls-hall': '🔬',
  'off-campus-hostels': '🛏️',
  'parking-ext': '🅿️',
  'physical-science': '🔭',
  'relaxation-centre': '😌',
  sazza: '🪩',
  'shuttle-park': '🚌',
  'social-science': '🗣️',
  'sports-complex': '⚽',
  'students-centre': '🎒',
  'town-shop-1': '🏪',
  'town-shop-2': '🏪',
  'town-shop-3': '🏡',
  'town-shop-4': '🏪',
  'twin-hall': '🏫',
}

/** Places whose map sticker is a picture instead of an emoji. */
const IMAGE_BY_ID: Record<string, string> = {
  'aau-gate': '/aau-logo.png',
}

export function stickerImageForZone(id: string) {
  return IMAGE_BY_ID[id] ?? null
}

export function stickerForZone(id: string, label: string) {
  return BY_ID[id] ?? (label.trim().charAt(0).toUpperCase() || '📍')
}
