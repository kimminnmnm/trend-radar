import "server-only";
import { z } from "zod";
import { callStructured, js } from "./openai-client";
import { buildProductionContext, FACT_RULE } from "./openai-editorial";
import { productionPlanSchema, settingsMode, slideTypes, validateProduction, type CreativeConcept, type ProductionPlan, type ProductionSettings, type ProductionValidation } from "./content-production";
import { contentModeInfo, REPORT_PHRASES, type ContentAngle, type ContentMode } from "./editorial";
import { applyPatches, editorialQualityGate, revertRegressions, type EditorialReview, type QualityReport } from "./editorial-quality";
import type { EvidenceItem, TrendContext } from "./schemas";
import { collectWebEvidence } from "./web-evidence";

export type AngleResearchResult = { requested: boolean; status: "skipped" | "live" | "error"; count: number; message?: string };

const ids = js.strArr;
const factChecks = js.arr(js.obj({ text: js.str, evidence_ids: ids, status: js.status }));
/** Detail Bank → 스토리라인 → 슬라이드 순서(먼저 소재 고유 디테일을 모으고, 전개를 정한 뒤 쓰게). */
const planJsonSchema = js.obj({
  detail_bank: js.arr(js.obj({ id: js.str, detail: js.str, example: js.str, use: js.str, source_ids: ids, status: js.enumOf(["verified", "needs_check"]) })),
  storyline: js.arr(js.obj({ beat: js.str, reader_gets: js.str })),
  title: js.str, concept_notice: js.str, summary: js.str,
  claims: js.arr(js.obj({ text: js.str, evidence_ids: ids, status: js.status })),
  slides: js.arr(js.obj({ slide_id: js.str, number: { type: "number" }, type: js.enumOf(slideTypes), detail_ids: ids, specific_detail: js.str, reader_gets: js.str, to_next: js.str, headline: js.str, body: js.str, supporting_text: js.str, visual_direction: js.str, image_ref: js.str, image_prompt: js.str, layout_hint: js.str, cta: js.str, evidence_ids: ids, fact_checks: factChecks })),
  scenes: js.arr(js.obj({ scene_id: js.str, time_range: js.str, detail_ids: ids, specific_detail: js.str, reader_gets: js.str, to_next: js.str, description: js.str, visual_direction: js.str, on_screen_text: js.str, voice_over: js.str, transition: js.str, asset_ref: js.str, image_prompt: js.str, evidence_ids: ids, fact_checks: factChecks })),
  caption: js.str, hashtags: js.strArr, verify_before_publishing: js.strArr,
  editor_notes: js.obj({ fact_checks: js.strArr, research_gaps: js.strArr, image_rights: js.strArr, ai_disclosure: js.str }),
});

const formatRule = (settings: ProductionSettings, mode: ContentMode) => settings.format === "cardnews"
  ? `FORMAT: Instagram card news, ${settings.slideCount} slides (you may use 4-${Math.max(settings.slideCount, 4)} if the story needs fewer; never more), aspect ${settings.aspect}. First slide type 'cover' (the hook), last slide 'cta' or 'closing'. ${mode === "report" ? "" : "Middle slide types follow the storyline (hook, intro, story, detail, list, tip, highlight, example)."} headline: short (ideally <= 18 Korean characters; a line break is fine). body: 1-3 short sentences. supporting_text: optional small design text (a label, tip, mini list or step) — NOT a disclaimer, caveat or source line; empty string if not needed. visual_direction: what the designer places. image_prompt: English, for an optional AI production image, leave clean space for text. layout_hint. cta only where relevant. Return an empty scenes array.`
  : `FORMAT: short-form vertical video, ${settings.durationSec} seconds, 9:16. Scenes cover 0 to ${settings.durationSec}s continuously with time_range like '0-3'. First 3 seconds must hook. Each scene: description, visual_direction, on_screen_text (short), voice_over (Korean narration, 해요체), transition, asset_ref, image_prompt (English). Return an empty slides array.`;

