import { z } from "zod";
import { ideaSimilarity } from "./creative-collision";

/*
 * CONTENT STUDIO EDITORIAL ENGINE (E1~E5).
 * - WHY·DNA·Culture Map은 "내부 리서치 자료"다. 분석 결과를 그대로 콘텐츠로 옮기지 않는다.
 * - 흐름: 트렌드(또는 Creative 아이디어) → 콘텐츠 모드 → 콘텐츠 방향(Angle) 5개 → 사용자가 선택 → 카드뉴스·숏폼.
 * - 게시용 콘텐츠(PUBLISHING)와 제작자 검증 메모(EDITOR NOTES)를 나눈다. 서버 검증은 그대로 적용한다.
 */
export const EDITORIAL_PROMPT_VERSION = "studio-editorial-v5";
/**
 * v5(EDITORIAL ENGINE V3 · E1): 현상 중심 방향 — 방향마다 초점(focus: 구체적 현상·행동·장면)을 정하고,
 * 키워드의 역사·입문·준비물 방향을 기본값으로 만들지 않는다(E0 실패 분석 FAILURE 01·10). 사용자 지정 주제가 여전히 최우선.
 */
export const ANGLE_PROMPT_VERSION = "studio-angles-v6";

export const contentModes = ["editorial", "digging", "curation", "concept", "report"] as const;
export type ContentMode = (typeof contentModes)[number];
export const DEFAULT_CONTENT_MODE: ContentMode = "editorial";
export const contentModeInfo: Record<ContentMode, { label: string; short: string; description: string; examples: string[] }> = {
  editorial: { label: "TREND EDITORIAL", short: "에디토리얼", description: "소재 안에서 지금 일어나는 구체적인 현상·장면을 골라 재미있게 보여 줘요. 키워드 소개·검색량 분석이 주제가 아니에요.", examples: ["아웃송에 맞춰 추는 응원, 삐끼삐끼", "로블록스 눈매를 현실 얼굴에 옮기면"] },
  digging: { label: "CULTURE DIGGING", short: "컬처 디깅", description: "팬덤 의식·장면의 의미·숨은 이야기를 파고들어요. 역사·기원은 지금의 현상을 이해하는 데 필요할 때만.", examples: ["타이거즈 응원석이 색으로 하나가 되는 순간", "보컬로이드 팬들이 생일을 함께 축하하는 방식"] },
  curation: { label: "CURATION", short: "큐레이션", description: "실제로 있는 장소·콘텐츠·제품·경험을 골라 소개해요. 없는 것을 추천하지 않아요.", examples: ["야구 입문자에게 추천하는 응원 아이템", "레트로 감성 카메라 콘텐츠 모음"] },
  concept: { label: "CREATIVE CONCEPT", short: "크리에이티브 콘셉트", description: "Creative Collision의 가상 제품·캠페인·팝업 아이디어를 콘텐츠로 만들어요. 가상 콘셉트임을 표시해요.", examples: ["필터 대신 프레임, 네 컷 사진 부스(콘셉트 제안)"] },
  report: { label: "TREND REPORT", short: "트렌드 리포트", description: "기존 WHY 기반 분석 보고서형. 검색 관심도·변화·배경·근거와 한계를 설명해요.", examples: ["헤이세이 레트로, 검색 관심도로 본 6개월"] },
};
export const parseContentMode = (value: unknown, fallback: ContentMode = DEFAULT_CONTENT_MODE): ContentMode => (contentModes as readonly string[]).includes(value as string) ? value as ContentMode : fallback;

/* ---------- E2 콘텐츠 방향(Angle) ---------- */

export const evidenceFits = ["grounded", "partial", "needs_research"] as const;
/**
 * V3(E1) 편집 유형(E0 Taxonomy A~F). 콘텐츠 모드가 아니라 방향(브리프)의 필드다 — 모드는 그대로 두고 유형이 구조·후킹을 정한다.
 * 리뷰·비교(D)는 사용자 경험 자료가 없으면 경험 후기가 아니라 같은 기준의 정보 비교로 쓴다.
 */
