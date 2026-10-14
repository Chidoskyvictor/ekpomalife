import type { Dream } from './dreams'

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export async function makeDreamShareCard(name: string, dream: Dream): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the share card.')

  const wash = ctx.createLinearGradient(0, 0, 0, canvas.height)
  wash.addColorStop(0, '#dbeafe')
  wash.addColorStop(1, '#ffffff')
  ctx.fillStyle = wash
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  ctx.fillStyle = '#0f172a'
  ctx.font = '500 36px Inter, system-ui, sans-serif'
  ctx.fillText('Ekpoma Life', 80, 120)

  roundRect(ctx, 80, 280, 920, 720, 48)
  ctx.fillStyle = '#f4f4f5'
  ctx.fill()

  ctx.font = '120px system-ui, Apple Color Emoji, Segoe UI Emoji, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(dream.emoji, 540, 480)

  ctx.fillStyle = '#0f172a'
  ctx.font = '400 64px Boogaloo, Georgia, serif'
  ctx.fillText(dream.title, 540, 620)

  ctx.fillStyle = '#3f3f46'
  ctx.font = '400 36px Inter, system-ui, sans-serif'
  const line = `I became ${dream.title} in Ekpoma Life.`
  ctx.fillText(line, 540, 700)
  ctx.fillText(`${name} · ekpomalife.app`, 540, 760)

  ctx.textAlign = 'left'
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the image.'))), 'image/png')
  })
}

export async function shareDreamCard(name: string, dream: Dream) {
  const blob = await makeDreamShareCard(name, dream)
  const file = new File([blob], 'ekpoma-life-dream.png', { type: 'image/png' })
  const text = `I became ${dream.title} in Ekpoma Life. ekpomalife.app`

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: 'Ekpoma Life', text, files: [file] })
    return
  }
  if (navigator.share) {
    await navigator.share({ title: 'Ekpoma Life', text })
    return
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}
