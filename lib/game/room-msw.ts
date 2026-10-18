/**
 * MSW handlers for My Room routes (tests / offline).
 */
import * as mock from './room-mock'

type Handler = unknown

type Http = {
  get: (path: string, resolver: (info: { request: Request; params: Record<string, string> }) => Response | Promise<Response>) => Handler
  post: (path: string, resolver: (info: { request: Request }) => Response | Promise<Response>) => Handler
  put: (path: string, resolver: (info: { request: Request }) => Response | Promise<Response>) => Handler
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function idemKey(request: Request) {
  return request.headers.get('Idempotency-Key') ?? undefined
}

export async function createRoomHandlers(): Promise<Handler[]> {
  try {
    const { http } = (await import('msw')) as { http: Http }
    return [
      http.get('/room', () => json(mock.mockGetRoom())),
      http.get('/room/:username', ({ params }) => {
        const result = mock.mockVisitRoom(params.username)
        if (!result.ok) return json(result, result.status)
        return json(result)
      }),
      http.post('/room/buy', async ({ request }) => {
        const body = (await request.json()) as { itemId?: string; qty?: number }
        const result = mock.mockBuyRoomItem(body.itemId ?? '', body.qty ?? 1, idemKey(request))
        return json(result.body, result.status)
      }),
      http.put('/room/layout', async ({ request }) => {
        const body = (await request.json()) as {
          version?: number
          items?: { uid: string; placed: boolean; x: number; z: number; rotation: 0 | 90 | 180 | 270 }[]
        }
        const result = mock.mockSaveLayout(body.version ?? 0, body.items ?? [], idemKey(request))
        return json(result.body, result.status)
      }),
      http.put('/room/style', async ({ request }) => {
        const body = (await request.json()) as {
          version?: number
          wallColor?: string
          floorId?: 'cement' | 'tiles-white' | 'tiles-terracotta' | 'wood-laminate' | 'rug-carpet'
        }
        const result = mock.mockSaveStyle(
          body.version ?? 0,
          { wallColor: body.wallColor, floorId: body.floorId },
          idemKey(request),
        )
        return json(result.body, result.status)
      }),
      http.post('/room/sell', async ({ request }) => {
        const body = (await request.json()) as { uid?: string }
        const result = mock.mockSellRoomItem(body.uid ?? '', idemKey(request))
        return json(result.body, result.status)
      }),
    ]
  } catch {
    return []
  }
}
