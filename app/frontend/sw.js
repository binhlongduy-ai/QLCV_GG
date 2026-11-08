/**
 * Service worker của PWA. Mục tiêu: mở ứng dụng nhanh và cài được lên màn hình chính Android/iOS.
 * Nguyên tắc an toàn:
 *  - KHÔNG BAO GIỜ cache dữ liệu nghiệp vụ: request khác nguồn (API Apps Script, Google Sign-In) đi thẳng mạng.
 *  - config.js và trang điều hướng: mạng trước, chỉ dùng bản lưu khi mất mạng (cấu hình mới luôn có hiệu lực).
 *  - Tệp tĩnh cùng nguồn (js, css, biểu tượng): dùng bản lưu ngay, đồng thời tải bản mới cho lần sau.
 * Đổi VERSION khi phát hành để xóa bản lưu cũ.
 */
const VERSION = 'qlcv-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/main.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const networkFirst = async (req) => {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    return (await cache.match(req)) || (req.mode === 'navigate' ? cache.match('index.html') : Promise.reject(err));
  }
};

const staleWhileRevalidate = async (req) => {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  const fresh = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
  return hit || fresh;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;                         // ghi dữ liệu: không can thiệp
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // API, Google Sign-In: đi thẳng mạng
  if (req.mode === 'navigate' || url.pathname.endsWith('/config.js')) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));
});
