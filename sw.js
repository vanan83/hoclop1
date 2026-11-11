// sw.js — cho app mở ngay (lấy từ bộ nhớ đệm) và chạy được khi mất mạng.
// Trả bản đã lưu ngay, đồng thời hỏi máy chủ bản mới (bỏ qua bộ nhớ HTTP 10 phút của GitHub).
// Mỗi lần cập nhật app: đổi CACHE trùng với APP_VERSION trong app.js → máy học sinh tự lên bản mới.
const CACHE = 'hl1-2026.11.11-9';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'manifest.webmanifest', 'icon-v2-192.png', 'icon-v2-512.png', 'apple-touch-icon-v2.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // máy chủ Apps Script, thư viện PDF: không đụng tới
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req, { cache: 'no-cache' }).then((r) => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit || c.match('index.html'));
    if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
