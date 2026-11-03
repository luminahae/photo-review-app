/* 찰칵리뷰 - 플랫폼별 리뷰 규칙 (author: HAE)
 * min / max : 입력 가능한 글자수 범위(공백 포함)
 * target    : 처음 선택했을 때 목표 글자수
 * style     : AI에게 알려줄 그 플랫폼 리뷰 분위기
 * 앱 정책이 바뀌면 이 파일 값이나, 앱의 설정 화면에서 바꾸면 됨
 */
const PLATFORMS = [
  { id: "coupangeats", color: "#16a6e8", name: "쿠팡이츠",      icon: "🛵", kind: "배달", min: 10, max: 300,  target: 100,
    style: "배달앱 리뷰. 맛·양·포장·배달 상태 위주로 짧고 솔직하게. 사장님이 읽는다는 느낌." },
  { id: "baemin", color: "#2ac1bc",      name: "배달의민족",    icon: "🍗", kind: "배달", min: 10, max: 500,  target: 150,
    style: "배달앱 리뷰. 메뉴별 맛 평가, 양, 포장, 서비스. 사장님께 고마움 한마디 정도." },
  { id: "yogiyo", color: "#fa0050",      name: "요기요",        icon: "🍕", kind: "배달", min: 10, max: 300,  target: 100,
    style: "배달앱 리뷰. 짧고 핵심만. 맛·양·배달." },
  { id: "naverplace", color: "#03c75a",  name: "네이버 플레이스", icon: "📍", kind: "매장", min: 10, max: 400,  target: 150,
    style: "네이버 지도 방문자(영수증) 리뷰. 매장 분위기, 메뉴 맛, 친절도, 주차·웨이팅 같은 실용 정보." },
  { id: "kakaomap", color: "#f7c600",    name: "카카오맵(다음)", icon: "🗺️", kind: "매장", min: 10, max: 300,  target: 120,
    style: "카카오맵 장소 후기. 짧고 담백하게 장점 위주, 다른 사람이 참고할 정보 한두 개." },
  { id: "google", color: "#4285f4",      name: "구글 지도",     icon: "🌐", kind: "매장", min: 30, max: 1000, target: 250,
    style: "구글 지도 리뷰. 처음 가는 사람에게 도움 되게 메뉴·가격대·분위기·추천 포인트 정리." },
  { id: "coupang", color: "#e5452f",     name: "쿠팡 상품",     icon: "📦", kind: "상품", min: 20, max: 1000, target: 300,
    style: "쇼핑몰 상품 후기. 배송·포장 상태, 실제 사용감, 사진에 보이는 품질, 장단점, 추천 대상." },
  { id: "navershop", color: "#03c75a",   name: "네이버 쇼핑",   icon: "🛍️", kind: "상품", min: 20, max: 1000, target: 250,
    style: "스마트스토어 포토 리뷰. 사이즈·색감·재질 등 사진으로 보이는 점, 사용 후기, 만족도." },
  { id: "blog", color: "#7a5cff",        name: "블로그 후기",   icon: "✍️", kind: "블로그", min: 300, max: 3000, target: 1200,
    style: "네이버 블로그 후기. 도입 → 사진 순서대로 설명 → 총평. 소제목과 줄바꿈 활용, 읽기 편하게." }
];
