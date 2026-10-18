import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetFixtures, server } from './vitest.msw'

// Economy client uses in-process mocks when this is set (see lib/api/client.ts).
process.env.NEXT_PUBLIC_USE_MOCKS = 'true'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  resetFixtures()
  server.resetHandlers()
})
afterAll(() => server.close())
