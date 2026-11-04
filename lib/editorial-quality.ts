import { ideaSimilarity } from "./creative-collision";
import { checkLockUnits, driftHits, lockEvidenceLimited, type EditorialContextLock } from "./editorial-lock";
import { isGenericTitle, titleStructure, type ContentAngle } from "./editorial";
import type { ProductionPlan } from "./content-production";

/*
 * EDITORIAL QUALITY (V2.1). 두 갈래로 나눈다.
 *  A. 필수 검증(required) — 결정적 규칙: 사실 근거, 주제 일치, 언어 일관성, 근거 ID 유효성, 중복. 실패하면 해당 슬라이드만 고쳐 쓴다.
 *  B. 편집 신호(editorial) — 규칙으로 찾은 참고 신호(다른 소재에도 통하는 문장, 디테일 미사용, 출처 서술, 제목 구조).
 *     좋은 후킹·자연스러움은 단어 규칙으로 판정하지 않는다. 이 신호를 편집 리뷰(AI 참고 점수)에 넘기고, 사용자 평가와 구분해 표시한다.
 */
export type QualityCheck = { id: string; label: string; pass: boolean; detail: string; group: "required" | "editorial" };
export type QualityIssue = { unit: number | "title" | "caption"; problem: string };
export type QualityReport = {
  source: "rule-check";
  checks: QualityCheck[];
  /** 필수 검증만 센다. */
  passed: number; total: number; failing: string[];
  /** 고쳐 쓸 대상(필수 실패는 반드시, 편집 신호는 리뷰가 판단). */
  issues: QualityIssue[]; hints: QualityIssue[];
  genericSentences: string[];
  regenerated?: boolean;
};
/** 편집 리뷰: AI가 매긴 참고 점수(1~5)와 부분 수정 기록. 사용자 평가가 아니다. */
export type EditorialReview = {
  source: "ai-review"; model: string; reviewedAt: string;
  scores: { hook: number; specificity: number; story: number; save_share: number; voice: number };
  summary: string;
  patched: Array<{ unit: number | "title"; reason: string }>;
  /** 고친 뒤 새 문제(언어 섞임·근거 없는 주장·출처 서술 등)가 생겨 원래 초안으로 되돌린 슬라이드. */
  reverted?: Array<{ unit: number; problems: string[] }>;
  titleChange?: { from: string; to: string };
  /** 수정 전 필수 검증 결과(비교용). */
  before: { passed: number; total: number; failing: string[] };
};

/** 출처를 서술하는 문장(분석·보도 요약형 전개의 신호). */
const SOURCE_NARRATION = /(보도|기사|자료|발표|설명|소개|분석)(에\s*따르면|는|에서는?)\s|(소개|설명|발표|보도|전)했어요|(소개|설명|발표)됐어요|라고\s*(해요|밝혔)/;
/** 인용 부호·괄호 안의 원어(곡명·작품명)는 허용한다. */
const QUOTED = /[「『‘'“"(（][^」』’'”")）]*[」』’'”")）]/g;
const FOREIGN_SCRIPT = /[぀-ヿ一-鿿]/;
/** E0 G2: 1인칭 체험(먹어 봤다·가 봤다·써 봤다·솔직 후기 …). */
export const FIRST_PERSON_EXPERIENCE = /(직접|제가|내가|저희가|우리가)\s*\S{0,6}(먹어\s*봤|가\s*봤|가봤|다녀왔|써\s*봤|써봤|입어\s*봤|사\s*봤|해\s*봤|해봤|타\s*봤|방문했|구매했|체험했)|(먹어|가|써|입어|사)\s*봤(어요|는데|더니|습니다)|다녀왔(어요|는데|습니다)|솔직\s*후기|내돈내산/;
/** E0 G3: 근거 없이 쓰면 안 되는 유행·인기 표현. */
export const VIRALITY = /요즘\s*(난리|대세|핫한|핫해)|난리\s*난|난리예요|대세(예요|인|로|가|템)|핫한|핫해요|바이럴|인기\s*폭발|품절\s*대란|급상승|역대급\s*인기/;
/** E0 FAILURE 07: 조사·통계 방법 서술. */
const SURVEY_NARRATION = /(조사|설문|분석\s*글|보고서|통계)(에서는?|에\s*따르면|\s*결과)|(으로|로)\s*정의했|보고됐|라고\s*보고|비중이\s*높았다고/;

