/** Third-party asset credits (CC and similar). Keep in sync with models in /public. */
export type AssetCredit = {
  title: string
  author: string
  license: string
  via?: string
  file: string
}

export const ASSET_CREDITS: AssetCredit[] = [
  {
    title: 'Kenney Furniture Kit',
    author: 'Kenney',
    license: 'CC0',
    via: 'kenney.nl',
    file: 'public/models/room/ (TODO: meshopt GLBs; primitives used until download)',
  },
  {
    title: 'Parking Lot',
    author: 'Alex Safayan',
    license: 'CC-BY',
    via: 'Poly Pizza',
    file: 'parkinglot.glb',
  },
  {
    title: 'Football stadium',
    author: 'Poly by Google',
    license: 'CC-BY',
    via: 'Poly Pizza',
    file: 'football-stadium.glb',
  },
]

export function formatCredit(c: AssetCredit) {
  const via = c.via ? ` via ${c.via}` : ''
  return `${c.title} by ${c.author} [${c.license}]${via}`
}
