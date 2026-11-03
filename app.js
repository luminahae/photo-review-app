/* 찰칵리뷰 - 메인 로직 (author: HAE)
 * 사진 + 선택한 플랫폼 + 내 느낌 → Gemini가 글자수에 맞춘 리뷰 작성
 */
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const MAX_PHOTOS = 5;
  const FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-3-flash-preview"];

  // ---------- 저장소 (실패해도 앱은 동작) ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} }
  };

  // ---------- 상태 ----------
  const state = {
    photos: [],                                   // {url, b64, mime}
    platformId: store.get("ck_platform", "coupangeats"),
    target: 0,
    rating: 5,
    tone: "친근",
    closing: "yes",
    lastResult: "",
    versions: [],                                 // 되돌리기용 이전 버전들
    busy: false
  };

  const getLimits = () => store.get("ck_limits", {});
  function platformOf(id) {
    const base = PLATFORMS.find(p => p.id === id) || PLATFORMS[0];
    const o = getLimits()[base.id] || {};
    const min = Number(o.min) > 0 ? Number(o.min) : base.min;
    const max = Number(o.max) > min ? Number(o.max) : base.max;
    const target = Math.min(Math.max(base.target, min), max);
    return { ...base, min, max, target };
  }
  const curPlatform = () => platformOf(state.platformId);

  // 글자수: 이모지 1개도 1자로 셈 (공백 포함)
  const countChars = (s) => [...s].length;
  const countNoSpace = (s) => [...s.replace(/\s/g, "")].length;

  // ---------- 토스트 ----------
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- 사진 ----------
  function resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const MAX = 1024;
          let { width: w, height: h } = img;
          const scale = Math.min(1, MAX / Math.max(w, h));
          w = Math.round(w * scale); h = Math.round(h * scale);
          const c = document.createElement("canvas");
          c.width = w; c.height = h;
          c.getContext("2d").drawImage(img, 0, 0, w, h);
          const url = c.toDataURL("image/jpeg", 0.85);
          resolve({ url, b64: url.split(",")[1], mime: "image/jpeg" });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function addFiles(files) {
    const list = [...files].filter(f => f.type.startsWith("image/"));
    const room = MAX_PHOTOS - state.photos.length;
    if (!list.length) return;
    if (room <= 0) { toast(`사진은 최대 ${MAX_PHOTOS}장까지예요`); return; }
    if (list.length > room) toast(`${room}장만 추가했어요 (최대 ${MAX_PHOTOS}장)`);
    for (const f of list.slice(0, room)) {
      try { state.photos.push(await resizeImage(f)); }
      catch { toast("읽을 수 없는 사진이 있어요 (HEIC는 JPG로 바꿔서 올려 주세요)"); }
    }
    renderThumbs();
  }

  function renderThumbs() {
    const box = $("thumbs");
    box.innerHTML = "";
    state.photos.forEach((p, i) => {
      const d = document.createElement("div");
      d.className = "thumb";
      d.innerHTML = `<div class="thumb-img"><img src="${p.url}" alt="사진 ${i + 1}"></div><span class="thumb-no">#${i + 1}</span><button aria-label="삭제">✕</button>`;
      d.querySelector("button").onclick = (e) => { e.preventDefault(); state.photos.splice(i, 1); renderThumbs(); };
      box.appendChild(d);
    });
    $("photoCount").textContent = `${state.photos.length} / ${MAX_PHOTOS}장`;
    $("drop").classList.toggle("has", state.photos.length > 0);
  }

  // ---------- 플랫폼 & 글자수 ----------
  function renderPlatforms() {
    const box = $("platforms");
    box.innerHTML = "";
    PLATFORMS.forEach(base => {
      const p = platformOf(base.id);
      const b = document.createElement("button");
      b.className = "pf" + (p.id === state.platformId ? " on" : "");
      b.style.setProperty("--c", p.color || "#ff6b4a");
      b.innerHTML = `<span class="ic">${p.icon}</span><span class="nm">${p.name}</span><span class="rg">${p.min}~${p.max}자</span>`;
      b.onclick = () => { state.platformId = p.id; store.set("ck_platform", p.id); state.target = 0; renderPlatforms(); };
      box.appendChild(b);
    });
    syncRange();
  }

  function syncRange() {
    const p = curPlatform();
    const r = $("lenRange");
    const step = p.max - p.min > 1000 ? 50 : 10;
    r.min = p.min; r.max = p.max; r.step = step;
    if (!state.target || state.target < p.min || state.target > p.max) state.target = p.target;
    r.value = state.target;
    r.style.setProperty("--fill", `${((state.target - p.min) / Math.max(1, p.max - p.min)) * 100}%`);
    $("targetLen").textContent = state.target;
    $("lenMin").textContent = `최소 ${p.min}`;
    $("lenMax").textContent = `최대 ${p.max}`;
    const ratio = (state.target - p.min) / Math.max(1, p.max - p.min);
    $("lenNote").textContent = ratio < .2 ? "짧고 굵게" : ratio < .55 ? "딱 적당" : ratio < .85 ? "자세하게" : "꽉 채워서";
  }

  // ---------- 별점 / 말투 ----------
  function renderStars() {
    const box = $("stars");
    box.innerHTML = "";
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement("button");
      b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>`;
      b.className = i <= state.rating ? "on" : "";
      b.setAttribute("aria-label", `${i}점`);
      b.onclick = () => { state.rating = i; renderStars(); };
      box.appendChild(b);
    }
  }
  $("tone").querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      $("tone").querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      state.tone = b.dataset.v;
    };
  });

  // 재방문 문구 규칙 (yes: 재방문 의사 / soft: 티 안 나게 / none: 언급 안 함)
  const CLOSING_RULE = {
    yes:  "마지막에 재주문·재방문(재구매) 의사를 자연스럽게 한마디 넣어.",
    soft: "작성자는 다시 갈 생각이 없어. 하지만 그게 티 나지 않게 써. '또 올게요', '재주문 각' 같은 재방문 약속은 절대 쓰지 말고, 대신 '잘 먹었습니다', '감사합니다', '번창하세요', '○○ 땡길 때 참고하시면 좋을 듯해요'처럼 따뜻하고 기분 좋은 마무리로 끝내. 아쉬운 점이 있어도 부정적으로 강조하지 말고 부드럽게.",
    none: "재방문·재구매에 대한 말은 아예 하지 마. 마무리 인사도 넣지 말고 내용으로 끝내."
  };
  const CLOSING_NOTE = {
    yes:  "마지막에 또 주문·방문하고 싶다는 한마디를 넣어요",
    soft: "다시 간다는 말 없이 고마운 인사로 마무리해요",
    none: "재방문 얘기 없이 맛·양 같은 내용으로만 끝내요"
  };
  $("closing").querySelectorAll("button").forEach(b => {
    b.onclick = () => {
      $("closing").querySelectorAll("button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      state.closing = b.dataset.v;
      $("closingNote").textContent = CLOSING_NOTE[state.closing];
    };
  });

  // ---------- 웹(claude.ai) 안에서 열렸을 때: 키 없이 내장 AI 사용 ----------
  let builtinAI = null;
  const builtinReady = (window.claude && typeof window.claude.use === "function")
    ? window.claude.use("sample").then(s => (builtinAI = s)).catch(() => null)
    : Promise.resolve(null);

  function b64ToBlob(b64, mime) {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function callBuiltin(parts) {
    const text = parts.filter(p => p.text).map(p => p.text).join("\n");
    const images = parts.filter(p => p.inline_data).map(p => b64ToBlob(p.inline_data.data, p.inline_data.mime_type));
    try {
      const res = await builtinAI(text, images.length ? { images, cache: false } : { cache: false });
      return res.text.trim();
    } catch (e) {
      const msg = {
        not_granted: "AI 사용을 허용해야 리뷰를 쓸 수 있어요",
        rate_limited: "잠깐 너무 많이 썼어요. 조금 뒤에 다시 눌러 주세요",
        image_rejected: "이 사진은 읽을 수 없어요. 다른 사진으로 해 주세요",
        images_unavailable: "여기서는 사진을 보낼 수 없어요",
        refused: "이 내용으로는 리뷰를 쓸 수 없어요. 메모를 바꿔 보세요"
      }[e && e.code];
      throw new Error(msg || "AI 연결이 잠깐 끊겼어요. 다시 눌러 주세요");
    }
  }

  // ---------- AI 호출 (내장 AI → Gemini 순서) ----------
  async function callGemini(parts, temperature = 0.9) {
    if (!store.get("ck_key", "")) {
      await builtinReady;
      if (builtinAI) return callBuiltin(parts);
    }
    // 우선순위: 내가 설정에 넣은 키 → config.js 중계 서버 → config.js 내장 키
    const cfg = (typeof APP_CONFIG !== "undefined") ? APP_CONFIG : {};
    const key = store.get("ck_key", "") || (cfg.PROXY_URL ? "" : (cfg.GEMINI_KEY || ""));
    const proxy = !store.get("ck_key", "") && cfg.PROXY_URL ? cfg.PROXY_URL.replace(/\/$/, "") : "";
    if (!key && !proxy) { openSettings(); throw new Error("먼저 설정에서 Gemini API 키를 넣어 주세요"); }
    const chosen = store.get("ck_model", "gemini-2.5-flash");
    const models = [chosen, ...FALLBACK_MODELS.filter(m => m !== chosen)];
    let lastErr;
    for (const model of models) {
      const url = proxy
        ? `${proxy}/?model=${encodeURIComponent(model)}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const headers = proxy ? { "Content-Type": "application/json" } : { "Content-Type": "application/json", "x-goog-api-key": key };
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          contents: [{ role: "user", parts }],
          generationConfig: { temperature, maxOutputTokens: 4096 }
        })
      }).catch(() => null);
      if (!res) { lastErr = new Error("인터넷 연결을 확인해 주세요"); break; }
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const text = (data.candidates?.[0]?.content?.parts || [])
          .filter(p => p.text && !p.thought).map(p => p.text).join("").trim();
        if (text) return text;
        lastErr = new Error("AI가 답을 못 했어요. 다른 사진으로 다시 시도해 주세요");
        break;
      }
      const msg = data.error?.message || "";
      if (res.status === 404) { lastErr = new Error(`모델(${model})을 찾을 수 없어요`); continue; }   // 다음 모델로
      if (res.status === 400 && /API key/i.test(msg)) { lastErr = new Error("API 키가 올바르지 않아요. 설정에서 다시 확인해 주세요"); break; }
      if (res.status === 403) { lastErr = new Error("이 키로는 사용할 수 없어요 (권한/지역 확인)"); break; }
      if (res.status === 429) { lastErr = new Error("오늘 무료 사용량을 다 썼거나 너무 빨라요. 잠시 후 다시!"); continue; }
      lastErr = new Error(`오류가 났어요 (${res.status}) ${msg.slice(0, 80)}`);
      break;
    }
    throw lastErr;
  }

  function buildPrompt(p) {
    const name = $("placeName").value.trim();
    const menu = $("menuName").value.trim();
    const memo = $("memo").value.trim();
    const emoji = $("optEmoji").checked;
    const lo = Math.max(p.min, Math.round(state.target * 0.9));
    const hi = Math.min(p.max, Math.round(state.target * 1.1));
    const toneGuide = {
      "친근": "친구한테 말하듯 편한 존댓말(~요체)",
      "담백": "군더더기 없이 담백한 존댓말, 과장 없이",
      "꼼꼼": "항목별로 꼼꼼하게, 정보 위주",
      "발랄": "밝고 텐션 높은 말투, 감탄사 조금"
    }[state.tone];

    return [
      `너는 한국 사람이 직접 쓴 것처럼 자연스러운 리뷰를 써 주는 도우미야.`,
      `첨부한 사진 ${state.photos.length}장을 보고, 아래 조건에 맞는 "${p.name}" 리뷰를 한 편 써 줘.`,
      ``,
      `[플랫폼 분위기] ${p.style}`,
      `[별점] ${state.rating}점 / 5점 — 별점에 맞는 만족도로 써. (4~5점은 칭찬 위주, 3점은 장단점 반반, 1~2점은 정중하게 아쉬운 점 위주)`,
      `[말투] ${toneGuide}`,
      name ? `[가게/상품 이름] ${name}` : `[가게/상품 이름] 모름 — 이름을 지어내지 말 것`,
      menu ? `[메뉴/옵션] ${menu}` : `[메뉴/옵션] 사진에서 보이는 걸로 판단, 확실하지 않으면 일반적으로 표현`,
      memo ? `[작성자 메모 — 반드시 반영] ${memo}` : ``,
      `[이모지] ${emoji ? "자연스럽게 1~4개 정도" : "사용하지 말 것"}`,
      `[재구매/재방문] ${CLOSING_RULE[state.closing]}`,
      ``,
      `[글자수 — 가장 중요] 공백 포함 ${lo}~${hi}자 (목표 ${state.target}자). 절대 ${p.max}자를 넘기지 말고, ${p.min}자보다 짧으면 안 돼.`,
      ``,
      `[규칙]`,
      `- 사진에 실제로 보이는 것(음식 모양, 양, 색, 포장, 매장, 상품 상태)을 구체적으로 언급해.`,
      `- 사진이나 메모에 없는 사실(가격, 배달 시간, 사장님 행동 등)은 지어내지 마.`,
      `- 광고처럼 보이지 않게, 실제 손님이 쓴 것처럼 자연스럽게.`,
      p.kind === "블로그" ? `- 블로그 글이므로 제목 한 줄을 맨 위에 쓰고, 소제목과 줄바꿈을 써도 돼.` : `- 제목, 따옴표, 해시태그, 설명 없이 리뷰 본문만 출력해.`,
    ].filter(Boolean).join("\n");
  }

  // 최대 글자수 넘으면 문장 단위로 자르기 (마지막 안전장치)
  function hardTrim(text, max) {
    const chars = [...text];
    if (chars.length <= max) return text;
    const cut = chars.slice(0, max);
    // 뒤에서부터 문장 끝(. ! ? ~ … 또는 줄바꿈) 찾기
    for (let i = cut.length - 1; i > max * 0.6; i--) {
      if (/[.!?~…\n]/.test(cut[i])) return cut.slice(0, i + 1).join("").trim();
    }
    return cut.join("").trim();
  }

  async function refitLength(text, p) {
    const prompt = [
      `아래 리뷰를 내용과 말투는 그대로 두고, 공백 포함 ${state.target}자 근처(${Math.max(p.min, Math.round(state.target * 0.92))}~${Math.min(p.max, Math.round(state.target * 1.08))}자)로 다시 써 줘.`,
      `지금은 ${countChars(text)}자야. ${countChars(text) > state.target ? "덜 중요한 문장을 줄여" : "사진에서 보이는 디테일을 더해 늘려"}. 리뷰 본문만 출력해.`,
      ``, text
    ].join("\n");
    return callGemini([{ text: prompt }], 0.5);
  }

  function inRange(text, p) {
    const n = countChars(text);
    return n >= p.min && n <= p.max && Math.abs(n - state.target) <= Math.max(15, state.target * 0.2);
  }

  async function generate() {
    if (state.busy) return;
    if (!state.photos.length) { toast("사진을 먼저 올려 주세요"); return; }
    if (navigator.onLine === false) { toast("📵 지금은 인터넷이 없어요. 와이파이·데이터가 잡히면 다시 눌러 주세요"); return; }
    const p = curPlatform();
    setBusy(true, "✍️ 사진 보면서 쓰는 중…");
    try {
      const parts = [{ text: buildPrompt(p) }, ...state.photos.map(ph => ({ inline_data: { mime_type: ph.mime, data: ph.b64 } }))];
      let text = clean(await callGemini(parts));
      if (!inRange(text, p)) {
        setBusy(true, "✂️ 글자수 맞추는 중…");
        try { text = clean(await refitLength(text, p)); } catch {}
      }
      text = hardTrim(text, p.max);
      showResult(text, p);
      saveHistory(text, p);
    } catch (e) {
      toast(e.message || "문제가 생겼어요");
    } finally {
      setBusy(false);
    }
  }

  async function fitOnly() {
    const text = $("output").value.trim();
    if (!text || state.busy) return;
    const p = curPlatform();
    setBusy(true, "✂️ 글자수 맞추는 중…");
    try {
      const out = hardTrim(clean(await refitLength(text, p)), p.max);
      showResult(out, p);
    } catch (e) { toast(e.message); }
    finally { setBusy(false); }
  }

  // ---------- 내 수정 반영해서 다시 쓰기 ----------
  async function revise() {
    if (state.busy) return;
    const edited = $("output").value.trim();
    const req = $("reviseReq").value.trim();
    const before = state.lastResult.trim();
    if (!edited) { toast("고칠 글이 없어요"); return; }
    if (edited === before && !req) { toast("글을 직접 고치거나, 바꾸고 싶은 점을 적어 주세요"); $("reviseReq").focus(); return; }
    const p = curPlatform();
    const lo = Math.max(p.min, Math.round(state.target * 0.9));
    const hi = Math.min(p.max, Math.round(state.target * 1.1));
    const prompt = [
      `너는 리뷰 다듬기 도우미야. 사용자가 AI 초안을 직접 고쳤어. 사용자가 고친 내용을 최우선으로 살려서 "${p.name}" 리뷰를 다시 완성해 줘.`,
      ``,
      `[AI 초안]`, before || "(없음)",
      ``,
      `[사용자가 고친 글 — 이게 정답 기준]`, edited,
      ``,
      req ? `[사용자 추가 요청 — 반드시 반영]\n${req}\n` : ``,
      `[하는 법]`,
      `1. 초안과 고친 글을 비교해서, 사용자가 추가·삭제·바꾼 부분을 찾아.`,
      `2. 사용자가 추가하거나 바꾼 사실(맛, 양, 평가, 메뉴 이름 등)은 그대로 살리고, 문장은 가능한 한 사용자 표현을 유지해.`,
      `3. 사용자가 지운 내용은 다시 넣지 마.`,
      `4. 바뀐 내용과 앞뒤가 안 맞는 다른 문장(예: "짰어요"로 고쳤는데 다른 곳에 "간이 딱 맞아요")은 고친 내용에 맞게 수정해.`,
      `5. 전체가 한 사람이 쓴 것처럼 자연스럽게 이어지게 다듬어.`,
      ``,
      `[말투] ${state.tone} / [별점] ${state.rating}점 — 단, 사용자가 고친 글의 분위기가 다르면 고친 글을 따라.`,
      `[이모지] ${$("optEmoji").checked ? "자연스럽게 1~4개" : "사용하지 말 것"}`,
      `[재구매/재방문] ${CLOSING_RULE[state.closing]} (사용자가 고친 글에 재방문 문장을 직접 넣었다면 그건 살려)`,
      `[글자수] 공백 포함 ${lo}~${hi}자 (목표 ${state.target}자, 절대 ${p.max}자 초과 금지, ${p.min}자 미만 금지)`,
      `사진·메모에 없는 사실은 지어내지 마. 설명 없이 리뷰 본문만 출력해.`
    ].filter(s => s !== "").join("\n");

    setBusy(true, "✍️ 수정한 내용으로 다시 쓰는 중…");
    try {
      const parts = [{ text: prompt }, ...state.photos.map(ph => ({ inline_data: { mime_type: ph.mime, data: ph.b64 } }))];
      let text = clean(await callGemini(parts, 0.6));
      if (!inRange(text, p)) { try { text = clean(await refitLength(text, p)); } catch {} }
      text = hardTrim(text, p.max);
      pushVersion(edited);
      showResult(text, p);
      $("reviseReq").value = "";
      saveHistory(text, p);
      toast("수정한 내용대로 다시 썼어요 ✍️");
    } catch (e) { toast(e.message || "문제가 생겼어요"); }
    finally { setBusy(false); }
  }

  function pushVersion(t) {
    if (!t) return;
    if (state.versions[state.versions.length - 1] !== t) state.versions.push(t);
    state.versions = state.versions.slice(-10);
    $("undoBtn").disabled = false;
  }
  function undo() {
    const prev = state.versions.pop();
    if (!prev) return;
    state.lastResult = prev;
    $("output").value = prev;
    updateCount();
    markEdited();
    $("undoBtn").disabled = !state.versions.length;
    toast("이전 버전으로 돌렸어요");
  }

  function markEdited() {
    const edited = $("output").value.trim() !== state.lastResult.trim();
    $("reviseBox").classList.toggle("edited", edited);
    $("reviseTip").textContent = edited
      ? "✏️ 수정됨! 버튼을 누르면 고친 내용에 맞춰 전체를 자연스럽게 다시 써요"
      : "✏️ 위 글을 직접 고치거나, 바꾸고 싶은 점을 적고 눌러 보세요";
  }

  const clean = (t) => t.replace(/^```[a-z]*\n?|```$/g, "").replace(/^["“](.*)["”]$/s, "$1").trim();

  function setBusy(on, label) {
    state.busy = on;
    ["genBtn", "againBtn", "fitBtn", "reviseBtn"].forEach(id => $(id).disabled = on);
    $("genBtn").textContent = on ? label : "✨ 리뷰 써주세요";
    $("reviseBtn").textContent = on ? "⏳ 쓰는 중…" : "✍️ 내 수정대로 다시 쓰기";
  }

  // ---------- 결과 ----------
  function showResult(text, p) {
    const cur = $("output").value.trim();
    if (cur && cur !== text) pushVersion(cur);
    state.lastResult = text;
    $("resultCard").classList.remove("hidden");
    $("resultTitle").textContent = `${p.icon} ${p.name} 리뷰`;
    $("output").value = text;
    updateCount();
    markEdited();
    $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function updateCount() {
    const p = curPlatform();
    const t = $("output").value;
    const n = countChars(t);
    const ok = n >= p.min && n <= p.max;
    const badge = $("countBadge");
    badge.textContent = ok ? `✅ ${n}자` : `⚠️ ${n}자`;
    badge.classList.toggle("bad", !ok);
    $("countSub").textContent = ok
      ? `${p.name} 기준 OK (${p.min}~${p.max}자) · 공백 제외 ${countNoSpace(t)}자`
      : n > p.max ? `${n - p.max}자 넘어요 → ✂️ 길이맞춤` : `${p.min - n}자 더 필요해요`;
  }

  async function copy() {
    const t = $("output").value;
    if (!t) return;
    try { await navigator.clipboard.writeText(t); }
    catch { $("output").select(); document.execCommand("copy"); }
    toast("복사했어요! 앱에 붙여넣기 하세요 📋");
  }

  // ---------- 기록 ----------
  function saveHistory(text, p) {
    const h = store.get("ck_history", []);
    h.unshift({ text, platform: p.name, icon: p.icon, at: Date.now() });
    store.set("ck_history", h.slice(0, 20));
    renderHistory();
  }
  function renderHistory() {
    const h = store.get("ck_history", []);
    const box = $("history");
    if (!h.length) { box.innerHTML = `<p class="empty">아직 없어요</p>`; return; }
    box.innerHTML = "";
    h.forEach(item => {
      const d = new Date(item.at);
      const row = document.createElement("div");
      row.className = "h-item";
      row.innerHTML = `<div><div class="h-meta">${item.icon} ${item.platform} · ${d.getMonth() + 1}/${d.getDate()} · ${countChars(item.text)}자</div><div class="h-text"></div></div><button>복사</button>`;
      row.querySelector(".h-text").textContent = item.text;
      row.querySelector("button").onclick = async () => {
        try { await navigator.clipboard.writeText(item.text); toast("복사했어요 📋"); } catch { toast("복사 실패 — 길게 눌러 복사해 주세요"); }
      };
      box.appendChild(row);
    });
  }

  // ---------- 설정 ----------
  function openSettings() {
    $("apiKey").value = store.get("ck_key", "");
    $("model").value = store.get("ck_model", "gemini-2.5-flash");
    renderLimitTable();
    $("settings").classList.remove("hidden");
  }
  function closeSettings() { $("settings").classList.add("hidden"); }

  function renderLimitTable() {
    const box = $("limitTable");
    box.innerHTML = `<div class="lt-row head"><span>플랫폼</span><span>최소</span><span>최대</span></div>`;
    PLATFORMS.forEach(base => {
      const p = platformOf(base.id);
      const row = document.createElement("div");
      row.className = "lt-row";
      row.innerHTML = `<span>${p.icon} ${p.name}</span>
        <input type="number" inputmode="numeric" min="1" data-id="${p.id}" data-k="min" value="${p.min}">
        <input type="number" inputmode="numeric" min="1" data-id="${p.id}" data-k="max" value="${p.max}">`;
      box.appendChild(row);
    });
  }

  function saveSettings() {
    store.set("ck_key", $("apiKey").value.trim());
    store.set("ck_model", $("model").value);
    const limits = {};
    $("limitTable").querySelectorAll("input").forEach(inp => {
      const base = PLATFORMS.find(p => p.id === inp.dataset.id);
      const v = parseInt(inp.value, 10);
      if (v > 0 && v !== base[inp.dataset.k]) (limits[base.id] ||= {})[inp.dataset.k] = v;
    });
    store.set("ck_limits", limits);
    state.target = 0;
    renderPlatforms();
    if (state.lastResult) updateCount();
    closeSettings();
    toast("저장했어요");
  }

  // ---------- 이벤트 ----------
  $("fileInput").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
  const drop = $("drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", e => addFiles(e.dataTransfer.files));
  document.addEventListener("paste", e => { if (e.clipboardData?.files?.length) addFiles(e.clipboardData.files); });

  $("lenRange").oninput = (e) => { state.target = Number(e.target.value); syncRange(); };
  $("genBtn").onclick = generate;
  $("againBtn").onclick = generate;
  $("fitBtn").onclick = fitOnly;
  $("copyBtn").onclick = copy;
  $("output").oninput = () => { updateCount(); markEdited(); };
  $("reviseBtn").onclick = revise;
  $("undoBtn").onclick = undo;
  $("reviseReq").onkeydown = (e) => { if (e.key === "Enter" && !e.isComposing) revise(); };
  $("clearHist").onclick = () => { store.del("ck_history"); renderHistory(); };
  $("openSettings").onclick = openSettings;
  $("closeSettings").onclick = closeSettings;
  $("settings").onclick = (e) => { if (e.target.id === "settings") closeSettings(); };
  $("saveSettings").onclick = saveSettings;
  $("resetLimits").onclick = () => { store.del("ck_limits"); renderLimitTable(); toast("기본값으로 돌렸어요 (저장을 눌러 주세요)"); };

  // ---------- 홈 화면 설치(오프라인으로 열기) ----------
  // GitHub Pages 같은 https 주소에서만 동작 (파일 더블클릭·claude.ai 안에서는 건너뜀)
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost") && !window.claude) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  window.addEventListener("offline", () => toast("📵 인터넷이 끊겼어요. 기록 보기·복사는 그대로 돼요"));

  // ---------- 시작 ----------
  renderThumbs();
  renderPlatforms();
  renderStars();
  renderHistory();
  const hasBuiltin = typeof APP_CONFIG !== "undefined" && (APP_CONFIG.PROXY_URL || APP_CONFIG.GEMINI_KEY);
  if (!store.get("ck_key", "") && !hasBuiltin && !window.claude) setTimeout(() => toast("⚙️ 설정에서 Gemini API 키를 먼저 넣어 주세요"), 600);
})();
