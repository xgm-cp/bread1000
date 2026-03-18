// PWA 설치 조건 충족을 위한 fetch 핸들러
self.addEventListener('fetch', () => {})

self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? '빵천', {
      body: data.body ?? '',
      icon: '/company_logo.png',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/home'))
})
