import { z } from "zod";
import type { LiveAnalysisSnapshot, SavedItem } from "./types";
import { selectWhyOverview } from "./why-summary";

/*
 * PHASE V4.5 Creative Collision.
 * 두 트렌드의 WHY·DNA·Visual DNA·Culture Map 관계·기존 Collision을 입력으로, 장면이 그려지는 결과물 단위의 아이디어를 만든다.
 * - 아이디어는 SAFE / BOLD / WILD, 9개 결과물 유형으로 나눈다.
 * - evidence_mode로 근거 기반 / 근거+추론 / 순수 콘셉트를 구분한다. 입력에 없는 사실은 만들지 않는다.
 * - AI 콘셉트 이미지는 실제 증거 이미지가 아니다(AI CONCEPT VISUAL).
 */
export const CREATIVE_PROMPT_VERSION = "creative-collision-v2";

export const ideaTypes = ["product", "fnb_menu", "popup_space", "goods", "campaign", "cardnews", "short_form", "visual_object", "experience", "exhibition", "interactive"] as const;
export type IdeaType = (typeof ideaTypes)[number];
export const ideaTypeLabels: Record<IdeaType, string> = {
  product: "제품", fnb_menu: "F&B 메뉴", popup_space: "팝업·공간", goods: "굿즈·머천다이즈", campaign: "캠페인",
  cardnews: "카드뉴스", short_form: "숏폼 영상", visual_object: "비주얼 오브제", experience: "체험", exhibition: "전시", interactive: "인터랙티브 콘텐츠",
};
export const creativityLevels = ["SAFE", "BOLD", "WILD"] as const;
export type CreativityLevel = (typeof creativityLevels)[number];
export const evidenceModes = ["evidence_based", "hybrid_inference", "speculative_concept"] as const;
export type EvidenceMode = (typeof evidenceModes)[number];
export const evidenceModeLabels: Record<EvidenceMode, string> = { evidence_based: "근거 기반", hybrid_inference: "근거 + 추론", speculative_concept: "순수 콘셉트" };
export const slideRoles = ["cover", "intro", "explanation", "example", "expansion", "cta"] as const;
const signalBases = ["evidence", "dna", "visual_dna", "culture_map", "collision", "inference"] as const;

const signal = z.object({ text: z.string(), basis: z.enum(signalBases), refs: z.array(z.string()) });
export type CreativeSignal = z.infer<typeof signal>;

export const creativeIdeaSchema = z.object({
  id: z.string(),
  trendA: z.string(),
  trendB: z.string(),
  title: z.string(),
  concept_line: z.string(),
  idea_type: z.enum(ideaTypes),
  creativity_level: z.enum(creativityLevels),
  why_it_works: z.string(),
  /** v2: 두 트렌드의 어떤 문화적 신호가 이 결과물로 이어지는지. v1 결과에는 없다(why_it_works로 대신 표시). */
  cultural_connection: z.string().optional(),
  /** v2: 손에 잡히는 결과물 묘사(형태·재료·크기·사용 장면). */
  concrete_output: z.string().optional(),
  audience_appeal: z.string(),
  visual_direction: z.object({ mood: z.string(), palette: z.array(z.string()), texture: z.string(), composition: z.string(), key_objects: z.array(z.string()), styling_keywords: z.array(z.string()) }),
  execution_hint: z.string(),
  content_expansion: z.array(z.string()),
  cardnews_hook: z.string(),
  CTA: z.string(),
  cardnews_slides: z.array(z.object({ role: z.enum(slideRoles), headline: z.string(), body: z.string() })),
  image_prompt: z.string(),
  visual_brief: z.object({ core_subject: z.string(), background: z.string(), lighting: z.string(), shot_type: z.string(), color_direction: z.string(), styling_direction: z.string(), platform_use_case: z.string() }),
  evidence_mode: z.enum(evidenceModes),
  evidence_refs: z.array(z.string()),
  ip_caution: z.string(),
  /** 서버가 채우는 원본 트렌드 ID(A, B). */
  source_trend_ids: z.array(z.string()).optional(),
  created_at: z.string(),
});
export type CreativeIdea = z.infer<typeof creativeIdeaSchema>;

export const creativeStructureSchema = z.object({
  shared_signals: z.array(signal),
  contrasting_signals: z.array(signal),
  emotional_tone: z.array(signal),
  visual_cues: z.array(signal),
  objects_motifs: z.array(signal),
  behavior_audience: z.array(signal),
  cultural_utility: z.array(signal),
});
export type CreativeStructure = z.infer<typeof creativeStructureSchema>;

export const creativeResultSchema = z.object({ structure: creativeStructureSchema, ideas: z.array(creativeIdeaSchema), limitations: z.array(z.string()) });
export type CreativeResult = z.infer<typeof creativeResultSchema>;