/** 스토리보드 '새 정보'가 앞 장과 이만큼 겹치면 반복으로 본다. */
export const PROGRESS_OVERLAP = 0.5;
const sentences = (text: string) => text.split(/(?<=[.!?。…])\s+|\n+/).map((item) => item.trim()).filter((item) => item.length >= 6);
const words = (text: string) => (text.match(/[\p{L}\p{N}]{2,}/gu) ?? []).map((word) => word.toLocaleLowerCase("ko-KR"));
/** 한국어 조사·어미를 대충 떼어 비교한다(검사용). */
const stem = (word: string) => word.replace(/(으로|에서|에게|까지|부터|처럼|이랑|하고|이에요|예요|해요|했어요|이죠|은|는|이|가|을|를|의|에|도|와|과|로|만)$/u, "");

/** 어느 소재에나 쓰이는 일반어. 소재 고유어로 세지 않는다(팀·작품·브랜드 이름만 바꿔도 통하는 말). */
export const GENERIC_WORDS = new Set([
  "콘텐츠", "이야기", "소개", "가이드", "포인트", "정보", "사람", "처음", "우리", "여러분", "독자", "방법", "순간", "장면", "마무리", "시작", "표지",
  "응원", "응원가", "응원석", "영상", "공식", "채널", "구단", "경기", "경기장", "야구", "야구장", "직관", "관중", "관중석", "팬", "팬덤", "선수", "팀", "시즌",
  "챌린지", "온라인", "소셜", "미디어", "사진", "카메라", "디저트", "캐릭터", "굿즈", "문화", "감성", "취향", "추억", "레트로", "트렌드", "유행", "인기",
  "확인", "준비", "예매", "입장", "방문", "체험", "재미", "분위기", "동작", "음악", "노래", "후렴", "공간", "제품", "브랜드", "행사", "이벤트", "전시", "팝업",
]);

/**
 * 스왑 테스트: 소재 이름·키워드를 지워도 그 소재에만 해당하는 말(고유명사·숫자·인용·외부 자료 어휘)이 남는가.
 * 남지 않으면 "다른 키워드로 바꿔도 그대로 쓸 수 있는 문장"이다.
 */
