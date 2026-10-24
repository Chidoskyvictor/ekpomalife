/** Campus / map color tokens. Not named `MAP` — that identifier collides with global `Map` in some webpack chunks. */
export const mapPalette = {
  land: 'rgb(181, 196, 161)',
  /** First / AAU slab */
  landFirst: 'rgb(157, 183, 131)',
  landLight: 'rgb(181, 196, 161)',
  /** Soft blue ground around the slabs (easy on the eyes — not water) */
  ground: 'rgb(85, 161, 195)',
  road: '#808A93',
  roadEdge: '#D2D1B7',
  roadMark: '#FFFFFF',
  building: '#F7F5EE',
  buildingGray: '#C5CCD0',
  roof: '#E0D0AE',
  window: '#A6D7E6',
  vegetation: '#5A9A4A',
  shadow: '#C5D4B8',
  sky: '#EEF6F8',
  laterite: '#C2643A',
  slabOutline: '#E4EDD8',
  /** Cement pad under Kenney buildings (not bright white) */
  kenneyPad: '#B5B5AC',
  kenneyPadEdge: '#9E9E96',
  /** AAU admin / laterite campus walls */
  earthWall: '#cfae8a',
  earthClay: '#C2643A',
  earthSand: '#d4a574',
  earthDust: '#c4a882',
  earthMud: '#b8956c',
  earthCream: '#e8d5b7',
  earthOchre: '#c49a6c',
} as const

/** @deprecated Use `mapPalette` — `MAP` breaks when webpack rewrites the binding near `Map`. */
export const MAP = mapPalette

/** Campus wall washes — `undefined` keeps the Kenney colormap as-is. */
export const BUILDING_TINT = {
  original: undefined as string | undefined,
  earth: mapPalette.earthWall,
  sand: mapPalette.earthSand,
  clay: mapPalette.earthClay,
  purple: '#8B6BAE',
  plum: '#6B4C8A',
  lilac: '#A890C4',
} as const

/** @deprecated alias — prefer BUILDING_TINT */
export const EARTH_TINTS = [
  BUILDING_TINT.earth,
  BUILDING_TINT.sand,
  BUILDING_TINT.clay,
  mapPalette.earthMud,
  mapPalette.earthCream,
  mapPalette.earthOchre,
] as const

export const HOUSE_WALLS = [mapPalette.building, mapPalette.buildingGray, '#E5E2D6', '#D8DDE0'] as const
export const HOUSE_ROOFS = [mapPalette.roof, '#C8B48A', '#E2D3B4'] as const
