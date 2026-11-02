import "server-only";
import { callStructured, js } from "./openai-client";
import {
  creativeResultSchema, creativityLevels, evidenceModes, ideaTypeLabels, ideaTypes, needsRegeneration, slideRoles, validateCreative,
  type CreativePriorInput, type CreativeRelationInput, type CreativeResult, type CreativeTrendInput, type CreativeValidation, type IdeaType,
} from "./creative-collision";

const signal = js.obj({ text: js.str, basis: js.enumOf(["evidence", "dna", "visual_dna", "culture_map", "collision", "inference"]), refs: js.strArr });
const signals = js.arr(signal);
const creativeJsonSchema = js.obj({
  structure: js.obj({ shared_signals: signals, contrasting_signals: signals, emotional_tone: signals, visual_cues: signals, objects_motifs: signals, behavior_audience: signals, cultural_utility: signals }),
  ideas: js.arr(js.obj({
    id: js.str, trendA: js.str, trendB: js.str, title: js.str, concept_line: js.str,
    idea_type: js.enumOf(ideaTypes), creativity_level: js.enumOf(creativityLevels),
    why_it_works: js.str, cultural_connection: js.str, concrete_output: js.str, audience_appeal: js.str,
    visual_direction: js.obj({ mood: js.str, palette: js.strArr, texture: js.str, composition: js.str, key_objects: js.strArr, styling_keywords: js.strArr }),
    execution_hint: js.str, content_expansion: js.strArr, cardnews_hook: js.str, CTA: js.str,
    cardnews_slides: js.arr(js.obj({ role: js.enumOf(slideRoles), headline: js.str, body: js.str })),
    image_prompt: js.str,
    visual_brief: js.obj({ core_subject: js.str, background: js.str, lighting: js.str, shot_type: js.str, color_direction: js.str, styling_direction: js.str, platform_use_case: js.str }),
    evidence_mode: js.enumOf(evidenceModes), evidence_refs: js.strArr, ip_caution: js.str, source_trend_ids: js.strArr, created_at: js.str,
  })),
  limitations: js.strArr,
});

const instructions = (focus?: IdeaType) => [
  "You are TREND RADAR's Creative Collision director: a senior creative strategist who turns two cultural trends into concrete, producible outputs. Write all text in Korean except image_prompt (English).",
  "Input: Trend A and Trend B with their saved WHY, DNA, Visual DNA (if any), Culture Map relation (if any), a prior Culture Collision (if any), an evidence list (ids like A:IG-03, B:YT-02) and a list of MISSING inputs.",
  "STEP 1 structure: extract shared_signals, contrasting_signals, emotional_tone, visual_cues, objects_motifs, behavior_audience, cultural_utility. Each item cites its basis: evidence (cite refs from the evidence list), dna, visual_dna, culture_map, collision, or inference. Never invent facts, sales, popularity, demographics or events. If an input is missing, do not pretend to know it.",
  focus
    ? `STEP 2 ideas: produce exactly 3 ideas, all of idea_type '${focus}' (${ideaTypeLabels[focus]}): one SAFE, one BOLD, one WILD. Make them clearly different executions, not variations of one sentence.`
    : "STEP 2 ideas: produce exactly 9 ideas: exactly 3 SAFE, exactly 3 BOLD, exactly 3 WILD. Choose the idea_types that genuinely fit these two trends from: product, fnb_menu (F&B), popup_space, goods (merchandise), campaign, cardnews, short_form, visual_object, experience, exhibition, interactive. Use at least 7 different idea_types and never more than 2 of the same type. Do not default to dessert, goods and pop-ups; pick the formats the trends' signals actually suggest. Every idea must stay rooted in both trends.",
  "Levels: SAFE = immediately understandable and realistic to launch. BOLD = experimental, extensible format. WILD = the most imaginative and memorable. The three levels must differ in scale, mechanism and risk, not just adjectives.",
  "Every idea must be a concrete OUTPUT that a reader can picture instantly: a named object, menu item, space, set, series or scene, with what it looks like and how people use it (e.g. '표정이 랜덤인 캐릭터 찹쌀모찌 6구 세트', '떡집 간판을 단 팝업 뽑기 카운터'). Forbidden: abstract phrases like 'A와 B의 감성을 결합한 콘텐츠', '새로운 경험', '레트로한 무드의 협업'.",
  "No two ideas may share the same core object or mechanism; if two are similar, replace one with a different output.",
  "title: short product-like name. concept_line: one sentence describing the actual thing. concrete_output: what exactly is made (form, material, size, number of pieces, where it sits, how a person handles it). cultural_connection: which named signals from Trend A and Trend B this output carries and why they fit together. why_it_works: tie to specific signals from STEP 1 (name them). audience_appeal: what participants do or feel, without asserting demographics as fact. execution_hint: first practical step and format details. content_expansion: 3 follow-up content pieces. cardnews_hook: a scroll-stopping first-slide line. cardnews_slides: exactly 6 slides with roles cover, intro, explanation, example, expansion, cta.",
  "visual_direction and visual_brief must be specific enough for a designer or image model (materials, colors, props, framing). image_prompt: one English paragraph for an AI concept visual: subject, setting, lighting, camera/shot, palette, style; no text rendering requests, no logos, no real people.",
  "evidence_mode: evidence_based only if the idea's core premise is directly supported by cited evidence refs; hybrid_inference if it combines evidence/DNA with your inference; speculative_concept if it is pure imagination. WILD ideas are usually speculative_concept. evidence_refs: only ids from the evidence list.",
  "ip_caution: if the idea uses a specific character, brand, celebrity or copyrighted IP, describe it as an 'inspired concept' and write a one-sentence caution (avoid copying official designs); otherwise empty string.",
  "id, trendA, trendB, source_trend_ids, created_at: fill with any placeholder; the server overwrites them. execution_hint is the execution scenario: first practical step, where it happens, and how people take part. content_expansion is the content potential.",
  "limitations: what this ideation does not prove (demand, feasibility, rights) and which inputs were missing.",
].join(" ");

export type CreativeGeneration = { result: CreativeResult; validation: CreativeValidation; model: string };

export async function generateCreativeCollision(a: CreativeTrendInput, b: CreativeTrendInput, relation: CreativeRelationInput, prior: CreativePriorInput, missing: string[], focus?: IdeaType): Promise<CreativeGeneration> {
  const input = JSON.stringify({ trendA: a, trendB: b, cultureMapRelation: relation, priorCollision: prior, MISSING_INPUTS: missing });
  const refs = [...a.evidence, ...b.evidence].map((item) => item.id);
  const once = async (extra = "") => {
    const { data, model } = await callStructured({ name: "creative_collision", jsonSchema: creativeJsonSchema, validator: creativeResultSchema, instructions: instructions(focus) + extra, input, maxOutputTokens: focus ? 7000 : 16000, timeoutMs: 240_000 });
    return { ...validateCreative(data, refs, [a.name, b.name], new Date().toISOString(), [a.key, b.key]), model };
  };
  const first = await once();
  // 레벨이 빠졌거나 유형이 너무 적으면 1회만 다시 생성한다(그 이상은 비용 보호를 위해 하지 않음).
  if (!needsRegeneration(first.validation, Boolean(focus))) return first;
  const second = await once(` PREVIOUS ATTEMPT WAS REJECTED: missing levels ${first.validation.missingLevels.join(",") || "none"}, only ${first.validation.typeCount} idea types, duplicates ${first.validation.droppedDuplicates?.length ?? 0}. Fix these.`);
  return { ...second, validation: { ...second.validation, regenerated: true } };
}
