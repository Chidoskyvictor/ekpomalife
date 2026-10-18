/**
 * Optional MSW handlers for Phase 2 economy routes (tests / offline).
 * Browser in-process mocks only when NEXT_PUBLIC_USE_MOCKS=true.
 *
 * Example (Vitest / Storybook):
 *   const handlers = await createEconomyHandlers()
 *   server.use(...handlers)
 */
import * as buildingsMock from './buildings-mock'
import * as mock from './economy-mock'
import { pickQuiz, publicQuiz } from './quiz-bank'

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
      http.post('/inventory/use', async ({ request }) => {
        const body = (await request.json()) as { itemId?: string }
        return json(mock.mockUseItem(body.itemId ?? ''))
      }),
      http.get('/rent', () => json(mock.mockRent())),
      http.post('/rent/pay', () => json(mock.mockPayRent())),
      http.get('/ledger', ({ request }) => {
        const url = new URL(request.url)
        const limit = Number(url.searchParams.get('limit') ?? 20)
        const cursor = url.searchParams.get('cursor') ?? undefined
        return json(mock.mockLedger(limit, cursor))
      }),
      http.get('/game/state', () => json(buildingsMock.mockGetState())),
      http.post('/game/action', async ({ request }) => {
        const body = (await request.json()) as {
          actionId?: string
          targetPlaceId?: string | null
          version?: number
          payload?: {
            amount?: number
            answers?: number[]
            questionIds?: string[]
            bankId?: string
          }
        }
        const actionId = body.actionId ?? ''
        if (actionId === 'quiz-start' || actionId === 'exam-start') {
          const count = actionId === 'exam-start' ? 10 : 4
          const bankId = body.payload?.bankId ?? 'general'
          return json({
            ok: true,
            ...buildingsMock.mockGetState(),
            quiz: {
              bankId,
              mode: actionId === 'exam-start' ? 'exam' : 'quiz',
              questions: publicQuiz(pickQuiz(bankId, count)),
            },
          })
        }
        const result = buildingsMock.mockGameAction({
          actionId,
          targetPlaceId: body.targetPlaceId,
          version: body.version,
          payload: body.payload,
        })
        if (!result.ok) {
          const status =
            result.error === 'INSUFFICIENT_FUNDS' || result.error === 'NO_ENERGY' ? 400 : 400
          return json(result, status)
        }
        return json(result)
      }),
    ]
  } catch {
    return []
  }
}
