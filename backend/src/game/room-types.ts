export type LodgingId = 'hostel-poultry' | 'selfcon-oxford' | 'selfcon-g2' | 'onebed-ojo'

export type Rotation = 0 | 90 | 180 | 270

export type FurnitureCategory =
  | 'sleep'
  | 'cooling'
  | 'light'
  | 'kitchen'
  | 'decor'
  | 'power'
  | 'storage'
  | 'study'

export type ComfortStat = 'sleepQuality' | 'happiness' | 'study' | 'hygiene'

export type FurnitureItem = {
  id: string // e.g. 'standing-fan'
  name: string // 'Standing fan'
  emoji: string
  category: FurnitureCategory
  price: number // whole Naira, integer
  footprint: { w: number; d: number } // grid cells before rotation (1..3)
  model: string // '/models/room/<file>.glb' OR 'primitive:<kind>'
  comfort: Partial<Record<ComfortStat, number>> // small integers 1..8
  minTier: 1 | 2 | 3 | 4 // lodging tier needed
  wallMounted: boolean // posters/curtains: lives on the back wall row (z = 0), ignores floor overlap
  maxPerRoom: number // e.g. 1 for bed, 6 for posters
  replaces?: string // e.g. 'bed-single' replaces 'mattress-floor' in comfort calc
}

export type RoomItem = {
  uid: string // server id of the owned copy, e.g. 'ri_abc123'
  itemId: string // FurnitureItem.id
  placed: boolean // false = in storage (bought, not placed)
  x: number // grid column, 0..grid.w-1 (top-left cell after rotation); 0 when !placed
  z: number // grid row,    0..grid.d-1; 0 when !placed
  rotation: Rotation
}

export type RoomStyle = {
  wallColor: string // one of ROOM_WALL_COLORS hex
  floorId: 'cement' | 'tiles-white' | 'tiles-terracotta' | 'wood-laminate' | 'rug-carpet'
}

export type RoomTier = {
  tier: 1 | 2 | 3 | 4
  lodgingId: LodgingId
  label: string // 'Poultry hostel space'
  grid: { w: number; d: number }
  floorOptions: RoomStyle['floorId'][]
}

export type ComfortBreakdown = {
  sleepQuality: number // 0..30 (capped)
  happiness: number // 0..30
  study: number // 0..20
  hygiene: number // 0..20
  score: number // 0..100 = rounded sum, capped 100
  label: 'Bare' | 'Manageable' | 'Cosy' | 'Big boy/girl room'
  // what actually happens in game:
  sleepEnergyBonusPct: number // = sleepQuality, applied to energy gained by the 'sleep' action
  dailyFunBonus: number // = floor(happiness / 6), added to fun once per game day
}

export type RoomState = {
  ownerUsername: string
  tier: RoomTier
  style: RoomStyle
  items: RoomItem[]
  comfort: ComfortBreakdown
  version: number // bumps on every successful layout/style/buy write
}

export type RoomErrorCode =
  | 'INSUFFICIENT_FUNDS'
  | 'TIER_LOCKED'
  | 'OVERLAP'
  | 'OUT_OF_BOUNDS'
  | 'TOO_MANY'
  | 'UNKNOWN_ITEM'
  | 'NOT_OWNED'
  | 'BAD_ROTATION'
  | 'WALL_ONLY_BACK'
  | 'BAD_COLOR'
  | 'FLOOR_LOCKED'
  | 'VERSION_CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'CANT_SELL_STARTER'
  | 'VISITS_DISABLED'
  | 'SETUP_INCOMPLETE'
