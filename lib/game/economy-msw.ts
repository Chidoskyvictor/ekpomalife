/**
 * Optional MSW handlers for Phase 2 economy routes.
 * Enable with mock worker in tests/storybook, or set NEXT_PUBLIC_USE_ECONOMY_MOCK=1
 * to force the in-browser mock in `economy-api.ts` (no MSW required).
 *
 * Example (Vitest / Storybook):
 *   import { economyHandlers } from '@/lib/game/economy-msw'
 *   worker.use(...economyHandlers)
 */
import * as mock from './economy-mock'

type Handler = unknown

type Http = {
  get: (path: string, resolver: (info: { request: Request }) => Response | Promise<Response>) => Handler
  post: (path: string, resolver: (info: { request: Request }) => Response | Promise<Response>) => Handler
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Build handlers when `msw` is installed. Returns [] if msw is missing. */
export async function createEconomyHandlers(): Promise<Handler[]> {
  try {
    const { http } = (await import('msw')) as { http: Http }
    return [
      http.get('/jobs', ({ request }) => {
        const placeId = new URL(request.url).searchParams.get('placeId')
        return json(mock.mockJobs(placeId))
      }),
      http.post('/jobs/apply', async ({ request }) => {
        const body = (await request.json()) as { jobId?: string }
        return json(mock.mockApply(body.jobId ?? ''))
      }),
      http.post('/jobs/shift', () => json(mock.mockShift())),
      http.get('/shop', ({ request }) => {
        const placeId = new URL(request.url).searchParams.get('placeId') ?? 'town-shop-1'
        return json(mock.mockShop(placeId))
      }),
      http.post('/shop/buy', async ({ request }) => {
        const body = (await request.json()) as { itemId?: string; qty?: number }
        return json(mock.mockBuy(body.itemId ?? '', body.qty ?? 1))
      }),
      http.get('/inventory', () => json(mock.mockInventory())),
      http.get('/rent', () => json(mock.mockRent())),
      http.post('/rent/pay', () => json(mock.mockPayRent())),
      http.get('/ledger', ({ request }) => {
        const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20)
        return json(mock.mockLedger(limit))
      }),
    ]
  } catch {
    return []
  }
}