export function isGenericSentence(sentence: string, subjectTerms: string[], specificTerms: string[]) {
  let rest = sentence;
  for (const term of subjectTerms) if (term) rest = rest.split(term).join(" ");
  if (/[A-Za-z]{2,}|\d|[‘'“"「『].+?[’'”"」』]/.test(rest)) return false;
  const restWords = new Set(words(rest).map(stem));
  return !specificTerms.some((term) => term.length >= 2 && restWords.has(stem(term.toLocaleLowerCase("ko-KR"))));
}

type Unit = { n: number; head: string; body: string; gets: string; facts: NonNullable<ProductionPlan["slides"][number]["fact_checks"]>; detailIds: string[]; review: string[]; newInfo: string };
const unitsOf = (plan: ProductionPlan): Unit[] => plan.slides.length
  ? plan.slides.map((slide) => ({ n: slide.number, head: slide.headline, body: `${slide.body} ${slide.supporting_text}`, gets: slide.reader_gets ?? "", facts: slide.fact_checks ?? [], detailIds: slide.detail_ids ?? [], review: slide.review ?? [], newInfo: slide.new_information ?? "" }))
  : plan.scenes.map((scene, index) => ({ n: index + 1, head: scene.on_screen_text, body: scene.voice_over, gets: scene.reader_gets ?? "", facts: scene.fact_checks ?? [], detailIds: scene.detail_ids ?? [], review: scene.review ?? [], newInfo: "" }));

/**
 * vocabulary: 소재 고유어 후보가 되는 외부 텍스트(근거 원장 제목·발췌, DNA 속성). 모델이 슬라이드에 쓴 디테일 문구는 쓰지 않는다
 * (V2 실측: 모델 문구가 일반어여서 "다른 팀에도 통하는 팁"이 통과됐다). Detail Bank는 근거가 확인된 항목만 더한다.
 * removedEvidenceIds: 서버 검증이 지운 가짜 근거 ID(근거 유효성).
 */
export function editorialQualityGate(plan: ProductionPlan, input: { subjectTerms: string[]; angle?: ContentAngle; vocabulary?: string[]; removedEvidenceIds?: string[]; lock?: EditorialContextLock }): QualityReport {
  const units = unitsOf(plan);
  const subjectTerms = [...new Set(input.subjectTerms.flatMap((term) => [term, term.replace(/\s+/g, ""), ...term.split(/\s+/)]).filter((term) => term.length >= 2))].sort((a, b) => b.length - a.length);
  const bank = plan.detail_bank ?? [];
  const verifiedBank = bank.filter((item) => item.status === "verified");
  const factTexts = units.flatMap((unit) => unit.facts.map((fact) => fact.text));
  const specificTerms = [...new Set([...(input.vocabulary ?? []), ...verifiedBank.flatMap((item) => [item.detail, item.example]), ...factTexts].flatMap(words).map(stem).filter((word) => word.length >= 2 && !GENERIC_WORDS.has(word)))];
  const checks: QualityCheck[] = [];
  const issues: QualityIssue[] = [], hints: QualityIssue[] = [];
  const required = (id: string, label: string, pass: boolean, detail: string) => checks.push({ id, label, pass, detail, group: "required" });
  const editorial = (id: string, label: string, pass: boolean, detail: string) => checks.push({ id, label, pass, detail, group: "editorial" });

  /* ---------- A. 필수 검증 ---------- */
  // 사실 정확성: 근거 없는 사실 주장이 게시 문구에 남지 않는다(서버가 Insufficient Evidence로 낮춘 주장).
  const unsupported = units.filter((unit) => unit.review.length);
  unsupported.forEach((unit) => issues.push({ unit: unit.n, problem: `근거 없는 사실 주장을 빼거나 단정하지 않는 표현으로: ${unit.review.map((line) => line.replace(/^검증 필요: /, "")).join(" / ")}` }));
  required("facts", "사실 정확성(근거 없는 단정 없음)", !unsupported.length, unsupported.length ? `근거 없는 사실 주장이 있는 슬라이드 ${unsupported.map((unit) => unit.n).join(", ")}` : `사실 ${units.flatMap((unit) => unit.facts).length}건 — 근거 있음 또는 단정하지 않음`);
  // 주제 일치: 선택한 방향 반영 + 소재와의 연결. 소재 이름 반복만이 아니라, 근거 있는 소재 고유 디테일을 쓴 슬라이드도 연결로 센다.
  const mentions = (text: string) => subjectTerms.some((term) => text.includes(term));
  const mentioned = units.filter((unit) => mentions(`${unit.head} ${unit.body}`)).map((unit) => unit.n);
  const grounded = units.filter((unit) => unit.detailIds.some((id) => verifiedBank.some((item) => item.id === id))).map((unit) => unit.n);
  const linked = mentioned.length >= 2 || (mentioned.includes(units[0]?.n ?? -1) && mentions(plan.caption)) || (mentioned.length >= 1 && grounded.length >= Math.ceil(units.length / 2));
  const angleSimilarity = input.angle ? ideaSimilarity(`${input.angle.title} ${input.angle.hook} ${input.angle.editorial_perspective} ${input.angle.reader_benefit}`, `${plan.title} ${units.slice(0, 2).map((unit) => `${unit.head} ${unit.body}`).join(" ")}`) : 1;
  if (!linked) issues.push({ unit: units[0]?.n ?? 1, problem: "소재와 연결이 약함: 이 소재만의 디테일(Detail Bank)로 소재가 드러나게" });
  required("topic", "주제 일치(방향·소재)", linked && angleSimilarity >= 0.08, `방향 유사도 ${angleSimilarity.toFixed(2)} · 소재 이름 슬라이드 ${mentioned.join(", ") || "없음"} · 근거 디테일 슬라이드 ${grounded.join(", ") || "없음"}`);
  // 언어 일관성: 인용 밖의 일본어 가나·한자.
  const mixed = units.filter((unit) => FOREIGN_SCRIPT.test(`${unit.head} ${unit.body}`.replace(QUOTED, "")));
  mixed.forEach((unit) => issues.push({ unit: unit.n, problem: "한국어 문장에 일본어·한자가 섞임: 한국어로 옮기거나 원어는 「」로 감싸기" }));
  const captionMixed = FOREIGN_SCRIPT.test(plan.caption.replace(QUOTED, ""));
  if (captionMixed) issues.push({ unit: "caption", problem: "캡션에 일본어·한자가 섞임" });
  required("language", "언어 일관성", !mixed.length && !captionMixed, mixed.length || captionMixed ? `섞인 곳: ${[...mixed.map((unit) => `${unit.n}번`), ...(captionMixed ? ["캡션"] : [])].join(", ")}` : "섞임 없음");
  // 근거 유효성: 모델이 원장에 없는 근거 ID를 만들지 않았는가(서버가 지웠더라도 기록).
  const removed = input.removedEvidenceIds ?? [];
  required("evidence", "근거 ID 유효성", !removed.length, removed.length ? `원장에 없는 ID ${removed.length}개(제거됨): ${removed.slice(0, 4).join(", ")}` : `Detail Bank 근거 확인 ${verifiedBank.length}/${bank.length}`);
  // 중복: 같은 내용·같은 디테일을 쓰는 슬라이드.
  const repeats: string[] = [];
  units.forEach((unit, i) => units.slice(i + 1).forEach((other) => {
    const sameDetail = unit.detailIds.length > 0 && unit.detailIds.join() === other.detailIds.join();
    if (ideaSimilarity(unit.body, other.body) >= 0.45 || sameDetail) { repeats.push(`${unit.n}↔${other.n}`); issues.push({ unit: other.n, problem: `${unit.n}번과 내용이 겹침: 다른 디테일로 새 정보를 주기` }); }
  }));
  required("duplicate", "중복 없음", !repeats.length, repeats.length ? `겹치는 슬라이드 ${repeats.join(", ")}` : "겹침 없음");
  // T6 현상 고정: 잠근 현상에서 벗어난 슬라이드(금지 이탈 규칙)와 현상이 드러나지 않는 슬라이드(마지막 CTA 제외 1장까지 허용).
  if (input.lock?.enabled) {
    const lock = input.lock;
    const locked = checkLockUnits(units.map((unit) => ({ n: unit.n, text: `${unit.head} ${unit.body}` })), lock);
    locked.drift.forEach((unit) => issues.push({ unit: unit.n, problem: `잠근 현상에서 벗어남(${unit.hits.join(", ")}): "${lock.selectedPhenomenon}"의 행동·사례로 다시 쓰기` }));
    const titleDrift = driftHits(plan.title, lock);
    if (titleDrift.length) issues.push({ unit: "title", problem: `제목이 잠근 현상에서 벗어남(${titleDrift.join(", ")})` });
    // 경량 잠금(방향 초점)은 초점 문구가 모델이 쓴 한 줄이라 슬라이드마다 그 단어가 나오는지는 보지 않는다(이탈 규칙만).
    if (locked.unanchored.length > 1 && !lock.soft) locked.unanchored.forEach((n) => issues.push({ unit: n, problem: `선택한 현상 "${lock.selectedPhenomenon}"이 드러나지 않음: 이 현상의 행동·사례로 연결하기` }));
    const lockPass = lock.soft ? !locked.drift.length : locked.pass;
    required("context-lock", lock.soft ? "방향 초점 유지(키워드 일반 소개로 넓어지지 않음)" : "현상 고정(Context Lock)", lockPass && !titleDrift.length, `이탈 슬라이드 ${locked.drift.map((unit) => `${unit.n}(${unit.hits.join("·")})`).join(", ") || "없음"}${titleDrift.length ? " · 제목 이탈" : ""}${lock.soft ? ` · 초점 "${lock.selectedPhenomenon}"` : ` · 현상이 드러나지 않는 슬라이드 ${locked.unanchored.join(", ") || "없음"}`}`);
    if (lockEvidenceLimited(lock)) editorial("lock-gaps", "근거 부족을 알림(주제 유지)", (plan.editor_notes?.research_gaps ?? []).length > 0, `현상을 직접 보여 주는 근거 ${lock.observedEvidenceIds.length}건 · 편집 메모의 조사 필요 항목 ${(plan.editor_notes?.research_gaps ?? []).length}개`);
  }

  // E0 G2 허위 경험: TREND RADAR가 하지 않은 1인칭 체험. 사용자가 경험 자료를 준 경우(USER_MATERIALS)만 허용.
  const experienceAllowed = Boolean(input.lock?.userMaterials?.trim());
  const experienced = units.filter((unit) => FIRST_PERSON_EXPERIENCE.test(`${unit.head} ${unit.body}`));
  if (!experienceAllowed) experienced.forEach((unit) => issues.push({ unit: unit.n, problem: "직접 해 본 것처럼 쓴 1인칭 체험: 사용자 경험 자료가 없으면 관측 사실로(\"~한 영상이 있어요\") 바꾸기" }));
  required("experience", "허위 경험 없음", experienceAllowed || !experienced.length, experienced.length ? `1인칭 체험 슬라이드 ${experienced.map((unit) => unit.n).join(", ")}${experienceAllowed ? " (사용자 경험 자료 있음 — 출처 표시 확인)" : ""}` : "없음");
  // E0 G3 근거 없는 유행 주장: 인기·바이럴 표현은 그 슬라이드에 근거 있는 사실 확인이 있을 때만.
  const viral = units.filter((unit) => VIRALITY.test(`${unit.head} ${unit.body}`) && !unit.facts.some((fact) => fact.evidence_ids.length && fact.status === "Verified Signal"));
  const titleViral = VIRALITY.test(plan.title) || VIRALITY.test(plan.caption);
  viral.forEach((unit) => issues.push({ unit: unit.n, problem: "근거 없는 유행·인기 주장: 관측된 것만(\"여러 곳에서 보여요\")으로 바꾸기" }));
  if (titleViral) issues.push({ unit: "title", problem: "제목·캡션의 근거 없는 유행·인기 주장" });
  required("virality", "근거 없는 유행 주장 없음", !viral.length && !titleViral, viral.length || titleViral ? `해당 ${[...viral.map((unit) => `${unit.n}번`), ...(titleViral ? ["제목·캡션"] : [])].join(", ")}` : "없음");

  /* ---------- B. 편집 신호(참고, 통과 여부는 편집 리뷰가 판단) ---------- */
  const genericSentences = units.flatMap((unit) => sentences(`${unit.head}. ${unit.body}`).filter((sentence) => isGenericSentence(sentence, subjectTerms, specificTerms)).map((sentence) => `${unit.n}번: ${sentence}`));
  const genericSlides = units.filter((unit) => sentences(`${unit.head}. ${unit.body}`).every((sentence) => isGenericSentence(sentence, subjectTerms, specificTerms)));
  genericSlides.forEach((unit) => hints.push({ unit: unit.n, problem: "모든 문장이 다른 소재에도 통함(일반 팁·추상 설명)" }));
  editorial("specific", "소재 고유성(스왑 테스트)", genericSlides.length <= 1, `다른 소재에도 통하는 슬라이드 ${genericSlides.map((unit) => unit.n).join(", ") || "없음"}`);
  const middle = units.slice(1, -1);
  const noDetail = middle.filter((unit) => !unit.detailIds.length);
  noDetail.forEach((unit) => hints.push({ unit: unit.n, problem: "Detail Bank 디테일을 쓰지 않음" }));
  editorial("detail-use", "Detail Bank 활용", bank.length > 0 && noDetail.length <= 1, bank.length ? `디테일 ${bank.length}개(근거 ${verifiedBank.length}) · 디테일 없는 본문 슬라이드 ${noDetail.map((unit) => unit.n).join(", ") || "없음"}` : "Detail Bank 없음");
  const narrated = units.filter((unit) => SOURCE_NARRATION.test(`${unit.head} ${unit.body}`));
  narrated.forEach((unit) => hints.push({ unit: unit.n, problem: "출처를 서술하는 문장(보도 요약형)" }));
  editorial("not-report", "보도·분석 요약형 서술이 아님", narrated.length <= 1, narrated.length ? `출처 서술 슬라이드 ${narrated.map((unit) => unit.n).join(", ")}` : "없음");
  // E0 FAILURE 07: 조사·통계 방법을 설명하는 문장(매거진이 아니라 조사 요약).
  const surveyed = units.filter((unit) => SURVEY_NARRATION.test(`${unit.head} ${unit.body}`));
  surveyed.forEach((unit) => hints.push({ unit: unit.n, problem: "조사·통계 방법 서술: 독자가 얻는 것이 없으면 빼거나 장면으로 바꾸기" }));
  editorial("not-survey", "조사·통계 요약형 서술이 아님", !surveyed.length, surveyed.length ? `조사 서술 슬라이드 ${surveyed.map((unit) => unit.n).join(", ")}` : "없음");
  if (isGenericTitle(plan.title)) hints.push({ unit: "title", problem: "흔한 제목 틀" });
  editorial("title", "제목 구조", !isGenericTitle(plan.title), `구조: ${titleStructure(plan.title)}${isGenericTitle(plan.title) ? " · 흔한 틀" : ""} (좋은 후킹인지는 편집 리뷰가 판단)`);
  // V3(E2) 새 정보: 스토리보드가 있는 계획만. 앞 슬라이드와 '새 정보'가 겹치거나 비어 있는 본문 슬라이드(같은 결론 반복, E0 FAILURE 04).
  if (units.some((unit) => unit.newInfo.trim())) {
    const repeated: number[] = [];
    units.forEach((unit, i) => {
      if (i === 0 || i === units.length - 1) return;
      const info = unit.newInfo.trim();
      if (!info) { repeated.push(unit.n); hints.push({ unit: unit.n, problem: "새로 주는 정보가 비어 있음: 앞 장에 없던 정보 하나를 정하기" }); return; }
      const earlier = units.slice(0, i).find((prev) => prev.newInfo.trim() && ideaSimilarity(prev.newInfo, info) >= PROGRESS_OVERLAP);
      if (earlier) { repeated.push(unit.n); hints.push({ unit: unit.n, problem: `${earlier.n}번과 같은 정보를 반복: 이 장에서만 알게 되는 것으로 바꾸기` }); }
    });
    editorial("progressive", "장마다 새 정보(스토리보드)", !repeated.length, repeated.length ? `새 정보가 없거나 겹치는 슬라이드 ${repeated.join(", ")}` : "모두 새 정보");
  }
  const noValue = units.slice(0, -1).filter((unit) => !unit.gets.trim());
  editorial("flow", "슬라이드마다 독자가 얻는 것", !noValue.length, noValue.length ? `비어 있는 슬라이드 ${noValue.map((unit) => unit.n).join(", ")}` : "모두 있음");

  const failing = checks.filter((check) => check.group === "required" && !check.pass).map((check) => check.id);
  const requiredCount = checks.filter((check) => check.group === "required").length;
  return { source: "rule-check", checks, passed: requiredCount - failing.length, total: requiredCount, failing, issues, hints, genericSentences };
}

/** 슬라이드별 문제 종류(issue·hint의 ':' 앞 부분). 수정 전후 비교용. */
export function problemsByUnit(report: QualityReport) {
  const map = new Map<number | "title" | "caption", Set<string>>();
  for (const item of [...report.issues, ...report.hints]) { const kind = item.problem.split(":")[0].replace(/\(.*$/, "").trim(); map.set(item.unit, (map.get(item.unit) ?? new Set()).add(kind)); }
  return map;
}
/**
 * 편집 리뷰가 고친 슬라이드가 원래 없던 문제를 새로 만들면 그 슬라이드만 초안으로 되돌린다(추가 호출 없음).
 * 실측: 리뷰가 표지에 일본어를 넣거나(레트로 게임), 조사 보고형 문장을 넣은(치이카와) 경우가 있었다.
 */
export function revertRegressions(draft: ProductionPlan, patched: ProductionPlan, before: QualityReport, after: QualityReport) {
  const was = problemsByUnit(before), now = problemsByUnit(after);
  const reverted: Array<{ unit: number; problems: string[] }> = [];
  const slides = patched.slides.map((slide) => {
    if (!slide.revised) return slide;
    const added = [...(now.get(slide.number) ?? [])].filter((kind) => !(was.get(slide.number)?.has(kind)));
    if (!added.length) return slide;
    reverted.push({ unit: slide.number, problems: added });
    return draft.slides.find((item) => item.number === slide.number) ?? slide;
  });
  const scenes = patched.scenes.map((scene, index) => {
    if (!scene.revised) return scene;
    const added = [...(now.get(index + 1) ?? [])].filter((kind) => !(was.get(index + 1)?.has(kind)));
    if (!added.length) return scene;
    reverted.push({ unit: index + 1, problems: added });
    return draft.scenes[index] ?? scene;
  });
  return { plan: { ...patched, slides, scenes }, reverted };
}

/** 필수 검증이 하나라도 실패하면 해당 슬라이드를 고쳐 써야 한다. */
export const needsRewrite = (report: QualityReport) => report.failing.length > 0;

/** 편집 리뷰의 부분 수정. 바뀐 필드만 바꾸고, 고친 슬라이드에는 이유를 남긴다. 다른 슬라이드는 건드리지 않는다. */
export type SlidePatch = { number: number; headline: string; body: string; supporting_text: string; fact_checks: NonNullable<ProductionPlan["slides"][number]["fact_checks"]>; detail_ids: string[]; reason: string };
export function applyPatches(plan: ProductionPlan, patches: SlidePatch[], title: string): { plan: ProductionPlan; patched: Array<{ unit: number | "title"; reason: string }>; titleChange?: { from: string; to: string } } {
  const patched: Array<{ unit: number | "title"; reason: string }> = [];
  const byNumber = new Map(patches.map((patch) => [patch.number, patch]));
  const slides = plan.slides.map((slide) => {
    const patch = byNumber.get(slide.number);
    if (!patch) return slide;
    patched.push({ unit: slide.number, reason: patch.reason });
    return { ...slide, headline: patch.headline || slide.headline, body: patch.body || slide.body, supporting_text: patch.supporting_text, fact_checks: patch.fact_checks, detail_ids: patch.detail_ids.length ? patch.detail_ids : slide.detail_ids, revised: patch.reason };
  });
  const scenes = plan.scenes.map((scene, index) => {
    const patch = plan.slides.length ? undefined : byNumber.get(index + 1);
    if (!patch) return scene;
    patched.push({ unit: index + 1, reason: patch.reason });
    return { ...scene, on_screen_text: patch.headline || scene.on_screen_text, voice_over: patch.body || scene.voice_over, fact_checks: patch.fact_checks, detail_ids: patch.detail_ids.length ? patch.detail_ids : scene.detail_ids, revised: patch.reason };
  });
  const next = title.trim() && title.trim() !== plan.title ? title.trim() : "";
  if (next) patched.push({ unit: "title", reason: "편집 리뷰 제목 수정" });
  return { plan: { ...plan, title: next || plan.title, slides, scenes }, patched, ...(next ? { titleChange: { from: plan.title, to: next } } : {}) };
}
