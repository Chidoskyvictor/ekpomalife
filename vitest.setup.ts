import { afterAll, afterEach, beforeAll } from 'vitest'
import { resetFixtures, server } from './vitest.msw'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  resetFixtures()
  server.resetHandlers()
})
afterAll(() => server.close())
