import "server-only";
import { callStructured, js } from "./openai-client";
import { buildMultiContext } from "./openai-insight";
import { ideaSimilarity } from "./creative-collision";
import { angleResultSchema, ANGLE_COUNT, angleTypes, contentModeInfo, editorialTypes, evidenceFits, GENERIC_TITLE_PATTERNS, MAX_ANCHORED_ANGLES, MAX_BASIC_ANGLES, needsAngleRegeneration, readerValueTypes, validateAngles, type ContentAngle, type ContentMode } from "./editorial";
import type { ObservedPhenomenon } from "./schemas";
import type { CreativeConcept } from "./content-production";
import type { EvidenceItem, TrendContext } from "./schemas";
import { driftHits, lockAnchored, lockInstructions, type EditorialContextLock } from "./editorial-lock";

/*
 * EDITORIAL RESEARCH (ENGINE V2).
 * 진단(2026-11-02 실측): v2 방향 5개가 근거 원장의 웹 항목 5개와 1:1로 대응했다([배경]→기원, [확산 콘텐츠]→삐끼삐끼, [사건]→퍼레이드 …).
 * 방향 생성에 WHY 사건·원인과 발췌 전문을 넣고 "근거 충분"을 좋은 방향처럼 다룬 것이 원인이었다.
 * v3: ① 방향은 소재 자체에서 출발한다(리서치는 제목 목록만, 사건 중심 방향은 최대 2개)
 *     ② 방향을 고른 뒤 그 방향에 맞는 자료만 골라 제작에 넘긴다 ③ WHY 사건·원인·검색 관심도는 제작에 넘기지 않는다(TREND REPORT 제외).
 */
const subjectBasics = (trend: TrendContext, ref: string) => ({
  ref, name: trend.name, keywords: trend.keywords,
  what: trend.why.what?.summary ?? trend.why.overview?.summary ?? null,
  // DNA는 소재의 "느낌"을 잡는 어휘로만 넘긴다(근거 ID 없이).
  feel: trend.dna ? trend.dna.dimensions.map((dimension) => ({ dimension: dimension.dimension, attributes: dimension.attributes.filter((attribute) => attribute.status !== "Insufficient Evidence").map((attribute) => attribute.label).slice(0, 4) })) : null,
});
const ledgerOf = (trends: TrendContext[]) => trends.flatMap((trend, index) => trend.evidence.map((item) => ({ ...item, id: `T${index + 1}:${item.id}` })));

/**
 * 방향 제안용: 소재 기본 정보 + 리서치 "제목" 목록만(발췌·WHY 사건 없음).
 * V3(E1): 이 키워드로 WHAT'S HAPPENING NOW?를 실행한 기록이 있으면 그 세부 현상 후보(제목·행동·관측 상태·독립 출처 수)도 넣는다.
 * 현상 후보의 근거 ID는 다른 원장(Discovery)의 것이라 넣지 않는다 — 방향의 근거 ID는 이 소재 원장에서만.
 */
export function buildAngleContext(trends: TrendContext[], mode: ContentMode, phenomena: ObservedPhenomenon[] = []) {
  if (mode === "report") return buildMultiContext(trends);
  const ledger = ledgerOf(trends);
  return { ledger, prompt: JSON.stringify({ subjects: trends.map((trend, index) => subjectBasics(trend, `T${index + 1}`)), observed_phenomena: phenomena.map(({ title, behavior, status, independentSources }) => ({ title, behavior, status, independent_sources: independentSources })), research_titles: ledger.filter((item) => item.kind !== "naver_series").map(({ id, kind, title }) => ({ id, kind, title })) }) };
}

/** 선택한 방향에 맞는 자료만 고른다: 방향이 인용한 근거 → 방향 글과 겹치는 자료 순, 최대 8개. 검색 관심도 시계열은 넣지 않는다. */
export function researchForAngle(ledger: EvidenceItem[], angle: ContentAngle | undefined, limit = 8) {
  if (!angle) return [];
  const angleText = [angle.title, angle.hook, angle.editorial_perspective, angle.reader_benefit, ...angle.content_structure, ...angle.research_requirements].join(" ");
  const cited = new Set(angle.evidence_ids);
  return ledger.filter((item) => item.kind !== "naver_series")
    .map((item) => ({ item, score: cited.has(item.id) ? 1 : ideaSimilarity(angleText, `${item.title} ${item.excerpt}`) }))
    .filter((entry) => entry.score >= 0.06).sort((a, b) => b.score - a.score).slice(0, limit).map((entry) => entry.item);
}

