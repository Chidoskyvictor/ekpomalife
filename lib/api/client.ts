import { apiUrl } from '@/lib/game/api'
import { asApiErrorCode, type ApiFail } from './errors'

const FETCH_MS = 8000

/** MSW / in-process mocks — tests set this; browser only when opted in. */
export function useMocks(): boolean {
  if (typeof process === 'undefined') return false
  const flag =
    process.env.NEXT_PUBLIC_USE_MOCKS ??
    process.env.NEXT_PUBLIC_USE_ECONOMY_MOCK ??
    ''
  return flag === 'true' || flag === '1'
}

async function raceFetch(path: string, init?: RequestInit): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      fetch(`${apiUrl()}${path}`, {
        ...init,
        credentials: 'include',
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { name: 'TimeoutError' })), FETCH_MS)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function failFromBody(status: number, raw: unknown): ApiFail {
  const body = (typeof raw === 'object' && raw ? raw : {}) as {
    error?: string
    code?: string
    conflict?: boolean
    room?: unknown
    uid?: string
  }
  const error = body.error || (status === 401 ? 'UNAUTHORIZED' : 'Request failed.')
  const code =
    status === 401
      ? 'UNAUTHORIZED'
      : asApiErrorCode(error) ??
        (body.conflict || body.code === 'VERSION_CONFLICT' ? 'VERSION_CONFLICT' : undefined)
  return {
    ok: false,
    error,
    code: code ?? (body.code as ApiFail['code']),
    conflict: Boolean(body.conflict) || code === 'VERSION_CONFLICT' || body.code === 'VERSION_CONFLICT',
    status,
    // room / uid attach for callers that cast to RoomFail
    ...(body.room ? { room: body.room } : {}),
    ...(body.uid ? { uid: body.uid } : {}),
  } as ApiFail
}

/**
 * Shared cookie-aware JSON client for game + economy routes.
 * Browser: same-origin `/api` proxy. Server/tests: API_PROXY_TARGET / NEXT_PUBLIC_API_URL.
 */
export async function apiRequest<T extends { ok: true }>(
  path: string,
  init?: RequestInit,
): Promise<T | ApiFail> {
  try {
    const response = await raceFetch(path, init)
    let raw: unknown = null
    try {
      raw = await response.json()
    } catch {
      if (!response.ok) {
        return failFromBody(response.status, { error: response.status === 401 ? 'UNAUTHORIZED' : 'Request failed.' })
      }
      return { ok: false, error: 'Bad response from server.', status: response.status }
    }

    if (!response.ok || (typeof raw === 'object' && raw && 'ok' in raw && (raw as { ok: unknown }).ok === false)) {
      return failFromBody(response.status, raw)
    }
    return raw as T
  } catch {
    return {
      ok: false,
      error: "Can't reach the server, retrying…",
      network: true,
    }
  }
}

export async function apiGet<T extends { ok: true }>(path: string): Promise<T | ApiFail> {
  return apiRequest<T>(path)
}

export async function apiPost<T extends { ok: true }>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | ApiFail> {
  return apiRequest<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body ?? {}),
  })
}

export async function apiPut<T extends { ok: true }>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | ApiFail> {
  return apiRequest<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body ?? {}),
  })
}

export async function apiPatch<T extends { ok: true }>(
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>,
): Promise<T | ApiFail> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body ?? {}),
  })
}
