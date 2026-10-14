export const MAP = {
  land: '#9DB884',
  landLight: '#9DB884',
  water: '#56A2C3',
  road: '#808A93',
  roadEdge: '#D2D1B7',
  roadMark: '#FFFFFF',
  building: '#F0EEE5',
  buildingGray: '#B9C0C4',
  roof: '#D6C5A0',
  window: '#8BC7D9',
  vegetation: '#3E7D32',
  shadow: '#526A58',
  sky: '#D9E6EA',
  laterite: '#C2643A',
  slabOutline: '#E9EFE1',
} as const

export const HOUSE_WALLS = [MAP.building, MAP.buildingGray, '#E5E2D6', '#D8DDE0'] as const
export const HOUSE_ROOFS = [MAP.roof, '#C8B48A', '#E2D3B4'] as const
