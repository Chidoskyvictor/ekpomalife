/**
 * A picture of an item's own 3D model: a Blender render next to the model
 * (public/models/furniture/thumbs/<name>.webp), or, for models in a sub-folder (kenney/, naija/),
 * <folder>/thumbs/<name>.png. The item's emoji when it has none.
 */
export function ItemPic({ item, size }: { item: { emoji: string; model?: string | null }; size: number }) {
  const model = item.model ?? ''
  const sub = /^\/models\/furniture\/([^/]+)\/([^/]+)\.glb(\?.*)?$/.exec(model)
  const top = /^\/models\/furniture\/([^/]+)\.glb(\?.*)?$/.exec(model)
  const thumb = sub ? `/models/furniture/${sub[1]}/thumbs/${sub[2]}.png` : top ? `/models/furniture/thumbs/${top[1]}.webp` : null
  if (!thumb) return <>{item.emoji}</>
  // eslint-disable-next-line @next/next/no-img-element -- tiny static render, no optimisation needed
  return <img src={thumb} alt="" width={size} height={size} draggable={false} style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
}
