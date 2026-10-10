export const MAP = {
  land: '#9CB784',
  landLight: '#9CB784',
  water: '#6EC8EE',
  road: '#929A91',
  roadEdge: '#D2D1B7',
  roadMark: '#E8E5D8',
  building: '#F0EEE5',
  buildingGray: '#B9C0C4',
  roof: '#D6C5A0',
  window: '#8BC7D9',
  vegetation: '#45A66A',
  shadow: '#526A58',
  sky: '#D9E6EA',
} as const

export const HOUSE_WALLS = [MAP.building, MAP.buildingGray, '#E5E2D6', '#D8DDE0'] as const
export const HOUSE_ROOFS = [MAP.roof, '#C8B48A', '#E2D3B4'] as const
