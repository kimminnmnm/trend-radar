import type { Evidence, Trend } from "./types";
import { isLiveTrendId, makeLiveTrend, safeDecode } from "./live-trend";

export const trends: Trend[] = [
  { id: "heisei-retro", name: "헤이세이 레트로", en: "Heisei Retro", category: "Subculture", summary: "2000년대 일본의 디지털 감각을 오늘의 자기표현 방식으로 다시 편집하는 문화 신호", signal: "DEMO SIGNAL", status: "Supported Hypothesis", tags: ["향수", "디지털 꾸미기", "수집"], accent: "#000080" },
  { id: "vocaloid", name: "보컬로이드", en: "Vocaloid", category: "Subculture", summary: "창작자와 팬이 함께 세계관을 확장하는 참여형 디지털 음악 문화", signal: "DEMO ARCHIVE", status: "Verified Signal", tags: ["팬 창작", "가상 정체성", "커뮤니티"], accent: "#008080" },
  { id: "balletcore", name: "발레코어", en: "Balletcore", category: "Fashion", summary: "무대 의상의 섬세함을 일상복과 웰니스 미학으로 번역한 스타일", signal: "WATCH", status: "Creative Hypothesis", tags: ["리본", "루틴", "우아함"], accent: "#a00050" },
  { id: "digital-camera", name: "디지털카메라", en: "Compact Digital Camera", category: "Lifestyle", summary: "완벽한 스마트폰 이미지 대신 불완전한 기록감을 선택하는 촬영 행동", signal: "DEMO SIGNAL", status: "Supported Hypothesis", tags: ["저해상도", "기록", "물성"], accent: "#0000c0" },
  { id: "character-custom", name: "캐릭터 커스터마이징", en: "Character Customization", category: "Lifestyle", summary: "소유한 캐릭터를 취향과 정체성의 작은 인터페이스로 바꾸는 행동", signal: "WATCH", status: "Creative Hypothesis", tags: ["개인화", "꾸미기", "자기표현"], accent: "#806000" },
  { id: "analog-log", name: "아날로그 기록", en: "Analog Logging", category: "Lifestyle", summary: "빠른 디지털 소비에 맞서 손으로 남기는 과정 자체를 향유하는 문화", signal: "DEMO ARCHIVE", status: "Verified Signal", tags: ["느림", "루틴", "아카이빙"], accent: "#804000" },
  { id: "retro-game", name: "레트로 게임 문화", en: "Retro Gaming", category: "Entertainment", summary: "과거의 제한적 그래픽과 플레이 규칙을 새롭게 경험하는 놀이 문화", signal: "WATCH", status: "Supported Hypothesis", tags: ["픽셀", "재발견", "커뮤니티"], accent: "#007070" },
  { id: "kidult", name: "키덜트 문화", en: "Kidult Culture", category: "Lifestyle", summary: "성인 소비자가 놀이와 수집을 정체성 관리 방식으로 활용하는 현상", signal: "DEMO SIGNAL", status: "Supported Hypothesis", tags: ["수집", "놀이", "정서적 안전"], accent: "#600080" },
];

export const interestSeries = [
  { month: "24.09", value: 19, note: "관찰 시작" },
  { month: "24.11", value: 24, note: "관련 콘텐츠 증가" },
  { month: "25.01", value: 31, note: "재해석 콘텐츠 등장" },
  { month: "25.03", value: 46, note: "커뮤니티 확산 가설" },
  { month: "25.05", value: 54, note: "상업적 활용 관찰" },
  { month: "25.07", value: 66, note: "관심 신호 지속" },
];

export const evidence: Evidence[] = [
  { id: "e1", title: "데모 데이터 사용 안내", source: "TREND RADAR Demo Dataset", date: "2026-10-28", collectedAt: "2026-10-28 15:00 KST", excerpt: "이 화면의 수치와 사건은 인터랙션 검증을 위한 예시이며 실제 검색량 또는 시장 성과가 아닙니다.", status: "Verified Signal" },
  { id: "e2", title: "디지털 향수와 자기표현의 연결", source: "AI interpretation — verification required", date: "—", collectedAt: "2026-10-28 15:00 KST", excerpt: "낮은 해상도와 장식적 인터페이스가 과거 회상뿐 아니라 현재의 취향 표현 도구로 활용될 수 있다는 해석입니다.", status: "Supported Hypothesis" },
  { id: "e3", title: "레트로 디지털 액세서리 시나리오", source: "Creative exploration", date: "—", collectedAt: "2026-10-28 15:00 KST", excerpt: "개인화된 카메라 스킨·디지털 다이어리·캐릭터 UI로 확장될 가능성을 탐색합니다.", status: "Creative Hypothesis" },
];

export const dna = {
  Aesthetic: ["저해상도", "파스텔 UI", "크롬 장식", "픽셀 타입"],
  Emotion: ["향수", "친숙함", "발견의 즐거움"],
  Behavior: ["수집", "꾸미기", "다시 찍기", "공유"],
  Object: ["컴팩트 카메라", "키링", "스티커", "폴더폰"],
  Culture: ["2000년대 일본 대중문화", "팬 커뮤니티", "DIY 미학"],
  Audience: ["디지털 네이티브", "취향 아카이버", "팬 창작자"],
};

export const timeline = [
  { stage: "EMERGENCE", date: "Archive", title: "원형 문화", text: "2000년대 디지털 기기와 엔터테인먼트의 시각 언어가 참조점이 됩니다." },
  { stage: "EARLY ADOPTION", date: "Observed", title: "취향 커뮤니티의 재발견", text: "과거 기기와 이미지를 수집·공유하는 행동이 문화적 맥락을 만듭니다." },
  { stage: "ACCELERATION", date: "Hypothesis", title: "짧은 영상 속 재편집", text: "빠르게 인식 가능한 시각 기호가 플랫폼 포맷과 결합했을 가능성을 검토합니다." },
  { stage: "COMMERCIAL", date: "Scenario", title: "브랜드 언어로의 번역", text: "제품 자체보다 꾸미기와 참여 경험으로 확장되는 시나리오입니다." },
];

export function findDemoTrend(id: string) {
  return trends.find((trend) => trend.id === id) ?? null;
}

/** 데모 트렌드 또는 키워드 기반 LIVE 트렌드. 둘 다 아니면 null(404). */
export function resolveTrend(rawId: string): Trend | null {
  const id = safeDecode(rawId);
  return findDemoTrend(id) ?? (isLiveTrendId(id) ? makeLiveTrend(id) : null);
}
