'use client'

import { useState } from 'react'

/**
 * The studio picture of an item's own 3D model (made by scripts/thumbs/render-thumbs.mjs: 3/4 view,
 * soft light and shadow, see-through background) at public/models/furniture/thumbs/<path with / → __>.webp,
 * e.g. kenney/bedSingle.glb → thumbs/kenney__bedSingle.webp. The item's emoji when it has none or the
 * picture fails to load. `fill`: as big as its box.
 */
export function ItemPic({ item, size, fill }: { item: { emoji: string; model?: string | null }; size: number; fill?: boolean }) {
  const [failed, setFailed] = useState(false)
  const model = item.model ?? ''
  const thumb = model.startsWith('/models/furniture/')
    ? `/models/furniture/thumbs/${model.slice('/models/furniture/'.length).replace(/\.glb(\?.*)?$/, '').replace(/\//g, '__')}.webp`
    : null
  if (!thumb || failed) return <>{item.emoji}</>
  const px = fill ? '100%' : size
  // eslint-disable-next-line @next/next/no-img-element -- tiny static render, no optimisation needed
  return <img src={thumb} alt="" width={size} height={size} draggable={false} loading="lazy" onError={() => setFailed(true)} style={{ width: px, height: px, objectFit: 'contain', display: 'block' }} />
}