export const editorialTypes = ["decoding", "curation", "experience", "comparison", "micro", "collision"] as const;
export type EditorialType = (typeof editorialTypes)[number];
export const editorialTypeLabels: Record<EditorialType, string> = { decoding: "A 문화 해석", curation: "B 트렌드 큐레이션", experience: "C 경험 제안", comparison: "D 비교", micro: "E 마이크로 현상", collision: "F 문화 결합" };
/** 유형별 기본 스토리 구조(제작 프롬프트에 한 줄로). */
export const editorialTypeStructure: Record<EditorialType, string> = {
  decoding: "CULTURE DECODING: scene → what fans read in it → where that reading comes from (official vs fan interpretation, say which) → repeat with new scenes → what to look for next time. Warn about spoilers on the cover if any.",
  curation: "TREND CURATION: define the scope (item, place, period) → N real items, each with what makes it different under the same criteria → how to choose. Only real items; no invented names, prices or addresses.",
  experience: "EXPERIENCE GUIDE: a route or sequence the reader can follow (where, what, in which order) with real places or steps — never written as the editor's own visit.",
  comparison: "COMPARISON: fix the criteria first → each option on the same criteria → who each one suits. Without user-provided experience this is an information comparison, not a first-person review.",
  micro: "MICRO PHENOMENON: the scene/behavior itself → who does it and how → concrete observed examples → what to notice when you watch it. Keep claims modest when evidence is limited.",
  collision: "CULTURAL COLLISION: where the two cultures actually meet (an observed behavior) → examples → what each side brings → keep any AI-proposed combination clearly marked as an idea, not a fact.",
};
/** 독자 가치 유형: 읽고 나서 얻는 것. */
export const readerValueTypes = ["learn", "do", "choose", "feel", "save"] as const;
export type ReaderValueType = (typeof readerValueTypes)[number];
export const readerValueLabels: Record<ReaderValueType, string> = { learn: "알게 됨", do: "따라 할 수 있음", choose: "고를 수 있음", feel: "공감·재미", save: "저장 리스트" };
/** 독자 경험 유형. 소재에 맞는 것을 고르며, 모든 키워드에 같은 다섯 가지를 기계적으로 쓰지 않는다. */
export const angleTypes = ["guide", "fandom", "history", "curation", "experience", "people", "howto", "comparison", "behind", "trivia", "custom"] as const;
export type AngleType = (typeof angleTypes)[number];
export const angleTypeLabels: Record<AngleType, string> = { guide: "입문·가이드", fandom: "팬덤·문화", history: "역사·스토리", curation: "큐레이션·추천", experience: "체험·라이프스타일", people: "인물", howto: "하우투", comparison: "비교", behind: "비하인드", trivia: "알쓸·퀴즈", custom: "사용자 지정" };
export const evidenceFitLabels: Record<(typeof evidenceFits)[number], string> = { grounded: "근거 충분", partial: "일부 근거", needs_research: "추가 리서치 필요" };
export const contentAngleSchema = z.object({
  angle_id: z.string().max(80),
  title: z.string().trim().min(1).max(120),
  hook: z.string().trim().max(200),
  editorial_perspective: z.string().trim().max(400),
  target_audience: z.string().trim().max(200),
  reader_benefit: z.string().trim().max(300),
  content_structure: z.array(z.string().trim().max(200)).max(10),
  suggested_visuals: z.array(z.string().trim().max(240)).max(6),
  research_requirements: z.array(z.string().trim().max(240)).max(6),
  evidence_ids: z.array(z.string().max(80)).max(12),
  evidence_fit: z.enum(evidenceFits),
  /** v3: 독자 경험 유형. 이전에 저장된 방향에는 없다. */
  angle_type: z.enum(angleTypes).optional(),
  /** v3: 리서치의 특정 사건·기사 하나를 중심으로 한 방향이면 그 항목, 아니면 빈 문자열. 5개 중 최대 2개. */
  research_anchor: z.string().max(200).optional(),
  /** v5(E1): 이 방향이 다루는 구체적인 현상·행동·장면 한 줄(키워드 자체가 아님). 이전에 저장된 방향에는 없다. */
  focus: z.string().trim().max(200).optional(),
  /** v6(E1 브리프): 편집 유형(A~F), 독자 가치 유형, 대표 장면(표지 이미지가 될 한 장면). */
  editorial_type: z.enum(editorialTypes).optional(),
  reader_value: z.enum(readerValueTypes).optional(),
  key_scene: z.string().trim().max(240).optional(),
});
export type ContentAngle = z.infer<typeof contentAngleSchema>;
export const angleResultSchema = z.object({ angles: z.array(contentAngleSchema) });