const VOICE = "VOICE: natural Korean 해요체 like a Korean SNS content editor in their 20s, using the user's TONE if given. Short, clear sentences. Minimal jargon. Avoid repeated adjectives, clichés and AI-ish filler (e.g. '감성 가득', '매력 넘치는', '특별한 경험', '~의 세계로'). Do not end every slide with a question. LANGUAGE: Korean only — Japanese or Chinese words appear only as proper titles inside 「」 with a Korean reading or meaning next to them (e.g. 「ゆるかわ」(느슨한 귀여움)); never mix kana or hanzi into Korean sentences.";
/** V2.1: 쓰기 전에 소재 고유 디테일을 모은다. 소재 이름을 반복해 고유성을 만들지 않는다. */
const DETAIL_BANK = "STEP 0 — DETAIL BANK (before the storyline): collect 6-10 details unique to THIS subject and THIS angle, from RESEARCH_FOR_ANGLE first and well-established public knowledge second. Each item: detail (one concrete thing: a name, place, date, number, object, ritual, rule, quote, product, scene), example (a concrete instance or case), use (how a slide can use it), source_ids (research ids that state it; empty if general knowledge), status (write 'needs_check'; the server decides). Not allowed as details: the subject name itself, abstract feelings ('설레요', '특별해요'), generic advice that fits any subject ('사진은 가까이 찍어 봐요', '공식 채널을 확인해요').";
const STORY_RULES = "STEP 1 — STORYLINE from the detail bank: each beat gives a different detail and a reason to swipe. STEP 2 — SLIDES: every middle slide uses at least one bank item in detail_ids, no two slides use the same items, and to_next says why the reader goes on. A tip slide must contain a subject-specific detail (a real name, place, model, rule, number) — otherwise it is not a tip for this subject. Do not fill slides with abstract emotion or advice that would fit another keyword. Do not make the subject feel specific by repeating its name.";
const HOOK_RULES = "TITLE & COVER HOOK: pick the structure that fits this subject and target — a concrete scene, a surprising number or rule, a contrast (A 대신 B), a quote, a confession-style first line, a how-to, or a question. Do not default to '‹subject›, question?' or templates like '‹subject›, 뭐부터 볼까?', '왜 인기일까?', '알고 있었어?'. The hook must contain a detail from the bank.";

const editorialInstructions = (settings: ProductionSettings, mode: ContentMode, hasConcept: boolean, customTopic: string) => [
  "You are TREND RADAR Content Studio, an SNS content editor who plans and writes card news and short-form that readers want to save and share. You are NOT summarizing an analysis. Return only the JSON schema. Copy in Korean, image_prompt in English.",
  `MODE: ${contentModeInfo[mode].label} — ${contentModeInfo[mode].description}`,
  customTopic ? `USER TOPIC (highest priority): "${customTopic}". The whole piece must be about exactly this. Never switch to another subject, event or trend even if the research mentions one.` : "",
  "ANGLE: the SELECTED_ANGLE was chosen by the user. The piece must deliver exactly that angle and its reader_benefit. Do not drift to another topic from the research.",
  DETAIL_BANK,
  "STORYLINE: one beat per slide/scene, ordered for the reader's experience (hook → understanding → story → practical value → payoff), never in the order of research items or analysis sections. Each slide has specific_detail (the concrete detail it uses) and reader_gets (what the reader gains).",
  STORY_RULES,
  HOOK_RULES,
  "SPECIFICITY TEST: for each sentence ask 'could I swap in another keyword and keep this sentence?' If yes, rewrite it around a concrete detail of this subject.",
  "RESEARCH_FOR_ANGLE is supporting material picked for this angle, not the structure. Use it for accurate details. Do not narrate sources (no '보도에 따르면', '~가 소개했어요', '자료에서는'); state facts plainly and record them in fact_checks. Do not mention search interest, data periods, analysis methods or what data cannot confirm; INTERNAL_LIMITS go only into editor_notes.research_gaps.",
  `Never use these report phrases in publishing copy: ${REPORT_PHRASES.join(", ")}.`,
  formatRule(settings, mode),
  VOICE,
  "BRIEF: use the given target, tone, goal, brand (if empty, do not invent a brand) and CTA. If CTA is empty, propose a natural one (save, share, tag a friend, comment) tied to the practical value of the piece.",
  FACT_RULE + " For every factual statement in a slide or scene add an entry to that unit's fact_checks: research ids when the research supports it (status Verified Signal or Supported Hypothesis), otherwise empty evidence_ids with status 'Insufficient Evidence' so the editor verifies it. Opinions, jokes and editorial framing need no fact_check. Never put research ids in publishing copy.",
  mode === "curation" ? "CURATION: recommend only items that appear in the research or are unmistakably real; add a fact_check for each item's existence/availability. Never invent product names, prices, addresses or opening hours." : "",
  hasConcept || mode === "concept"
    ? "CONCEPT: the concept is hypothetical, not a real product, space or launch. concept_notice must say clearly in Korean that it is a concept proposal (콘셉트 제안). Write copy like '이런 공간이 있다면' — never imply it exists, is on sale, or is an official collaboration. If the concept has an IP caution, keep it an inspired concept."
    : "concept_notice: empty string unless you present a hypothetical product or campaign.",
  "CAPTION: do not repeat the slides. A short hook line, what this post is, the key charm in one or two lines, a natural CTA. hashtags: 5-10 relevant tags, no research ids.",
  "EDITOR ONLY (never in publishing copy): summary, claims, verify_before_publishing, editor_notes (fact_checks, research_gaps, image_rights, ai_disclosure).",
  "IMAGES: AVAILABLE_ASSETS lists image ids (REAL REFERENCE = real collected images, link-only; AI CONCEPT VISUAL = AI concept image). Set image_ref/asset_ref where it fits; otherwise empty string. Never treat an AI image as evidence. Visual directions must fit this subject.",
].filter(Boolean).join(" ");

