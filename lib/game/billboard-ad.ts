/** Billboard ads — placeholder art until ad uploads exist. Shared by the 3D boards and the ad viewer. */

/** Fired by a tapped billboard; the HUD's AdViewer listens. `detail` is the billboard zone id. */
export const OPEN_AD_EVENT = 'ekpoma:open-ad'

export function openAd(billboardId: string) {
  window.dispatchEvent(new CustomEvent<string>(OPEN_AD_EVENT, { detail: billboardId }))
}

/** "Your ad here" artwork at the given pixel size (aspect follows the board face). */
export function drawAdPlaceholder(width: number, height: number, { tapHint = true } = {}): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const bg = ctx.createLinearGradient(0, 0, width, height)
  bg.addColorStop(0, '#2f7cf6')
  bg.addColorStop(1, '#6d4ee8')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, width, height)

  // Soft frame
  const inset = Math.round(Math.min(width, height) * 0.05)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)'
  ctx.lineWidth = Math.max(2, inset * 0.25)
  ctx.strokeRect(inset, inset, width - inset * 2, height - inset * 2)

  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const heading = Math.round(height * 0.24)
  ctx.font = `italic 900 ${heading}px "Arial Black", "Segoe UI Black", Arial, sans-serif`
  ctx.fillText('YOUR AD HERE', width / 2, height * 0.42, width * 0.86)

  ctx.font = `700 ${Math.round(height * 0.09)}px "Segoe UI", Arial, sans-serif`
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.fillText('Advertise on Ekpoma Life', width / 2, height * 0.66, width * 0.86)

  if (tapHint) {
    ctx.font = `600 ${Math.round(height * 0.07)}px "Segoe UI", Arial, sans-serif`
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.fillText('Tap to view', width / 2, height * 0.8, width * 0.86)
  }
  return canvas
}
