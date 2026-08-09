// 頭文字Database Service Worker
// 主要な静的ファイルをキャッシュし、オフラインでも閲覧できるようにする

const CACHE_NAME = "initial-d-database-v2";

const CORE_ASSETS = [
    "./",
    "index.html",
    "pages/favorites.html",
    "pages/archive.html",
    "css/style.css",
    "js/data.js",
    "js/common.js",
    "js/calendar.js",
    "js/info.js",
    "js/favorites.js",
    "js/archive.js",
    "manifest.json",
    "images/ogp.png",
    "images/hero-mobile.png",
    "images/info-badge.png",
    "images/icon-192.png",
    "images/icon-512.png"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(CORE_ASSETS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    // GET以外・外部オリジン（X埋め込みやGAなど）はService Workerを介さない
    if(event.request.method !== "GET" || url.origin !== self.location.origin){
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const networkFetch = fetch(event.request)
                .then(networkResponse => {
                    if(networkResponse && networkResponse.ok){
                        const responseClone = networkResponse.clone();

                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                    }

                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || networkFetch;
        })
    );
});