/** TREND REPORT: 기존 분석 보고서형 지시(검증 메모만 분리). 스토리라인·디테일 필드는 채우되 분석 순서를 써도 된다. */
const reportInstructions = (settings: ProductionSettings, hasConcept: boolean) => [
  "You are TREND RADAR Content Studio, a senior social content producer. Write Korean copy (image_prompt in English). Return only the JSON schema.",
  "MODE: TREND REPORT. Turn the given trend analysis" + (hasConcept ? " and the selected Creative Collision concept" : "") + " into a report-style post: search interest changes (relative index, never absolute volume), background, evidence and limits. Do not invent a new concept. Fill storyline, specific_detail and reader_gets too.",
  formatRule(settings, "report"),
  "BRIEF: use the given target, tone, goal, brand (optional; if empty do not invent a brand) and CTA.",
  "EVIDENCE: the ledger contains real collected evidence (ids like T1:IG-03). Put factual statements into claims and each unit's fact_checks with evidence_ids from the ledger only. Never invent statistics, growth rates, sales, survey numbers, dates, people or brand collaborations. Never put evidence ids in publishing copy.",
  hasConcept ? "CONCEPT: the concept is hypothetical. concept_notice must say it is a concept proposal (콘셉트 제안)." : "concept_notice: empty string.",
  "IMAGES: AVAILABLE_ASSETS lists image ids you may set as image_ref/asset_ref; otherwise empty string. Never treat an AI image as evidence.",
  "verify_before_publishing and editor_notes: concrete checks (rights for real images, AI-image disclosure, claims to verify).",
].join(" ");

/* ---------- V2.1 편집 리뷰(AI 참고 점수) + 부분 수정 ---------- */
const patchFacts = js.arr(js.obj({ text: js.str, evidence_ids: ids, status: js.status }));
const reviewJsonSchema = js.obj({
  scores: js.obj({ hook: { type: "number" }, specificity: { type: "number" }, story: { type: "number" }, save_share: { type: "number" }, voice: { type: "number" } }),
  summary: js.str, title: js.str,
  patches: js.arr(js.obj({ number: { type: "number" }, headline: js.str, body: js.str, supporting_text: js.str, fact_checks: patchFacts, detail_ids: ids, reason: js.str })),
});
const reviewSchema = z.object({
  scores: z.object({ hook: z.number(), specificity: z.number(), story: z.number(), save_share: z.number(), voice: z.number() }),
  summary: z.string(), title: z.string(),
  patches: z.array(z.object({ number: z.number().int(), headline: z.string(), body: z.string(), supporting_text: z.string(), fact_checks: z.array(z.object({ text: z.string(), evidence_ids: z.array(z.string()), status: z.enum(["Verified Signal", "Supported Hypothesis", "Creative Hypothesis", "Insufficient Evidence"]) })), detail_ids: z.array(z.string()), reason: z.string() })),
});
const reviewInstructions = [
  "You are a senior Korean SNS content editor reviewing a card news / short-form draft before publishing. Return only the JSON schema.",
  "SCORES (1-5, your editorial opinion, shown to the user as a reference, not a user rating): hook (would a reader stop scrolling), specificity (details only this subject has), story (each slide adds something and leads to the next), save_share (a reason to save or share), voice (natural Korean SNS 해요체, not a report or translation).",
  "PATCHES: rewrite ONLY the slides that need it. Every REQUIRED_ISSUE must be fixed. EDITORIAL_HINTS are rule-based signals — fix them if you agree. Keep slides that work untouched (do not include them). For each patch return the full new headline, body, supporting_text, fact_checks and detail_ids for that slide, and a short Korean reason.",
  "When fixing: use details from DETAIL_BANK (prefer verified ones) so the slide becomes specific to this subject; never invent new facts, numbers, names or quotes; an unsupported fact must be removed or stated without certainty; Korean only (proper titles in 「」 with a Korean reading); no research ids or source narration in the copy.",
  "title: a better title only if the current title is weak or a template ('‹subject›, question?', '뭐부터 볼까', '왜 인기일까', '알고 있었어?'); otherwise return an empty string. The title must match the selected angle.",
  VOICE,
].join(" ");

