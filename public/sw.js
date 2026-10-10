// ChoreZap service worker: Web Push reminders only (no offline caching).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    d = { body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(d.title || 'ChoreZap', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-96.png',
      tag: d.tag || undefined,
      data: { url: d.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          return c.focus().then((f) => (f && 'navigate' in f ? f.navigate(url) : f))
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
