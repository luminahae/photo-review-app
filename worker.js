/* 찰칵리뷰 - Gemini 중계 서버 (Cloudflare Worker, 무료) (author: HAE)
 * 1. dash.cloudflare.com 가입 → Workers & Pages → Create → "Hello World" Worker 만들기
 * 2. Edit code 에 이 파일 내용 전체 붙여넣기 → Deploy
 * 3. Worker의 Settings → Variables and Secrets → Add
 *      이름: GEMINI_KEY  / 값: AIza... (Secret 으로)
 * 4. 나온 주소(https://xxx.workers.dev)를 config.js 의 PROXY_URL 에 넣기
 */
const ALLOWED_ORIGINS = ["https://luminahae.github.io", "http://localhost", "http://127.0.0.1", "null"];
const ALLOWED_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview", "gemini-2.5-pro"];

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const okOrigin = ALLOWED_ORIGINS.some(o => origin === o || origin.startsWith(o + ":"));
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST" || !okOrigin) return new Response("forbidden", { status: 403, headers: cors });

    const model = new URL(request.url).searchParams.get("model") || "gemini-2.5-flash";
    if (!ALLOWED_MODELS.includes(model)) return new Response("bad model", { status: 400, headers: cors });

    const body = await request.text();
    if (body.length > 8_000_000) return new Response("too large", { status: 413, headers: cors });

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_KEY },
      body
    });
    return new Response(res.body, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
  }
};
