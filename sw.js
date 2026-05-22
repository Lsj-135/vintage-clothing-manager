const CACHE_NAME = 'vintage-app-v10';
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
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).catch(err => {
      console.log('缓存安装失败:', err);
    })
  );
  self.skipWaiting();
});

// 激活：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => {
      return self.clients.claim();
    })
  );
});

// 请求处理：网络优先，缓存回退
self.addEventListener('fetch', event => {
  // 只处理 GET 请求
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request).then(response => {
      // 成功获取网络响应，更新缓存
      if (response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, clone);
        }).catch(() => {});
      }
      return response;
    }).catch(() => {
      // 网络失败，回退到缓存
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        // 如果是页面请求，返回首页
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
        return new Response('离线中，请检查网络连接', {
          status: 503,
          headers: { 'Content-Type': 'text/plain;charset=UTF-8' }
        });
      });
    })
  );
});
