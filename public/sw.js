/*
 * Ekpoma Life service worker: background notifications only. It caches nothing and never calls
 * skipWaiting/clients.claim, so it can't force a reload (updates are the phone's Refresh card).
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const screen = (event.notification.data && event.notification.data.screen) || null
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const client = all.find((c) => new URL(c.url).origin === self.location.origin)
      if (client) {
        await client.focus()
        client.postMessage({ type: 'ekpoma:notification-open', screen })
        return
      }
      await self.clients.openWindow(screen ? `/?open=${encodeURIComponent(screen)}` : '/')
    })(),
  )
})