export async function createProductionPlan(trends: TrendContext[], concept: CreativeConcept | undefined, settings: ProductionSettings, assets: Array<{ id: string; status: string; title: string }>, angle?: ContentAngle, customTopic = "", options: { research?: boolean } = {}): Promise<{ plan: ProductionPlan; validation: ProductionValidation; quality: QualityReport | null; review: EditorialReview | null; research: AngleResearchResult; model: string; references: EvidenceItem[] }> {
  const mode = settingsMode(settings);
  const topic = customTopic.trim();
  // 5단계: 선택한 방향에 맞는 자료 조사(사용자가 켰을 때만, 웹 검색 1회). 실제 조회한 URL만 원장에 넣는다(AR-xx).
  let angleResearch: EvidenceItem[] = [];
  let research: AngleResearchResult = { requested: Boolean(options.research), status: "skipped", count: 0 };
  if (options.research && angle && mode !== "report" && trends[0]) {
    try {
      const { items } = await collectWebEvidence(trends[0].name, new Date().toISOString(), { topic: topic || angle.title, needs: [angle.reader_benefit, ...angle.research_requirements].filter(Boolean).slice(0, 6) });
      angleResearch = items.map((item) => ({ ...item, id: `T1:${item.id}` }));
      research = { requested: true, status: "live", count: items.length };
    } catch (error) { research = { requested: true, status: "error", count: 0, message: error instanceof Error ? error.message.slice(0, 200) : "방향 맞춤 자료 조사에 실패했습니다." }; }
  }
  const context = buildProductionContext(trends, mode, angle, angleResearch);
  const input = `${context.prompt}\nCREATIVE_CONCEPT: ${JSON.stringify(concept ?? null)}\nUSER_TOPIC: ${topic || "(none)"}\nSELECTED_ANGLE: ${JSON.stringify(angle ?? null)}\nSETTINGS: ${JSON.stringify(settings)}\nAVAILABLE_ASSETS: ${JSON.stringify(assets)}`;
  const instructions = mode === "report" ? reportInstructions(settings, Boolean(concept)) : editorialInstructions(settings, mode, Boolean(concept), topic);
  const subjectTerms = [...trends.flatMap((trend) => [trend.name, ...trend.keywords]), ...(concept ? [concept.title] : [])];
  const vocabulary = [...context.ledger.filter((item) => item.kind !== "naver_series").flatMap((item) => [item.title, item.excerpt]), ...trends.flatMap((trend) => trend.dna?.dimensions.flatMap((dimension) => dimension.attributes.map((attribute) => attribute.label)) ?? []), ...(concept ? [concept.concept, concept.visualBrief] : [])];
  const ledgerIds = context.ledger.map((item) => item.id), assetIds = assets.map((item) => item.id);
  const gate = (plan: ProductionPlan, removedEvidenceIds: string[]) => editorialQualityGate(plan, { subjectTerms, angle, vocabulary, removedEvidenceIds });
  const { data, model } = await callStructured({ name: "content_production", jsonSchema: planJsonSchema, validator: productionPlanSchema, instructions, input, maxOutputTokens: 14000, timeoutMs: 200_000 });
  let result = validateProduction(data, settings, ledgerIds, assetIds, { concept: Boolean(concept) });
  let quality: QualityReport | null = mode === "report" ? null : gate(result.plan, result.validation.removedEvidenceIds);
  let review: EditorialReview | null = null;
  // 편집 리뷰 1회: 참고 점수를 매기고, 필수 검증 실패와 편집 신호가 걸린 슬라이드·제목만 고쳐 쓴다(전체 재생성 아님).
  if (quality) {
    const draft = { title: result.plan.title, slides: result.plan.slides.map(({ number, type, headline, body, supporting_text, detail_ids, reader_gets }) => ({ number, type, headline, body, supporting_text, detail_ids, reader_gets })), scenes: result.plan.scenes.map(({ time_range, on_screen_text, voice_over, detail_ids }, index) => ({ number: index + 1, time_range, on_screen_text, voice_over, detail_ids })), caption: result.plan.caption };
    const reviewInput = `SELECTED_ANGLE: ${JSON.stringify(angle ?? null)}\nUSER_TOPIC: ${topic || "(none)"}\nDETAIL_BANK: ${JSON.stringify(result.plan.detail_bank ?? [])}\nRESEARCH_IDS: ${JSON.stringify(ledgerIds.filter((id) => !id.includes("NAVER")))}\nDRAFT: ${JSON.stringify(draft)}\nREQUIRED_ISSUES: ${JSON.stringify(quality.issues)}\nEDITORIAL_HINTS: ${JSON.stringify(quality.hints)}\nGENERIC_SENTENCES: ${JSON.stringify(quality.genericSentences.slice(0, 8))}`;
    try {
      const reviewed = await callStructured({ name: "editorial_review", jsonSchema: reviewJsonSchema, validator: reviewSchema, instructions: reviewInstructions, input: reviewInput, maxOutputTokens: 6000, timeoutMs: 150_000 });
      const before = { passed: quality.passed, total: quality.total, failing: quality.failing };
      const patched = applyPatches(result.plan, reviewed.data.patches.map((patch) => ({ ...patch, detail_ids: patch.detail_ids })), reviewed.data.title);
      let reverted: NonNullable<EditorialReview["reverted"]> = [];
      if (patched.patched.length) {
        // 고친 슬라이드도 같은 서버 검증(근거 ID·사실 주장·내부 ID 제거)을 다시 거친다.
        const draftPlan = result.plan, draftQuality = quality;
        let next = validateProduction(patched.plan, settings, ledgerIds, assetIds, { concept: Boolean(concept) });
        let nextQuality = gate(next.plan, next.validation.removedEvidenceIds);
        // 고친 슬라이드가 새 문제를 만들었으면 그 슬라이드만 초안으로 되돌리고 다시 검증한다.
        const regression = revertRegressions(draftPlan, next.plan, draftQuality, nextQuality);
        if (regression.reverted.length) {
          reverted = regression.reverted;
          next = validateProduction(regression.plan, settings, ledgerIds, assetIds, { concept: Boolean(concept) });
          nextQuality = gate(next.plan, next.validation.removedEvidenceIds);
        }
        result = next; quality = nextQuality;
      }
      const clamp = (value: number) => Math.max(1, Math.min(5, Math.round(value)));
      review = { source: "ai-review", model: reviewed.model, reviewedAt: new Date().toISOString(), scores: { hook: clamp(reviewed.data.scores.hook), specificity: clamp(reviewed.data.scores.specificity), story: clamp(reviewed.data.scores.story), save_share: clamp(reviewed.data.scores.save_share), voice: clamp(reviewed.data.scores.voice) }, summary: reviewed.data.summary, patched: patched.patched.filter((item) => !reverted.some((entry) => entry.unit === item.unit)), ...(reverted.length ? { reverted } : {}), ...(patched.titleChange ? { titleChange: patched.titleChange } : {}), before };
    } catch { /* 리뷰가 실패해도 초안은 그대로 돌려준다(필수 검증 결과는 남는다). */ }
  }
  const cited = new Set([
    ...[...result.plan.claims, ...result.plan.slides, ...result.plan.scenes].flatMap((item) => item.evidence_ids),
    ...[...result.plan.slides, ...result.plan.scenes].flatMap((item) => (item.fact_checks ?? []).flatMap((fact) => fact.evidence_ids)),
    ...(result.plan.detail_bank ?? []).flatMap((item) => item.source_ids),
  ]);
  return { plan: result.plan, validation: result.validation, quality, review, research, model, references: context.ledger.filter((item) => cited.has(item.id)) };
}
