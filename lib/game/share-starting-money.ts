import { formatNaira } from './live'
import { tierBadge } from './starting-money'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function makeStartingMoneyShareCard(amount: number, tier: string): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the share card.')
  const badge = tierBadge(tier)

  const wash = ctx.createLinearGradient(0, 0, 0, canvas.height)
  wash.addColorStop(0, '#dbeafe')
  wash.addColorStop(1, '#ffffff')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#0f172a'
  ctx.font = '500 36px Inter, system-ui, sans-serif'
  ctx.fillText('Ekpoma Life', 80, 120)

  roundRect(ctx, 80, 280, 920, 720, 48)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.font = '120px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(badge.emoji, 540, 460)

  ctx.fillStyle = '#0f172a'
  ctx.font = '400 56px Boogaloo, Georgia, serif'
  ctx.fillText(badge.name, 540, 560)

  ctx.fillStyle = '#15803d'
  ctx.font = '700 72px Inter, system-ui, sans-serif'
  ctx.fillText(formatNaira(amount), 540, 680)

  ctx.fillStyle = '#3f3f46'
  ctx.font = '400 32px Inter, system-ui, sans-serif'
  ctx.fillText(`I just started Ekpoma Life with ${formatNaira(amount)}`, 540, 780)
  ctx.fillText(`${badge.emoji} ${badge.name} · ekpomalife.app`, 540, 830)

  ctx.textAlign = 'left'
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image.'))), 'image/png')
  })
}

export async function shareStartingMoneyCard(amount: number, tier: string) {
  const badge = tierBadge(tier)
  const blob = await makeStartingMoneyShareCard(amount, tier)
  const file = new File([blob], 'ekpoma-life-start.png', { type: 'image/png' })
  const text = `I just started Ekpoma Life with ${formatNaira(amount)} 💸 ${badge.name}. ekpomalife.app`

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: 'Ekpoma Life', text, files: [file] })
    return
  }
  if (navigator.share) {
    await navigator.share({ title: 'Ekpoma Life', text, url: 'https://ekpomalife.app' })
    return
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}