/** 제작용: 소재 기본 정보 + 방향에 맞는 자료(방향 맞춤 추가 조사 결과가 있으면 맨 앞). TREND REPORT는 기존 분석 전체. */
export function buildProductionContext(trends: TrendContext[], mode: ContentMode, angle: ContentAngle | undefined, angleResearch: EvidenceItem[] = [], priorityIds: string[] = []) {
  if (mode === "report") return buildMultiContext(trends);
  const ledger = [...angleResearch, ...ledgerOf(trends)];
  // T6: 잠근 현상을 직접 보여 주는 근거는 방향 유사도와 관계없이 먼저 넣는다.
  const priority = ledgerOf(trends).filter((item) => priorityIds.includes(item.id));
  const research = [...angleResearch, ...priority, ...researchForAngle(ledgerOf(trends), angle, Math.max(4, 8 - angleResearch.length)).filter((item) => !priorityIds.includes(item.id))].slice(0, Math.max(8, angleResearch.length + priority.length));
  const limits = trends.flatMap((trend) => [...(trend.why.missingEvidence ?? []), ...(trend.why.origin?.evidenceIds?.length ? [] : ["기원(최초 시작점)은 수집 자료로 확인되지 않음"])]);
  return { ledger, research, prompt: JSON.stringify({ subjects: trends.map((trend, index) => subjectBasics(trend, `T${index + 1}`)), research_for_angle: research.map(({ id, kind, title, date, source, excerpt }) => ({ id, kind, title, date, source, excerpt })), internal_limits: limits }) };
}

const angleJsonSchema = js.obj({
  angles: js.arr(js.obj({
    angle_id: js.str, angle_type: js.enumOf(angleTypes.filter((type) => type !== "custom")), focus: js.str, editorial_type: js.enumOf(editorialTypes), reader_value: js.enumOf(readerValueTypes), key_scene: js.str, title: js.str, hook: js.str, editorial_perspective: js.str, target_audience: js.str, reader_benefit: js.str,
    content_structure: js.strArr, suggested_visuals: js.strArr, research_requirements: js.strArr, research_anchor: js.str, evidence_ids: js.strArr, evidence_fit: js.enumOf(evidenceFits),
  })),
});

const modeGuide: Record<ContentMode, string> = {
  editorial: "TREND EDITORIAL: pick one specific thing happening inside the subject (a behavior, scene, ritual, meme, look, object people use now) and show it in a fun, approachable way. Introducing the subject in general, search volume or analysis is NOT the topic.",
  digging: "CULTURE DIGGING: explore fandom rituals, the meaning of specific scenes or memes, and hidden stories inside the subject. History or origin only when it explains a phenomenon happening now — never as the main topic.",
  curation: "CURATION: introduce real places, content, products or experiences related to the subject. Only items that appear in the research or are unmistakably real and well known; never invent items, prices, addresses or availability.",
  concept: "CREATIVE CONCEPT: turn the given Creative Collision concept (a HYPOTHETICAL product, space, campaign or pop-up) into content. Always present it as a concept proposal, never as a real launch.",
  report: "TREND REPORT: explain the trend as an analysis — search interest changes, background, evidence and limits.",
};

export const STYLE = "Korean, natural 해요체 like a Korean SNS content editor in their 20s; short clear sentences; no report tone; no stacked adjectives or AI-ish filler (e.g. '감성 가득', '매력 넘치는', '특별한 경험'); minimal jargon.";
export const FACT_RULE = "FACTS: the research items are real collected sources (ids like T1:WEB-03). Well-established public knowledge is allowed only when it directly explains the chosen phenomenon — never fill slides with founding dates, records, definitions or the history of the subject. Never invent numbers, records, dates, quotes, people, prices or collaborations. Any factual statement not backed by a research id must be marked for verification (not stated as certain).";
/** E0 원칙 11·12: TREND RADAR는 체험하지 않았고, 관측 근거 없이 유행을 말하지 않는다. 제작·편집 리뷰 공통. */
export const TRUST_RULE = "TRUST: never write a first-person experience (I/we ate, visited, tried, bought — '직접 먹어봤', '가 봤는데', '써 봤더니', '솔직 후기') unless USER_MATERIALS provide that experience, and then attribute it to the user. Never claim popularity or virality ('요즘 난리난', '대세', '핫한', '바이럴', '품절 대란', '급상승', '1위') unless a cited research item states it; otherwise describe what is observed ('이런 영상이 있어요', '여러 곳에서 보여요').";

