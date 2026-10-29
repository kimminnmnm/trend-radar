import type { CanonicalAliasRule } from "./culture-metadata";

/**
 * 검토된 동의어 규칙. 서로 다른 DNA 라벨이 같은 문화적 속성을 가리킨다고 판단한 경우에만 하나의 Attribute ID로 묶는다.
 *
 * - 2026-10-29 PHASE 6에서 실제 분석 8건(러닝·마라톤·보컬로이드·헤이세이 레트로·캐릭터 커스터마이징·발레코어·디지털카메라·레트로 게임)의
 *   라벨을 Claude Code(AI)가 검토해 작성했다. 사람 검토 전이므로 reviewedBy에 그 사실을 남긴다.
 * - 같은 차원 안에서만 묶는다. 라벨 문자열이 정확히(표면 정규화 후) 일치해야 적용된다.
 * - 의미가 비슷해도 대상이 다르면 묶지 않았다. 예: 캐릭터 커스터마이징의 가상 패션과 발레코어의 실물 패션 아이템,
 *   발레코어의 "발레 패션의 반복적 재등장"(특정 시대 회고가 아님)과 헤이세이·뉴트로의 과거 재해석.
 * - 검증 중 수정: 발레코어 "뷰티·다꾸 콘텐츠에의 적용"을 꾸미기·커스터마이징에 넣었다가 뺐다. 미감을 다른 콘텐츠에 적용한다는 뜻이지
 *   이용자가 대상을 직접 꾸미는 행동이 아니어서, 발레코어가 헤이세이·디카·캐릭터와 약하게 연결되는 과잉 연결을 만들었다.
 * - 공통 속성은 엔진 규칙대로 Supported Hypothesis이며 두 문화가 함께 확산됐다는 뜻이 아니다.
 */
export const CULTURE_ALIAS_RULES_VERSION = "alias-2026-10-29-ai-review-r2";
const reviewedBy = "Claude Code AI review · 사람 검토 필요";
const reviewedAt = "2026-10-29T07:00:00.000Z";

export const CULTURE_ALIAS_RULES: CanonicalAliasRule[] = [
  { dimension: "Emotion", canonicalLabel: "과거에 대한 향수", aliases: ["과거 문화에 대한 향수", "뉴트로·향수 감성", "과거 경험의 재경험"], reviewedBy, reviewedAt },
  { dimension: "Culture", canonicalLabel: "과거 문화의 재발견·재해석", aliases: ["시대 문화의 재발견", "디지털 매체의 과거 스타일 재현", "Y2K·뉴트로 재해석", "게임 경험의 보존과 재현"], reviewedBy, reviewedAt },
  { dimension: "Culture", canonicalLabel: "오프라인 전시·체험", aliases: ["오프라인 전시·팝업 활용", "오프라인 장터·체험"], reviewedBy, reviewedAt },
  { dimension: "Culture", canonicalLabel: "브랜드 협업", aliases: ["브랜드와 가상 패션의 결합", "브랜드 협업 사례"], reviewedBy, reviewedAt },
  { dimension: "Behavior", canonicalLabel: "꾸미기·커스터마이징", aliases: ["스티커 바인더 꾸미기", "카메라 꾸미기", "게임 캐릭터 생성·꾸미기 콘텐츠 시청", "꾸미기와 장비 선택"], reviewedBy, reviewedAt },
  { dimension: "Behavior", canonicalLabel: "창작물 제작·공유", aliases: ["음악·영상 창작물 게시", "아바타 콘텐츠 제작·공유", "고전 게임 관련 영상 시청·제작"], reviewedBy, reviewedAt },
  { dimension: "Behavior", canonicalLabel: "대회 전 훈련", aliases: ["대회 전 훈련과 준비", "대회 전 훈련"], reviewedBy, reviewedAt },
  { dimension: "Behavior", canonicalLabel: "함께 달리기", aliases: ["함께 달리기 약속", "응원 및 동반주"], reviewedBy, reviewedAt },
  { dimension: "Aesthetic", canonicalLabel: "캐릭터·애니메이션 비주얼", aliases: ["캐릭터 기반 콘텐츠", "애니메이션·일러스트 연계", "2D 애니메이션 스타일", "팬시 캐릭터·꾸미기 요소"], reviewedBy, reviewedAt },
  { dimension: "Aesthetic", canonicalLabel: "저해상도·로파이 비주얼", aliases: ["흐릿하고 색 바랜 듯한 사진", "도트·픽셀 그래픽"], reviewedBy, reviewedAt },
  { dimension: "Object", canonicalLabel: "구형 전자기기", aliases: ["2000년대 콤팩트 디지털카메라", "구형 디카", "고전 게임기와 CRT 모니터", "휴대용 레트로 게임기"], reviewedBy, reviewedAt },
  { dimension: "Object", canonicalLabel: "대회 메달", aliases: ["대회 메달", "메달"], reviewedBy, reviewedAt },
];
