/* 찰칵리뷰 - 기본 설정 (author: HAE)
 * 여기 값을 채우면 누구든 웹앱을 열자마자 바로 사용 가능 (설정 화면에서 키 입력 불필요)
 *
 * 방법 A (추천·안전): PROXY_URL 에 Cloudflare Worker 주소 넣기
 *   → 키는 Worker 안에 숨겨져서 GitHub에 안 올라감. worker.js 참고
 * 방법 B (간단): GEMINI_KEY 에 키 직접 넣기
 *   → GitHub에 공개되므로 Google에서 키를 "유출"로 보고 막을 수 있음.
 *     꼭 Google Cloud 콘솔에서 키 제한(HTTP 리퍼러: luminahae.github.io/*)을 걸어 두기
 *
 * 둘 다 비워 두면 각자 ⚙️ 설정에서 자기 키를 넣어야 함
 */
const APP_CONFIG = {
  PROXY_URL: "",   // 예) "https://chalkak.내아이디.workers.dev"
  GEMINI_KEY: "AQ.Ab8RN6KNO8Zhz3qKHGqHiNSe7MCCb1VZOlvzNN9Xi5wWM-R7ig"
};
