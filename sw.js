'use strict';
// Cache only static app assets, never form contents or browser storage.
const ROOT = new URL('./', self.location.href);
const APP = new URL('index.html', ROOT).href;
const PREFIX = 'hvnb-shell-' + ROOT.pathname + '-';
const RELEASE = 'v9.1.1';
const CACHE = PREFIX + RELEASE;
const ASSETS = ['manifest.webmanifest', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'].map(path => new URL(path, ROOT).href);
const isApp = response => response.ok && response.headers.get('content-type')?.includes('text/html');
const isShell = text => text.includes('<meta name="note-builder-app" content="shell">');
const isRelease = text => text.includes('<meta name="note-builder-version" content="' + RELEASE + '">');

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const response = await fetch(APP, {cache:'reload'});
    if(!isApp(response)) throw Error('App shell unavailable');
    const text = await response.clone().text();
    if(!isShell(text) || !isRelease(text)) throw Error('Matching app release unavailable');
    const cache = await caches.open(CACHE);
    await cache.put(APP, response);
    // Consume each response before opening another uncached asset request.
    for(const url of ASSETS){
      const asset = await fetch(url, {cache:'reload'});
      if(!asset.ok) throw Error('App asset unavailable');
      await cache.put(url, asset);
    }
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
  if(event.request.method === 'GET' && ASSETS.includes(url.href)){
    event.respondWith((async () => (await caches.match(url.href, {cacheName:CACHE})) || fetch(event.request))());
    return;
  }
  if(event.request.method !== 'GET' || event.request.mode !== 'navigate' || url.origin !== ROOT.origin || ![ROOT.pathname, ROOT.pathname + 'index.html'].includes(url.pathname)) return;
  event.respondWith((async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try{
      const response = await fetch(event.request, {signal:controller.signal, cache:'no-store'});
      if(!isApp(response)) throw Error('App unavailable');
      // Body-read failures, including timeouts after headers, need offline fallback.
      const text = await response.clone().text();
      if(!isShell(text)) throw Error('App shell unavailable');
      try{
        if(isRelease(text)) await (await caches.open(CACHE)).put(APP, response.clone());
      }catch(e){ /* Cache quota must not prevent the online app from opening. */ }
      return response;
    }catch(error){
      const saved = await caches.match(APP, {cacheName:CACHE});
      if(saved) return saved;
      return new Response('The app has not been saved for offline use yet. Reconnect and open it once.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}});
    }finally{ clearTimeout(timeout); }
  })());
});
