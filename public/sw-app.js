// Service worker do app DLG PHOTOS (PWA / APK):
// o Android exige para instalar o app; quando cai a internet, mostra a tela "Sem internet" em vez de erro.
// Os dados continuam vindo direto da internet — nada fica guardado no celular.
const CACHE = 'dlg-app-v1'
const SEM_INTERNET = '/offline-app.html'

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([SEM_INTERNET, '/icones/app-192.png']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return // dados e arquivos: sempre da internet
  e.respondWith(fetch(e.request).catch(() => caches.match(SEM_INTERNET)))
})
