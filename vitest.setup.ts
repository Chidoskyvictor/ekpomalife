import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetFixtures, server } from './vitest.msw'

// Economy client uses in-process mocks when this is set (see lib/api/client.ts).
process.env.NEXT_PUBLIC_USE_MOCKS = 'true'
// Browser path uses same-origin `/api` + MSW. Clear any shell prod URL (e.g. deploy checks).
process.env.NEXT_PUBLIC_API_URL = ''
delete process.env.NEXT_PUBLIC_API_DIRECT_URL
delete process.env.API_PROXY_TARGET

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  resetFixtures()
  server.resetHandlers()
})
afterAll(() => server.close())
