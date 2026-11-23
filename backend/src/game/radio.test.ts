import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearRadioCache, getStations, normaliseStations } from './radio.js'

describe('normaliseStations', () => {
  it('reads common shapes and field names, drops non-https and duplicates', () => {
    const out = normaliseStations({
      data: [
        { id: 1, name: 'Cool FM', stream_url: 'https://s.example/cool', logo: 'https://l/c.png', city: 'Lagos', frequency: '96.9' },
        { id: 1, name: 'Cool FM again', stream_url: 'https://s.example/cool2' },
        { slug: 'wazobia', title: 'Wazobia FM', url: 'https://s.example/waz' },
        { id: 3, name: 'Plain http', url: 'http://s.example/x' },
        { id: 4, url: 'https://s.example/noname' },
      ],
    })
    expect(out.map((s) => s.id)).toEqual(['1', 'wazobia'])
    expect(out[0]).toMatchObject({ name: 'Cool FM', streamUrl: 'https://s.example/cool', city: 'Lagos', frequency: '96.9' })
    expect(normaliseStations([{ name: 'A', streamUrl: 'https://a' }])).toHaveLength(1)
    expect(normaliseStations(null)).toEqual([])
  })
})

describe('getStations', () => {
  afterEach(() => {
    clearRadioCache()
    vi.unstubAllGlobals()
  })

  it('needs a key', async () => {
    expect(await getStations(undefined)).toMatchObject({ ok: false, code: 503 })
  })

  it('sends the key as a bearer token and caches the list', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes('offset=0')
        ? new Response(JSON.stringify({ data: [{ id: 'a', name: 'A', streamUrl: 'https://a', tags: ['afrobeats', 'talk'] }], pagination: { nextOffset: 100 } }))
        : new Response(JSON.stringify({ data: [{ id: 'b', name: 'B', streamUrl: 'https://b' }], pagination: { nextOffset: null } })),
    )
    vi.stubGlobal('fetch', fetchMock)
    const first = await getStations('k', 1000)
    const second = await getStations('k', 2000)
    expect(first).toMatchObject({ ok: true, stations: [{ id: 'a', genre: 'afrobeats, talk' }, { id: 'b' }] })
    expect(second).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k')
  })

  it('reports an outage when there is no cached list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    expect(await getStations('k')).toMatchObject({ ok: false, code: 502 })
  })
})
