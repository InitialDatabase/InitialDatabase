// 頭文字Database Service Worker
//
// キャッシュ戦略：
// ・静的アセット（CSS/JS本体・画像・マニフェストなど、頻繁には変わらないもの）
//   → Cache First（まずキャッシュを返し、裏で最新版を取得してキャッシュを更新＝Stale-While-Revalidate）
// ・動的コンテンツ（HTMLページ・js/data.js・feed.xmlなど、内容が更新されうるもの）
//   → Network First（まずネットワークを試し、失敗したときだけキャッシュを使う）
// ・完全にオフラインでキャッシュも無いページ遷移
//   → offline.html を表示

const CACHE_VERSION = "v6";
const STATIC_CACHE_NAME = `initial-d-database-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `initial-d-database-dynamic-${CACHE_VERSION}`;
const CURRENT_CACHES = [STATIC_CACHE_NAME, DYNAMIC_CACHE_NAME];

// 静的アセット：Cache First（Stale-While-Revalidate）
const STATIC_ASSETS = [
    "css/style.css",
    "js/common.js",
    "js/calendar.js",
    "js/info.js",
    "js/favorites.js",
    "js/archive.js",
    "js/updates.js",
    "manifest.json",
    "images/ogp.png",
    "images/hero-mobile.webp",
    "images/hero-mobile.png",
    "images/icon-192.png",
    "images/icon-512.png",
    "images/icon-maskable-512.png"
];

// 動的コンテンツ：Network First
const DYNAMIC_ASSETS = [
    "./",
    "index.html",
    "pages/favorites.html",
    "pages/archive.html",
    "pages/calendar.html",
    "pages/comments.html",
    "pages/updates.html",
    "js/data.js",
    "js/updates-data.js",
    "feed.xml"
];

const OFFLINE_URL = "offline.html";

self.addEventListener("install", event => {
    event.waitUntil(
        Promise.all([
            caches.open(STATIC_CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS)),
            caches.open(DYNAMIC_CACHE_NAME).then(cache => cache.addAll([...DYNAMIC_ASSETS, OFFLINE_URL]))
        ]).then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => !CURRENT_CACHES.includes(key)).map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// 静的アセット向け：Cache First + 裏での更新（Stale-While-Revalidate）
function handleStaticAsset(request){
    return caches.open(STATIC_CACHE_NAME).then(cache =>
        cache.match(request).then(cachedResponse => {
            const networkFetch = fetch(request)
                .then(networkResponse => {
                    if(networkResponse && networkResponse.ok){
                        cache.put(request, networkResponse.clone());
                    }

                    return networkResponse;
                })
                .catch(() => cachedResponse);

            return cachedResponse || networkFetch;
        })
    );
}

// 動的コンテンツ向け：Network First（失敗時はキャッシュ、それも無ければオフラインページ）
function handleDynamicAsset(request){
    return caches.open(DYNAMIC_CACHE_NAME).then(cache =>
        fetch(request)
            .then(networkResponse => {
                if(networkResponse && networkResponse.ok){
                    cache.put(request, networkResponse.clone());
                }

                return networkResponse;
            })
            .catch(() =>
                cache.match(request).then(cachedResponse => {
                    if(cachedResponse){
                        return cachedResponse;
                    }

                    if(request.mode === "navigate"){
                        return caches.match(OFFLINE_URL);
                    }

                    return Promise.reject(new Error("offline and not cached"));
                })
            )
    );
}

function isStaticAssetRequest(pathname){
    return STATIC_ASSETS.some(assetPath => pathname.endsWith(assetPath));
}

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    // GET以外・外部オリジン（X埋め込みやGAなど）はService Workerを介さない
    if(event.request.method !== "GET" || url.origin !== self.location.origin){
        return;
    }

    // ページ遷移（HTML）は常にNetwork First扱いにする
    if(event.request.mode === "navigate"){
        event.respondWith(handleDynamicAsset(event.request));
        return;
    }

    if(isStaticAssetRequest(url.pathname)){
        event.respondWith(handleStaticAsset(event.request));
        return;
    }

    event.respondWith(handleDynamicAsset(event.request));
});