/** 생성된 콘셉트 이미지. 실제 증거 이미지가 아니며 다운스케일한 JPEG data URL만 보관한다. */
/** dataUrl은 이 브라우저의 축소본, storagePath는 계정 저장소(Supabase Storage) 경로. 둘 중 하나 이상이 있다. */
export type ConceptVisual = { ideaId: string; kind: "AI CONCEPT VISUAL"; dataUrl?: string; storagePath?: string; model: string; prompt: string; createdAt: string; width: number; height: number; inspired: boolean };

export type CreativeRun = {
  id: string;
  trendKeys: [string, string];
  trendNames: [string, string];
  focusType?: IdeaType;
  analyzedAt: string;
  updatedAt: string;
  model: string;
  promptVersion: string;
  result: CreativeResult;
  inputs: CreativeInputReport;
  validation: CreativeValidation;
  selectedIdeaId?: string;
  visuals: ConceptVisual[];
};
export type CreativeValidation = { removedRefs: string[]; downgradedModes: number; missingLevels: CreativityLevel[]; levelCounts?: Record<CreativityLevel, number>; typeCount: number; genericTitles: string[]; droppedDuplicates?: string[]; regenerated?: boolean };
export type CreativeInputReport = { used: string[]; missing: string[] };
export type SavedCreativePayload = { kind: "creative-collision"; run: CreativeRun; selectedIdeaId?: string };

/* ---------- 입력 만들기(클라이언트 저장 결과 재사용, 추가 API 호출 없음) ---------- */

export type CreativeTrendInput = {
  ref: "A" | "B";
  key: string;
  name: string;
  keywords: string[];
  why: { overview: string; what?: string; motivations: Array<{ label: string; explanation: string; evidenceIds: string[] }>; triggers: Array<{ title: string; explanation: string; evidenceIds: string[] }>; context?: string } | null;
  dna: { dominantPattern: string; dimensions: Array<{ dimension: string; summary: string; attributes: string[] }> } | null;
  visualDna: { palette: string[]; common: string[]; dimensions: Array<{ dimension: string; summary: string }> } | null;
  evidence: Array<{ id: string; kind: string; title: string; excerpt: string }>;
};
export const creativeTrendInputSchema: z.ZodType<CreativeTrendInput> = z.object({
  ref: z.enum(["A", "B"]), key: z.string().max(120), name: z.string().max(100), keywords: z.array(z.string().max(100)).max(5),
  why: z.object({ overview: z.string().max(1200), what: z.string().max(1200).optional(), motivations: z.array(z.object({ label: z.string().max(200), explanation: z.string().max(800), evidenceIds: z.array(z.string().max(40)).max(10) })).max(8), triggers: z.array(z.object({ title: z.string().max(200), explanation: z.string().max(800), evidenceIds: z.array(z.string().max(40)).max(10) })).max(8), context: z.string().max(1200).optional() }).nullable(),
  dna: z.object({ dominantPattern: z.string().max(800), dimensions: z.array(z.object({ dimension: z.string().max(40), summary: z.string().max(800), attributes: z.array(z.string().max(120)).max(12) })).max(8) }).nullable(),
  visualDna: z.object({ palette: z.array(z.string().max(80)).max(8), common: z.array(z.string().max(200)).max(8), dimensions: z.array(z.object({ dimension: z.string().max(40), summary: z.string().max(600) })).max(8) }).nullable(),
  evidence: z.array(z.object({ id: z.string().max(40), kind: z.string().max(30), title: z.string().max(200), excerpt: z.string().max(400) })).max(24),
});
export type CreativeRelationInput = { type: string; score: number | null; sharedAttributes: string[]; signals: number; selectedConnectionId?: string; selectedPhenomenon?: string; subject?: string; action?: string; object?: string; direction?: string; culturalContext?: string; evidenceIds?: string[]; verificationStatus?: string } | null;
export type CreativePriorInput = { title: string; opportunities: string[]; tensions: string[] } | null;