/** 소재와 상관없이 반복되는 제목. 이런 제목은 다시 생성 대상이다. */
export const GENERIC_TITLE_PATTERNS = [/요즘\s*(뜨는|핫한|유행하는)/, /인기\s*있는\s*이유/, /인기의?\s*비결/, /트렌드\s*(완벽\s*)?(분석|정리)/, /완벽\s*(분석|정리|가이드)$/, /의\s*모든\s*것$/, /알아보자$/, /왜\s*인기일까/, /,\s*어디서\s*(시작|왔|만났|만날)/, /(뭘|뭐부터|어디부터|무엇부터)\s*(보면|볼까|찍을까|시작할까)/];
export const isGenericTitle = (title: string) => GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(title));

/*
 * V2.1 제목 구조. 단어 금지 목록만으로는 다른 틀로 옮겨 갈 뿐이라(v2 "어디서…" → v3 "뭐부터…"), 문장 구조로 다양성을 본다.
 * 좋은 후킹인지는 이 분류로 판정하지 않는다(편집 리뷰가 참고 점수로 본다). 같은 구조가 몰리는 것만 막는다.
 */
export const titleStructures = ["subject-comma-question", "question", "number-list", "contrast", "quote", "howto", "statement"] as const;
export type TitleStructure = (typeof titleStructures)[number];
export const titleStructureLabels: Record<TitleStructure, string> = { "subject-comma-question": "‹소재›, 질문?", question: "질문형", "number-list": "숫자·목록형", contrast: "대비형(A 대신 B)", quote: "인용·말하기형", howto: "방법형", statement: "단언·장면형" };
export function titleStructure(title: string): TitleStructure {
  const text = title.trim();
  if (/^[^,，]{1,20}[,，]\s*[^,，]+(\?|까|나요|ㄹ까|을까|일까|볼까|할까)\??$/.test(text)) return "subject-comma-question";
  if (/[‘'“"「『].+[’'”"」』]/.test(text) || /라고\s*(해요|했|말)/.test(text)) return "quote";
  if (/\d+\s*(가지|곡|개|장|곳|단계|명|번|분|시간|km)|[①-⑩]/.test(text)) return "number-list";
  if (/대신|말고|보다|아니라|vs|VS/.test(text)) return "contrast";
  if (/(하는|만드는|고르는|즐기는|찍는|꾸미는|익히는)\s*(법|방법|순서)|하려면|가이드$|(하기|만들기|시작하기|고르기|꾸미기)$/.test(text)) return "howto";
  if (/\?$|까$|나요$/.test(text)) return "question";
  return "statement";
}
export const MAX_SAME_STRUCTURE = 2;
export const MAX_SUBJECT_COMMA_QUESTION = 1;
export const ANGLE_DUPLICATE_THRESHOLD = 0.45;
export const ANGLE_COUNT = 5;

export type AngleValidation = {
  removedEvidenceIds: string[]; genericTitles: string[]; droppedDuplicates: string[]; downgradedFit: number; regenerated?: boolean;
  /** v3: 리서치 사건 중심 방향 수, 서로 다른 독자 경험 유형 수, 사용자 지정 주제에서 벗어난 방향. */
  anchored?: number; typeCount?: number; offTopic?: string[];
  /** T6: 잠근 현상에서 벗어난 방향(금지 이탈 규칙에 걸리거나 현상 핵심어가 없음). */
  lockDrift?: string[];
  /** V2.1: 제목 구조 분포와 몰린 구조. */
  structures?: Partial<Record<TitleStructure, number>>; crowdedStructures?: TitleStructure[];
  /** V3(E1): 서로 다른 초점(현상·장면) 수, 키워드의 역사·기원·입문·준비물을 다루는 방향(기본값으로 두지 않음). */
  focusCount?: number; basicAngles?: string[];
};
export const MAX_ANCHORED_ANGLES = 2;
/** 키워드 자체의 역사·기원·입문·준비물 방향(E0 FAILURE 10). 사용자 주제가 요청하지 않았다면 5개 중 1개까지. */
const BASIC_ANGLE = /역사|기원|유래|어디서\s*(왔|시작)|탄생|시초|출발점|입문|초보|첫\s*직관|준비물|뭐부터|어디부터|기초|정의/;
export const isBasicAngle = (angle: Pick<ContentAngle, "title" | "editorial_perspective">) => BASIC_ANGLE.test(`${angle.title} ${angle.editorial_perspective}`);
export const MAX_BASIC_ANGLES = 1;
/** 초점이 비슷하면 같은 현상으로 센다(초점이 없는 이전 방향은 제목으로). */
function distinctFocusCount(angles: ContentAngle[]) {
  const kept: string[] = [];
  for (const angle of angles) { const focus = (angle.focus || angle.title).trim(); if (!kept.some((prev) => ideaSimilarity(prev, focus) >= ANGLE_DUPLICATE_THRESHOLD)) kept.push(focus); }
  return kept.length;
}
/**
 * 사용자 지정 주제에서 벗어난 방향 검출: 주제의 핵심 단어(조사·어미를 뗀 2자 이상, 흔한 말 제외)가 방향 글에 하나도 없으면 이탈.
 * (실측: 글자 2-gram 유사도 기준은 짧은 제목에서 주제를 지킨 방향 5개를 모두 이탈로 잘못 판정했다.)
 * 단어 기준도 완벽하지 않아(관련 단어만 들어간 다른 소재를 못 잡음) 재생성 조건에 쓰지 않고 "확인 필요" 표시로만 쓴다.
 */
const TOPIC_SYNONYMS: Record<string, string[]> = { 처음: ["첫"], 야구장: ["직관", "경기장", "구장"], 입덕: ["입문", "팬"], 가이드: ["안내", "준비", "방법"] };
const TOPIC_STOP = new Set(["위한", "사람", "가는", "하는", "대한", "관한", "있는", "모든", "우리", "콘텐츠", "이야기"]);
const topicStem = (word: string) => word.replace(/(으로|에서|에게|까지|부터|처럼|하는|에는|이라|이란|은|는|이|가|을|를|의|에|도|와|과|로)$/u, "");
export const topicWords = (text: string) => [...new Set((text.match(/[\p{L}\p{N}]{2,}/gu) ?? []).map((word) => topicStem(word.toLocaleLowerCase("ko-KR"))).filter((word) => word.length >= 2 && !TOPIC_STOP.has(word)))];
export function isOffTopic(topic: string, angle: Pick<ContentAngle, "title" | "hook" | "editorial_perspective" | "reader_benefit" | "target_audience">) {
  const keys = topicWords(topic);
  if (!keys.length) return false;
  const text = `${angle.title} ${angle.hook} ${angle.editorial_perspective} ${angle.reader_benefit} ${angle.target_audience}`.toLocaleLowerCase("ko-KR");
  return !keys.some((key) => [key, ...(TOPIC_SYNONYMS[key] ?? [])].some((word) => text.includes(word)));
}

/** 서버 검증: 없는 근거 ID 제거(근거가 사라지면 evidence_fit 하향), 같은 방향 반복 제거, 뻔한 제목 표시. */
export function validateAngles(raw: { angles: ContentAngle[] }, ledgerIds: string[], customTopic = ""): { angles: ContentAngle[]; validation: AngleValidation } {
  const ledger = new Set(ledgerIds);
  const removed: string[] = [], genericTitles: string[] = [], droppedDuplicates: string[] = [];
  let downgradedFit = 0;
  const kept: ContentAngle[] = [];
  for (const angle of raw.angles) {
    const text = `${angle.title} ${angle.editorial_perspective}`;
    if (kept.some((prev) => ideaSimilarity(`${prev.title} ${prev.editorial_perspective}`, text) >= ANGLE_DUPLICATE_THRESHOLD)) { droppedDuplicates.push(angle.title); continue; }
    const evidence_ids = [...new Set(angle.evidence_ids)].filter((id) => { const ok = ledger.has(id); if (!ok) removed.push(id); return ok; });
    let evidence_fit = angle.evidence_fit;
    if (evidence_fit === "grounded" && !evidence_ids.length) { evidence_fit = "needs_research"; downgradedFit += 1; }
    if (isGenericTitle(angle.title)) genericTitles.push(angle.title);
    kept.push({ ...angle, angle_id: `angle-${kept.length + 1}`, evidence_ids, evidence_fit });
  }
  const angles = kept.slice(0, ANGLE_COUNT);
  const topic = customTopic.trim();
  const offTopic = topic ? angles.filter((angle) => isOffTopic(topic, angle)).map((angle) => angle.title) : [];
  const structures: Partial<Record<TitleStructure, number>> = {};
  for (const angle of angles) { const kind = titleStructure(angle.title); structures[kind] = (structures[kind] ?? 0) + 1; }
  // statement는 다른 구조에 걸리지 않은 제목을 모두 받는 기본값이라 몰림으로 세지 않는다(실측: 구체적이고 다양한 제목 4개를 몰림으로 오판해 불필요한 재생성 2회).
  const crowdedStructures = (Object.entries(structures) as Array<[TitleStructure, number]>).filter(([kind, count]) => kind !== "statement" && count > (kind === "subject-comma-question" ? MAX_SUBJECT_COMMA_QUESTION : MAX_SAME_STRUCTURE)).map(([kind]) => kind);
  return { angles, validation: { structures, crowdedStructures, removedEvidenceIds: [...new Set(removed)], genericTitles, droppedDuplicates, downgradedFit, anchored: angles.filter((angle) => angle.research_anchor?.trim()).length, typeCount: new Set(angles.map((angle) => angle.angle_type ?? "custom")).size, offTopic, focusCount: distinctFocusCount(angles), basicAngles: angles.filter(isBasicAngle).map((angle) => angle.title) } };
}
/**
 * 다시 만들 조건: 방향 부족·뻔한 제목·리서치 사건 중심 방향 과다·같은 제목 구조 몰림, 그리고 지정 주제가 없을 때
 * 서로 다른 초점(현상·장면) 4개 미만 또는 역사·입문·준비물 방향 2개 이상. 주제 이탈은 표시만 한다.
 * (V2의 "독자 경험 유형 4개 이상" 강제는 매번 역사·입문 방향을 끼워 넣어 V3에서 뺐다 — typeCount는 표시용으로 남긴다.)
 */
export function needsAngleRegeneration(result: { angles: ContentAngle[]; validation: AngleValidation }, customTopic = "") {
  const v = result.validation;
  const free = !customTopic.trim();
  return result.angles.length < 4 || (v.lockDrift?.length ?? 0) > 0 || v.genericTitles.length >= 2 || (v.anchored ?? 0) > MAX_ANCHORED_ANGLES || (free && ((v.focusCount ?? 5) < 4 || (v.basicAngles?.length ?? 0) > MAX_BASIC_ANGLES)) || (v.crowdedStructures?.length ?? 0) > 0;
}

/** 사용자가 입력한 주제를 AI 제안 없이 그대로 방향으로 쓴다. */
export function customAngle(topic: string, target = ""): ContentAngle {
  const title = topic.trim().slice(0, 120);
  return { angle_id: "angle-custom", title, hook: "", editorial_perspective: title, target_audience: target, reader_benefit: "", content_structure: [], suggested_visuals: [], research_requirements: [], evidence_ids: [], evidence_fit: "needs_research", angle_type: "custom", research_anchor: "" };
}

/* ---------- E4·E5 게시용 문구 검사 ---------- */

/** TREND REPORT가 아닌 모드에서 게시용 문구에 반복되면 안 되는 분석 보고서식 표현. */
export const REPORT_PHRASES = ["상대 검색 관심도", "상대 지수", "제공된 자료만으로", "확인할 수 없습니다", "절대 검색량", "검색량 상승의 인과", "인과관계를 단정", "근거의 한계", "분석 기간"] as const;
export const findReportPhrases = (text: string) => REPORT_PHRASES.filter((phrase) => text.replace(/\s+/g, " ").includes(phrase));

/** 게시용 문구에 섞인 내부 근거 ID(T1:IG-03, [YT-01], (근거: …))를 지운다. 출처 표기는 Editor Notes에서 한다. */
const INTERNAL_REF = /\s*(?:\[\s*(?:T\d+:)?[A-Z]{2,6}-\d{1,3}(?:\s*,\s*(?:T\d+:)?[A-Z]{2,6}-\d{1,3})*\s*\]|\(\s*근거[^)]*\)|\bT\d+:[A-Z]{2,6}-\d{1,3}\b)/g;
export function stripInternalRefs(text: string) {
  const cleaned = text.replace(INTERNAL_REF, "").replace(/[ \t]{2,}/g, " ").replace(/\s+([.,!?。])/g, "$1").trim();
  return { text: cleaned, changed: cleaned !== text.trim() };
}

/** 가상 콘셉트 표시 기본 문구(모델이 비워 둔 경우). */
export const CONCEPT_NOTICE_DEFAULT = "가상의 콘셉트 제안이에요. 실제로 출시되거나 운영 중인 상품·공간·캠페인이 아닙니다.";
