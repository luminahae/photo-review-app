/* 찰칵리뷰 - 오프라인용 서비스 워커 (author: HAE)
 * 앱 화면 파일을 폰에 저장해 두어서, 인터넷이 없어도 앱이 열리게 함.
 * 파일을 고쳐서 다시 올릴 때는 아래 VERSION 숫자를 하나 올려 주면 새 버전으로 바뀜.
 */
const VERSION = "chalkak-2026-11-03-v1";
const SHELL = [
  "./", "./index.html", "./style.css", "./app.js", "./platforms.js", "./config.js", "./manifest.json",
  "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                     // AI 요청(POST)은 건드리지 않음
  const url = new URL(req.url);
  const isFont = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (url.origin !== location.origin && !isFont) return;

  // 저장된 걸 먼저 보여주고, 인터넷 되면 뒤에서 새 파일로 갱신
  e.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const fresh = fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      if (cached) { e.waitUntil(fresh); return cached; }
      const res = await fresh;
      if (res) return res;
      if (req.mode === "navigate") return cache.match("./index.html");
      return new Response("", { status: 504 });
    })
  );
});