const angleInstructions = (mode: ContentMode, hasConcept: boolean, customTopic: string) => [
  "You are the planning editor of TREND RADAR Content Studio. Think like an SNS content editor who finds what is fun about a subject — not like an analyst summarizing research. Propose content angles BEFORE any copy is written. Return only the JSON schema.",
  modeGuide[mode],
  customTopic
    ? `USER TOPIC (highest priority): the user wrote the topic "${customTopic}". All ${ANGLE_COUNT} angles must be about exactly this topic — different ways to tell it (structure, entry point, tone, reader situation). Never switch to another subject, event or trend from the research.`
    : `PHENOMENON FIRST: do not explain the keyword — find what is actually happening inside it. Start from OBSERVED_PHENOMENA (real candidates found by WHAT'S HAPPENING NOW?; prefer OBSERVED, treat EMERGING as an early limited signal) and, if none fit, from concrete behaviors, scenes, rituals, memes, looks or objects inside this subject. Each angle has focus: ONE specific phenomenon, behavior or scene in one line (never just the keyword). The ${ANGLE_COUNT} angles must cover at least 4 different focuses; angle_type is free (guide, fandom, history, curation, experience, people, howto, comparison, behind, trivia). Do not propose the history/origin of the subject, a definition, or a generic beginner/preparation guide (at most ${MAX_BASIC_ANGLES} such angle, and only if it is tied to a specific phenomenon). Example for a baseball team: the out-song cheer dance and where it came from on the field, how the stands match team colors in the postseason — scenes and behaviors, not 'the team'.`,
  `RESEARCH_TITLES are optional seasoning, NOT a menu of topics. Do not turn research items into angles one by one. At most ${MAX_ANCHORED_ANGLES} angles may be built around one specific event or news item from the research; for those set research_anchor to that item (title or id), for all others research_anchor is an empty string. Never build an angle around search interest or analysis limits.`,
  hasConcept ? "The CREATIVE_CONCEPT is hypothetical. Every angle must keep it a concept proposal (e.g. '이런 팝업이 있다면'), never imply it exists or is officially licensed." : "",
  `title: Korean, concrete and specific to THIS subject, makes a reader curious, ideally <= 28 characters. Never use template titles like these patterns: ${GENERIC_TITLE_PATTERNS.map((pattern) => pattern.source).join(" | ")}. A title must not work if you swap in another subject's name. Vary the title STRUCTURE across the 5 angles (a concrete scene, a number or list, a contrast like "A 대신 B", a quote, a how-to, a question) — at most one "‹subject›, question?" title and at most two of the same structure. No clickbait claims that cannot be supported.`,
  "BRIEF per angle: editorial_type — decoding (meaning of scenes/memes/works), curation (real items gathered under one scope), experience (a route or way to enjoy it with real places/steps), comparison (options on the same criteria; without user experience it is an information comparison, never a first-person review), micro (one small behavior or scene), collision (two cultures that actually meet; AI ideas marked as ideas). reader_value — learn, do, choose, feel or save (a list worth saving). key_scene — the one scene a designer would put on the cover to show this angle (people doing the focus behavior), not a logo or a generic picture of the subject. hook: the first-slide line. editorial_perspective: the editor's point of view. target_audience and reader_benefit: who reads and what they actually get (to learn, to do, to feel). content_structure: 4-8 story beats (what each slide gives the reader), not a list of research items. suggested_visuals: 2-4 concrete visual ideas. research_requirements: concrete facts to check or find before publishing.",
  "evidence_ids: research ids that support the angle (may be empty). evidence_fit: grounded, partial, or needs_research. A good angle may need new research — that is fine; do not prefer an angle just because research exists.",
  `Write in ${STYLE}`,
  FACT_RULE,
  TRUST_RULE,
].filter(Boolean).join(" ");