export function toCreativeTrendInput(snapshot: LiveAnalysisSnapshot, ref: "A" | "B"): CreativeTrendInput {
  const report = snapshot.whyReport;
  return {
    ref, key: snapshot.trendId, name: snapshot.trendName, keywords: snapshot.keywords.slice(0, 5),
    why: report ? {
      overview: selectWhyOverview(snapshot).summary.slice(0, 1200),
      what: report.what?.summary.slice(0, 1200),
      motivations: report.motivations.slice(0, 6).map((item) => ({ label: item.label.slice(0, 200), explanation: item.explanation.slice(0, 800), evidenceIds: item.evidenceIds.slice(0, 10) })),
      triggers: report.triggers.slice(0, 6).map((item) => ({ title: item.title.slice(0, 200), explanation: item.explanation.slice(0, 800), evidenceIds: item.evidenceIds.slice(0, 10) })),
      context: report.context?.background.summary.slice(0, 1200),
    } : null,
    dna: snapshot.dna ? { dominantPattern: `${snapshot.dna.dominantPattern.title}: ${snapshot.dna.dominantPattern.explanation}`.slice(0, 800), dimensions: snapshot.dna.dimensions.map((item) => ({ dimension: item.dimension, summary: item.summary.slice(0, 800), attributes: item.attributes.filter((attr) => attr.status !== "Insufficient Evidence").map((attr) => attr.label.slice(0, 120)).slice(0, 12) })) } : null,
    visualDna: snapshot.visualDna ? {
      palette: snapshot.visualDna.result.palette.map((item) => `${item.name} ${item.hex}`.slice(0, 80)).slice(0, 8),
      common: snapshot.visualDna.result.commonFeatures.map((item) => `${item.label}: ${item.description}`.slice(0, 200)).slice(0, 8),
      dimensions: snapshot.visualDna.result.dimensions.map((item) => ({ dimension: item.dimension, summary: item.summary.slice(0, 600) })),
    } : null,
    evidence: (snapshot.evidence ?? []).slice(0, 24).map((item) => ({ id: `${ref}:${item.id}`, kind: item.kind, title: item.title.slice(0, 200), excerpt: item.excerpt.slice(0, 400) })),
  };
}

/** 어떤 입력이 있고 없는지(결정적 계산). 없는 입력은 결과 화면과 프롬프트에 명시한다. */
export function inputReport(a: CreativeTrendInput, b: CreativeTrendInput, relation: CreativeRelationInput, prior: CreativePriorInput): CreativeInputReport {
  const used: string[] = [], missing: string[] = [];
  for (const trend of [a, b]) {
    (trend.why ? used : missing).push(`${trend.name} WHY`);
    (trend.dna ? used : missing).push(`${trend.name} DNA`);
    (trend.visualDna ? used : missing).push(`${trend.name} Visual DNA`);
    (trend.evidence.length ? used : missing).push(`${trend.name} 근거 원장`);
  }
  (relation ? used : missing).push("Culture Map 관계");
  (prior ? used : missing).push("기존 Culture Collision");
  return { used, missing };
}

/** 분석 전 미리보기: DNA 속성 라벨 공통/차이(결정적 계산, AI 아님). */
export function previewSignals(a: CreativeTrendInput, b: CreativeTrendInput) {
  const norm = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/[\s#·_\-]/g, "");
  const labels = (trend: CreativeTrendInput) => new Map((trend.dna?.dimensions ?? []).flatMap((dimension) => dimension.attributes.map((label) => [norm(label), { label, dimension: dimension.dimension }] as const)));
  const la = labels(a), lb = labels(b);
  const shared = [...la].filter(([key]) => lb.has(key)).map(([, value]) => value);
  const onlyA = [...la].filter(([key]) => !lb.has(key)).map(([, value]) => value).slice(0, 4);
  const onlyB = [...lb].filter(([key]) => !la.has(key)).map(([, value]) => value).slice(0, 4);
  return { shared, onlyA, onlyB };
}

/* ---------- 서버 검증 ---------- */

/** 두 아이디어 문장 유사도(글자 2-gram Jaccard, 0~1). 공백·기호는 무시한다. */
export function ideaSimilarity(a: string, b: string) {
  const grams = (value: string) => { const text = value.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, ""); const set = new Set<string>(); for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2)); return set; };
  const x = grams(a), y = grams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0; for (const gram of x) if (y.has(gram)) shared += 1;
  return shared / (x.size + y.size - shared);
}
/** 이 값 이상이면 같은 아이디어의 반복으로 보고 뒤의 것을 뺀다. */
export const DUPLICATE_THRESHOLD = 0.5;
const ideaText = (idea: Pick<CreativeIdea, "title" | "concept_line" | "concrete_output">) => `${idea.title} ${idea.concrete_output ?? idea.concept_line}`;

/** 다시 생성해야 할 만큼 결과가 부족한지(레벨 누락·유형 다양성 부족). */
export const needsRegeneration = (validation: CreativeValidation, focused: boolean) => validation.missingLevels.length > 0 || (!focused && validation.typeCount < 5);

/** "A와 B의 감성을 결합한" 같은 뻔한 제목. 검증 로그에 남겨 화면에서 경고한다(삭제하지 않음). */
const GENERIC = /(감성을? (결합|섞|더한)|만남|콜라보레이션$|새로운 경험$|무드의 협업|조합 콘텐츠$|결합한 (콘텐츠|경험))/;

