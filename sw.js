// Офлайн-режим и обновления «Фотофиксации».
// BUILD подставляет deploy.sh при каждой публикации — от этого sw.js меняется, браузер видит новую версию,
// скачивает её в фоне, а приложение перезапускается само. Снимки (IndexedDB) при этом не трогаются.
const BUILD = '20261007-155536';
const CACHE = 'fotofix-' + BUILD;
const CORE = ['./', './index.html', './config.json', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    // cache: 'reload' — мимо HTTP-кэша, иначе GitHub Pages может отдать старую страницу (кэш 10 минут)
    const res = await Promise.all(CORE.map(u => fetch(new Request(u, { cache: 'reload' }))));
    if (res.some(r => !r.ok)) throw new Error('не все файлы загрузились — повторим позже');
    const html = await res[CORE.indexOf('./index.html')].clone().text();
    if (!html.includes(`const BUILD = '${BUILD}'`)) throw new Error('сервер ещё отдаёт прежнюю страницу — повторим позже');
    const c = await caches.open(CACHE);
    await Promise.all(res.map((r, i) => c.put(CORE[i], r)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;   // HEAD-запрос сверки времени сюда не попадает и идёт прямо на сервер
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    // страница — из кэша своей версии (работает без сети)
    e.respondWith(caches.open(CACHE).then(c => c.match('./index.html')).then(hit => hit || fetch(req).catch(() =>
      new Response('Нет сети и приложение ещё не сохранено на телефоне. Откройте ссылку при подключении к интернету.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
    return;
  }

  if (url.pathname.endsWith('/config.json')) {
    // список подрядчиков: сначала сеть (чтобы отключённый код переставал работать), без сети — кэш
    e.respondWith(fetch(req, { cache: 'no-cache' })
      .then(r => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put('./config.json', copy)); } return r; })
      .catch(() => caches.open(CACHE).then(c => c.match('./config.json'))));
    return;
  }

  e.respondWith(caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true })).then(hit => hit || fetch(req)));
});