export async function createAngles(trends: TrendContext[], concept: CreativeConcept | undefined, mode: ContentMode, settings: { format: string; target: string; goal: string; tone?: string }, customTopic = "", lock?: EditorialContextLock, phenomena: ObservedPhenomenon[] = []) {
  // 잠금이 있으면 이미 하나의 현상에 고정돼 있어 후보 목록을 넣지 않는다.
  const context = buildAngleContext(trends, mode, lock?.enabled ? [] : phenomena);
  const topic = customTopic.trim();
  const input = `MODE: ${contentModeInfo[mode].label}\n${context.prompt}\nCREATIVE_CONCEPT: ${JSON.stringify(concept ?? null)}\nUSER_TOPIC: ${topic || "(none)"}\nFORMAT: ${settings.format}\nUSER_TARGET: ${settings.target || "(none)"}\nUSER_TONE: ${settings.tone || "(none)"}\nUSER_GOAL: ${settings.goal || "(none)"}`;
  const ids = context.ledger.map((item) => item.id);
  const call = async (extra = "") => {
    const { data, model } = await callStructured({ name: "content_angles", jsonSchema: angleJsonSchema, validator: angleResultSchema, instructions: angleInstructions(mode, Boolean(concept), topic) + (lock ? ` ${lockInstructions(lock, "angles")}` : "") + extra, input: lock ? `${input}\nCONTEXT_LOCK: ${JSON.stringify({ phenomenon: lock.selectedPhenomenon, parent_keyword: lock.parentKeyword, core_behavior: lock.coreBehavior, editorial_focus: lock.editorialFocus, prohibited: lock.prohibitedTopicDrift.map((item) => item.label), user_materials: lock.userMaterials })}` : input, maxOutputTokens: 5000, timeoutMs: 120_000 });
    const validated = validateAngles(data, ids, topic);
    // T6: 잠근 현상에서 벗어난 방향(금지 이탈 규칙·현상 핵심어 없음) → 한 번 다시 만든다.
    const lockDrift = lock?.enabled ? validated.angles.filter((angle) => { const text = `${angle.title} ${angle.hook} ${angle.editorial_perspective}`; return driftHits(text, lock).length > 0 || !lockAnchored(`${text} ${angle.content_structure.join(" ")}`, lock); }).map((angle) => angle.title) : [];
    return { ...validated, validation: { ...validated.validation, ...(lock?.enabled ? { lockDrift } : {}) }, model };
  };
  let result = await call();
  // 방향 부족·뻔한 제목·리서치 사건 중심 방향 과다·유형 부족·지정 주제 이탈이면 한 번만 다시 만든다.
  if (needsAngleRegeneration(result, topic)) {
    const v = result.validation;
    const retry = await call(` RETRY — fix these problems from the previous answer: ${[v.genericTitles.length ? `template titles (${v.genericTitles.join(" / ")})` : "", (v.anchored ?? 0) > MAX_ANCHORED_ANGLES ? `${v.anchored} angles were built on single research items (max ${MAX_ANCHORED_ANGLES})` : "", !topic && (v.focusCount ?? 5) < 4 ? `only ${v.focusCount} different focuses (each angle needs its own specific phenomenon or scene)` : "", !topic && (v.basicAngles?.length ?? 0) > MAX_BASIC_ANGLES ? `too many history/origin/beginner angles about the keyword (${(v.basicAngles ?? []).join(" / ")})` : "", v.offTopic?.length ? `angles off the user topic (${v.offTopic.join(" / ")})` : "", v.lockDrift?.length ? `angles that left the locked phenomenon or hit prohibited drift (${v.lockDrift.join(" / ")})` : "", result.angles.length < 4 ? "too few distinct angles" : "", v.crowdedStructures?.length ? `too many titles with the same structure (${v.crowdedStructures.join(", ")})` : ""].filter(Boolean).join("; ")}.`);
    result = { ...retry, validation: { ...retry.validation, regenerated: true } };
  }
  return { angles: result.angles as ContentAngle[], validation: result.validation, model: result.model };
}
