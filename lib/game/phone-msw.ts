/**
 * MSW handlers for phone / ride routes (tests / offline).
 */
import * as mock from './phone-mock'
import type { DataBundleId, PhoneAppId, RideMode, WallpaperId } from './phone'

type Handler = unknown

type Http = {
  get: (path: string, resolver: (info: { request: Request; params: Record<string, string> }) => Response | Promise<Response>) => Handler
  post: (path: string, resolver: (info: { request: Request }) => Response | Promise<Response>) => Handler
  patch: (path: string, resolver: (info: { request: Request }) => Response | Promise<Response>) => Handler
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function fromMock(result: { ok: boolean; status?: number } & Record<string, unknown>) {
  if (!result.ok) return json(result, result.status ?? 400)
  return json(result)
}

export async function createPhoneHandlers(): Promise<Handler[]> {
  try {
    const { http } = (await import('msw')) as { http: Http }
    return [
      http.get('/phone', () => fromMock(mock.mockGetPhone())),
      http.post('/phone/data/buy', async ({ request }) => {
        const body = (await request.json()) as { bundleId?: DataBundleId; idempotencyKey?: string }
        return fromMock(
          mock.mockBuyData(body.bundleId ?? 'data-100', body.idempotencyKey ?? crypto.randomUUID()),
        )
      }),
      http.post('/phone/charge', async ({ request }) => {
        const body = (await request.json()) as { action?: 'start' | 'stop' }
        return fromMock(mock.mockCharge(body.action ?? 'start'))
      }),
      http.post('/phone/open', async ({ request }) => {
        const body = (await request.json()) as { appId?: PhoneAppId }
        return fromMock(mock.mockOpenApp(body.appId ?? 'settings'))
      }),
      http.patch('/phone/settings', async ({ request }) => {
        const body = (await request.json()) as { wallpaper?: WallpaperId }
        return fromMock(mock.mockSetWallpaper(body.wallpaper ?? 'aau-dusk'))
      }),
      http.get('/phone/notifications', () => fromMock(mock.mockListNotifications())),
      http.get('/ride/quote', ({ request }) => {
        const url = new URL(request.url)
        return fromMock(mock.mockRideQuote(url.searchParams.get('to') ?? ''))
      }),
      http.post('/ride', async ({ request }) => {
        const body = (await request.json()) as {
          to?: string
          mode?: RideMode
          idempotencyKey?: string
        }
        return fromMock(
          mock.mockTakeRide(body.to ?? '', body.mode ?? 'keke', body.idempotencyKey ?? crypto.randomUUID()),
        )
      }),
    ]
  } catch {
    return []
  }
}
