import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AwsClient } from 'aws4fetch'
import { env } from '../env.js'

/* Photo bytes: the same R2 bucket as voice notes (S3 API), or a local folder in development. */

const LOCAL_DIR = path.resolve(process.cwd(), '.photo-dev')
const r2 =
  env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
    ? {
        client: new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' }),
        base: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}`,
      }
    : null

export const photosEnabled = (): boolean => Boolean(r2) || env.NODE_ENV !== 'production'

/** Keys are random and made by us: `photo/<random>.<ext>` or `held/<random>.<ext>`. */
const safeKey = (key: string) => /^(photo|held)\/[A-Za-z0-9_-]{16,}\.(jpg|webp)$/.test(key)

export async function putPhoto(key: string, data: Buffer, contentType: string): Promise<void> {
  if (!safeKey(key)) throw new Error('bad photo key')
  if (r2) {
    const res = await r2.client.fetch(`${r2.base}/${key}`, { method: 'PUT', body: new Uint8Array(data), headers: { 'Content-Type': contentType } })
    if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`)
    return
  }
  const file = path.join(LOCAL_DIR, key)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, data)
}

export async function getPhoto(key: string): Promise<Buffer | null> {
  if (!safeKey(key)) return null
  if (r2) {
    const res = await r2.client.fetch(`${r2.base}/${key}`)
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`R2 download failed: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  try {
    return await readFile(path.join(LOCAL_DIR, key))
  } catch {
    return null
  }
}

/** Delete an object; a missing one is fine. */
export async function deletePhoto(key: string): Promise<void> {
  if (!safeKey(key)) return
  if (r2) {
    const res = await r2.client.fetch(`${r2.base}/${key}`, { method: 'DELETE' })
    if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`)
    return
  }
  await unlink(path.join(LOCAL_DIR, key)).catch(() => {})
}
