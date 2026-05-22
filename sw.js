const CACHE_NAME = 'vintage-app-v9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// 安装：缓存核心文件
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 请求：网络优先，缓存回退（更适合频繁更新的应用）
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).then(response => {
      // 缓存新响应
      if (response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => {
      // 网络失败，回退到缓存
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        // 离线回退首页
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
