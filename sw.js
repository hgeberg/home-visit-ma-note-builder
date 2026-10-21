'use strict';
// Cache only the static app shell, never form contents or browser storage.
const ROOT = new URL('./', self.location.href);
const APP = new URL('index.html', ROOT).href;
const PREFIX = 'hvnb-shell-' + ROOT.pathname + '-';
const CACHE = PREFIX + 'v8.17';
const isApp = response => response.ok && response.headers.get('content-type')?.includes('text/html');

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(APP, {cache:'reload'});
    if(!isApp(response) || !(await response.clone().text()).includes('<meta name="note-builder-app" content="shell">')) throw Error('App shell unavailable');
    await (await caches.open(CACHE)).put(APP, response);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for(const name of await caches.keys()) if(name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if(event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== ROOT.origin || ![ROOT.pathname, ROOT.pathname + 'index.html'].includes(url.pathname)) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try{
      const response = await fetch(event.request, {signal:controller.signal, cache:'no-store'});
      if(!isApp(response)) throw Error('App unavailable');
      try{
        if((await response.clone().text()).includes('<meta name="note-builder-app" content="shell">')) await (await caches.open(CACHE)).put(APP, response.clone());
      }catch(e){ /* Cache quota must not prevent the online app from opening. */ }
      return response;
    }catch(error){
      const saved = await caches.match(APP, {cacheName:CACHE});
      if(saved) return saved;
      return new Response('The app has not been saved for offline use yet. Reconnect and open it once.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }finally{ clearTimeout(timeout); }
  })());
});