export function validateCreative(raw: CreativeResult, allowedRefs: string[], trendNames: [string, string], now = new Date().toISOString(), trendKeys?: [string, string]): { result: CreativeResult; validation: CreativeValidation } {
  const allowed = new Set(allowedRefs);
  const removed: string[] = [];
  let downgradedModes = 0;
  const cleanRefs = (refs: string[]) => refs.filter((ref) => { const ok = allowed.has(ref); if (!ok) removed.push(ref); return ok; });
  const cleanSignals = (items: CreativeSignal[]) => items.map((item) => {
    const refs = cleanRefs(item.refs);
    // 근거를 인용하지 못한 evidence 신호는 추론으로 낮춘다.
    return item.basis === "evidence" && !refs.length ? { ...item, refs, basis: "inference" as const } : { ...item, refs };
  });
  const structure = Object.fromEntries(Object.entries(raw.structure).map(([key, items]) => [key, cleanSignals(items)])) as CreativeStructure;
  const seen = new Set<string>();
  // 거의 같은 아이디어는 앞의 것만 남긴다(유형·레벨이 달라도 문장이 같으면 반복).
  const droppedDuplicates: string[] = [];
  const unique = raw.ideas.filter((idea, index) => {
    const dup = raw.ideas.slice(0, index).some((prev) => !droppedDuplicates.includes(prev.title) && ideaSimilarity(ideaText(prev), ideaText(idea)) >= DUPLICATE_THRESHOLD);
    if (dup) droppedDuplicates.push(idea.title);
    return !dup;
  });
  const ideas = unique.map((idea, index) => {
    const evidence_refs = cleanRefs(idea.evidence_refs);
    let evidence_mode = idea.evidence_mode;
    // 근거 인용이 없는데 evidence_based면 hybrid로 낮춘다. 새 조합 아이디어 자체는 증명된 사실이 아니다.
    if (evidence_mode === "evidence_based" && !evidence_refs.length) { evidence_mode = "hybrid_inference"; downgradedModes += 1; }
    let id = `idea-${index + 1}-${idea.creativity_level.toLowerCase()}-${idea.idea_type}`;
    while (seen.has(id)) id += "x";
    seen.add(id);
    return { ...idea, id, trendA: trendNames[0], trendB: trendNames[1], ...(trendKeys ? { source_trend_ids: [...trendKeys] } : {}), evidence_refs, evidence_mode, created_at: now, cardnews_slides: [...idea.cardnews_slides].sort((x, y) => slideRoles.indexOf(x.role) - slideRoles.indexOf(y.role)) };
  });
  const missingLevels = creativityLevels.filter((level) => !ideas.some((idea) => idea.creativity_level === level));
  const genericTitles = ideas.filter((idea) => GENERIC.test(idea.title) || GENERIC.test(idea.concept_line)).map((idea) => idea.title);
  const levelCounts = Object.fromEntries(creativityLevels.map((level) => [level, ideas.filter((idea) => idea.creativity_level === level).length])) as Record<CreativityLevel, number>;
  return { result: { structure, ideas, limitations: raw.limitations }, validation: { removedRefs: [...new Set(removed)], downgradedModes, missingLevels, levelCounts, droppedDuplicates, typeCount: new Set(ideas.map((idea) => idea.idea_type)).size, genericTitles } };
}

/* ---------- Content Studio·Workspace 연결 ---------- */

export const creativeSavedId = (run: CreativeRun) => `creative-${run.id}`;
export function creativeSavedItem(run: CreativeRun, now = new Date().toISOString()): SavedItem {
  const idea = run.result.ideas.find((item) => item.id === run.selectedIdeaId);
  return {
    id: creativeSavedId(run), type: "insight", mode: "live",
    title: idea ? `${idea.title} — Creative Collision` : `${run.trendNames.join(" × ")} — Creative Collision`,
    subtitle: `${run.trendNames.join(" × ")} · 아이디어 ${run.result.ideas.length}개${idea ? ` · 선택 ${idea.creativity_level} ${ideaTypeLabels[idea.idea_type]}` : ""}${run.visuals.length ? ` · AI 콘셉트 이미지 ${run.visuals.length}` : ""}`,
    createdAt: run.analyzedAt, updatedAt: now,
    payload: { kind: "creative-collision", run, selectedIdeaId: run.selectedIdeaId },
  };
}
export function isCreativePayload(payload: unknown): payload is SavedCreativePayload {
  const p = payload as Partial<SavedCreativePayload> | null | undefined;
  return Boolean(p && p.kind === "creative-collision" && p.run && Array.isArray(p.run.result?.ideas) && Array.isArray(p.run.trendNames));
}

/** 유명 캐릭터·IP를 다루는 아이디어인지(모델 표시 + 키워드). 기능은 막지 않고 "inspired concept" 주의를 붙인다. */
export const needsIpCaution = (idea: Pick<CreativeIdea, "ip_caution">) => idea.ip_caution.trim().length > 0;

