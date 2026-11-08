/**
 * Service Worker cho QLCV CBTD PWA.
 *
 * Chiến lược cache: stale-while-revalidate cho shell, network-first cho API.
 *
 * Lưu ý khi deploy qua Apps Script:
 *   - Service Worker chỉ hoạt động khi user mở web app URL trực tiếp (không qua iframe).
 *   - Google Sites embed qua iframe sẽ vô hiệu hóa SW (security policy).
 *   - Apps Script HTML Service KHÔNG serve file .json/.js trong thư mục script —
 *     nên SW và manifest phải được host ở nơi khác (vd: GitHub Pages, Google Cloud Storage).
 *
 * Workaround cho Apps Script: nếu muốn PWA chạy qua Apps Script, có 2 cách:
 *   1. Inline manifest + register SW từ URL bên ngoài (xem app.js initPWA()).
 *   2. Host SW + manifest trên Google Cloud Storage public bucket.
 *
 * File này là template — copy vào host bên ngoài, sửa CACHE_NAME và PRECACHE_URLS cho phù hợp.
 */

const CACHE_NAME = "qlcv-cbtd-v1";
const PRECACHE_URLS = [
  "/",
  "/exec"
];

// ═══════════════════════════════════════════════════════════════════════════
//  INSTALL — cache shell
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  ACTIVATE — dọn cache cũ
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ═══════════════════════════════════════════════════════════════════════════
//  FETCH — stale-while-revalidate cho HTML, network-first cho API
// ═══════════════════════════════════════════════════════════════════════════

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // API request: luôn qua mạng, không cache.
  if (url.searchParams.has("action") || event.request.method !== "GET") {
    return; // để browser xử lý bình thường
  }

  // HTML / navigation: stale-while-revalidate.
  if (event.request.mode === "navigate" ||
      (event.request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request).then(response => {
          // Chỉ cache response hợp lệ.
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Static assets (CSS, JS, images): cache-first.
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      });
    })
  );
});