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

/** Number plate in the board's top-right corner so every board is easy to find and re-book. */
function drawNumberPlate(ctx: CanvasRenderingContext2D, width: number, height: number, n: number) {
  const size = Math.round(height * 0.16)
  const pad = Math.round(height * 0.04)
  const x = width - pad - size
  const y = pad
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.beginPath()
  ctx.roundRect(x, y, size, size, size * 0.22)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 ${Math.round(size * 0.58)}px "Segoe UI", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(n), x + size / 2, y + size / 2 + size * 0.04)
}

type BoardArt = {
  background: string
  accent: string
  headline: string
  lines: string[]
  contact: string
}

/**
 * Wide billboard version of an ad: the advertiser's artwork on the left (fitted to height),
 * headline, price lines and contact on the right, on the ad's own colours.
 */
export function drawBoardAd(
  width: number,
  height: number,
  art: BoardArt,
  image: (CanvasImageSource & { width: number; height: number }) | null,
  n: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = art.background
  ctx.fillRect(0, 0, width, height)

  let textLeft = width * 0.06
  if (image) {
    const h = height
    const w = Math.min(width * 0.42, (image.width / image.height) * h)
    ctx.drawImage(image, 0, 0, w, h)
    textLeft = w + width * 0.04
  }
  const textWidth = width - textLeft - width * 0.05
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'

  ctx.fillStyle = art.accent
  ctx.font = `900 ${Math.round(height * 0.13)}px "Arial Black", "Segoe UI Black", Arial, sans-serif`
  ctx.fillText(art.headline, textLeft, height * 0.3, textWidth)

  ctx.fillStyle = '#ffffff'
  ctx.font = `700 ${Math.round(height * 0.085)}px "Segoe UI", Arial, sans-serif`
  art.lines.forEach((line, i) => ctx.fillText(line, textLeft, height * (0.46 + i * 0.12), textWidth))

  ctx.fillStyle = art.accent
  ctx.beginPath()
  ctx.roundRect(textLeft, height * 0.8, textWidth, height * 0.13, height * 0.03)
  ctx.fill()
  ctx.fillStyle = art.background
  ctx.font = `800 ${Math.round(height * 0.075)}px "Segoe UI", Arial, sans-serif`
  ctx.fillText(art.contact, textLeft + height * 0.03, height * 0.89, textWidth - height * 0.06)

  drawNumberPlate(ctx, width, height, n)
  return canvas
}

/** Number plate on top of any canvas (used on the placeholder art). */
export function stampBoardNumber(canvas: HTMLCanvasElement, n: number) {
  drawNumberPlate(canvas.getContext('2d')!, canvas.width, canvas.height, n)
  return canvas
}

/** A ready-made wide design, cropped to fill the face (centred), with the board number. */
export function drawBoardImage(
  width: number,
  height: number,
  image: CanvasImageSource & { width: number; height: number },
  n: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  const scale = Math.max(width / image.width, height / image.height)
  const w = image.width * scale
  const h = image.height * scale
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h)
  drawNumberPlate(ctx, width, height, n)
  return canvas
}
