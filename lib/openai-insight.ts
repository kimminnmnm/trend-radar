import "server-only";
import { collisionSchema, contentPlanSchema, labDimensionNames, labReviewSchema, type CollisionAnalysis, type ContentPlan, type EvidenceItem, type LabReview, type TrendContext } from "./schemas";
import { callStructured, js } from "./openai-client";
import { enforceStatus, sanitizeIds, type ValidationLog } from "./signal";

export const COLLISION_PROMPT_VERSION = "collision-live-v1";
export const LAB_PROMPT_VERSION = "lab-live-v1";
export const STUDIO_PROMPT_VERSION = "studio-live-v1";

const normalize = (value: string) => value.toLocaleLowerCase("ko-KR").replace(/[\s#·_\-]/g, "");

export function prefixEvidenceIds(value: unknown, prefix: string): unknown {
  if (Array.isArray(value)) return value.map((item) => prefixEvidenceIds(item, prefix));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, key === "evidenceIds" && Array.isArray(item) ? item.map((id) => `${prefix}:${String(id)}`) : prefixEvidenceIds(item, prefix)]));
}

/** 여러 트렌드의 근거를 T1:NAVER-01 형식으로 합친다. */
export function buildMultiContext(trends: TrendContext[]) {
  const ledger: EvidenceItem[] = [];
  const refs = trends.map((trend, index) => {
    const ref = `T${index + 1}`;
    trend.evidence.forEach((item) => ledger.push({ ...item, id: `${ref}:${item.id}` }));
    return {
      ref, key: trend.key, name: trend.name, keywords: trend.keywords, analyzedAt: trend.analyzedAt,
      why: prefixEvidenceIds({ origin: trend.why.origin, triggers: trend.why.triggers, motivations: trend.why.motivations, missingEvidence: trend.why.missingEvidence }, ref),
      dna: trend.dna ? prefixEvidenceIds(trend.dna, ref) : null,
      signalStats: trend.signalStats ?? [],
    };
  });
  return { ledger, refs, prompt: JSON.stringify({ trends: refs, evidenceLedger: ledger.map(({ id, kind, title, date, excerpt }) => ({ id, kind, title, date, excerpt })) }) };
}

/** 두 트렌드 DNA에서 정규화 후 동일한 속성 라벨(결정적 계산) */
export function computeLabelOverlaps(trends: TrendContext[]) {
  const overlaps: Array<{ label: string; dimension: string; trendKeys: string[] }> = [];
  const index = new Map<string, { label: string; dimension: string; keys: Set<string> }>();
  for (const trend of trends) for (const dimension of trend.dna?.dimensions ?? []) for (const attr of dimension.attributes) {
    if (attr.status === "Insufficient Evidence") continue;
    const key = `${dimension.dimension}:${normalize(attr.label)}`;
    const entry = index.get(key) ?? { label: attr.label, dimension: dimension.dimension, keys: new Set<string>() };
    entry.keys.add(trend.key);
    index.set(key, entry);
  }
  for (const entry of index.values()) if (entry.keys.size >= 2) overlaps.push({ label: entry.label, dimension: entry.dimension, trendKeys: [...entry.keys] });
  return overlaps;
}

const collisionJsonSchema = js.obj({
  title: js.str,
  sharedAttributes: js.arr(js.obj({ label: js.str, description: js.str, trendKeys: js.strArr, connectionType: js.enumOf(["Shared Cultural Attribute", "Observed Connection", "Hypothesized Connection"]), evidenceIds: js.strArr, status: js.status })),
  culturalTensions: js.arr(js.obj({ title: js.str, description: js.str, status: js.status })),
  motivationHypotheses: js.arr(js.obj({ label: js.str, description: js.str, evidenceIds: js.strArr, status: js.status })),
  emergingSignals: js.arr(js.obj({ label: js.str, description: js.str, evidenceIds: js.strArr, status: js.status })),
  creativeOpportunities: js.arr(js.obj({ title: js.str, concept: js.str, format: js.str, status: js.enumOf(["Creative Hypothesis"]) })),
  limitations: js.strArr,
});

const collisionInstructions = [
  "You are TREND RADAR's culture collision analyst. Return Korean output only in the JSON schema.",
  "Input: 2-4 trends with their LIVE WHY and DNA results, server-computed overlaps, and a namespaced evidence ledger (ids like T1:IG-03). Cite evidence only by exact ledger ids.",
  "trendKeys must use the trend 'key' values from the input.",
  "Connection types: 'Shared Cultural Attribute' = the DNA of both trends contains the attribute. 'Observed Connection' = a cited evidence item itself shows the two trends together (e.g. a caption mentioning both). 'Hypothesized Connection' = your proposal. New cultural combinations are Hypothesized Connection and Creative Hypothesis by default.",
  "Embedding similarity is semantic closeness only; never claim the trends spread together because of it.",
  "Cultural tensions describe differences that could create novelty. Motivation hypotheses must not assert demographics.",
  "Emerging signals must cite evidence; otherwise mark Insufficient Evidence.",
  "Creative opportunities are always Creative Hypothesis: give 2-3 concrete content concepts and formats.",
  "Limitations must state what this analysis does not prove.",
].join(" ");

export async function analyzeCollision(trends: TrendContext[], similarities: Array<{ a: string; b: string; cosine: number }>): Promise<{ result: CollisionAnalysis; model: string; validation: ValidationLog; overlaps: ReturnType<typeof computeLabelOverlaps>; ledger: EvidenceItem[] }> {
  const context = buildMultiContext(trends);
  const overlaps = computeLabelOverlaps(trends);
  const input = `${context.prompt}\nSERVER COMPUTED LABEL OVERLAPS: ${JSON.stringify(overlaps)}\nCLIENT COMPUTED EMBEDDING COSINE (semantic only): ${JSON.stringify(similarities)}`;
  const { data, model } = await callStructured({ name: "culture_collision", jsonSchema: collisionJsonSchema, validator: collisionSchema, instructions: collisionInstructions, input, maxOutputTokens: 6000 });

  const valid = new Set(context.ledger.map((item) => item.id));
  const byId = new Map(context.ledger.map((item) => [item.id, item]));
  const keys = new Set(trends.map((trend) => trend.key));
  const refToKey = new Map(context.refs.map((ref) => [ref.ref, ref.key]));
  const keywordsByKey = new Map(trends.map((trend) => [trend.key, [trend.name, ...trend.keywords].map(normalize)]));
  const overlapLabels = new Set(overlaps.map((item) => normalize(item.label)));
  const removed: string[] = [];
  const counter = { downgraded: 0 };

  const sharedAttributes = data.sharedAttributes.map((item) => {
    const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed);
    const trendKeys = item.trendKeys.filter((key) => keys.has(key));
    let connectionType = item.connectionType;
    if (connectionType === "Observed Connection") {
      // 인용한 근거 본문에 다른 트렌드의 키워드가 실제로 등장해야 Observed로 인정한다.
      const observed = evidenceIds.some((id) => {
        const owner = refToKey.get(id.split(":")[0]);
        const text = normalize(byId.get(id)?.excerpt ?? "");
        return trendKeys.some((key) => key !== owner && (keywordsByKey.get(key) ?? []).some((keyword) => keyword && text.includes(keyword)));
      });
      if (!observed) { connectionType = "Hypothesized Connection"; counter.downgraded += 1; }
    }
    if (connectionType === "Shared Cultural Attribute") {
      const owners = new Set(evidenceIds.map((id) => refToKey.get(id.split(":")[0])));
      if (!overlapLabels.has(normalize(item.label)) && owners.size < 2) { connectionType = "Hypothesized Connection"; counter.downgraded += 1; }
    }
    return { ...item, trendKeys, evidenceIds, connectionType, status: connectionType === "Hypothesized Connection" && item.status === "Verified Signal" ? "Creative Hypothesis" as const : enforceStatus(item.status, evidenceIds, counter) };
  });
  const withIds = <T extends { evidenceIds: string[]; status: CollisionAnalysis["motivationHypotheses"][number]["status"] }>(list: T[]) => list.map((item) => { const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed); return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) }; });
  const result: CollisionAnalysis = { ...data, sharedAttributes, motivationHypotheses: withIds(data.motivationHypotheses), emergingSignals: withIds(data.emergingSignals), culturalTensions: data.culturalTensions.map((item) => ({ ...item, status: item.status === "Verified Signal" ? "Supported Hypothesis" as const : item.status })) };
  return { result, model, validation: { removedEvidenceIds: [...new Set(removed)], downgraded: counter.downgraded }, overlaps, ledger: context.ledger };
}

const labJsonSchema = js.obj({
  overall: js.obj({ verdict: js.str, summary: js.str }),
  dimensions: js.arr(js.obj({ name: js.enumOf(labDimensionNames), verdict: js.str, rationale: js.str, basis: js.enumOf(["Data Evidence", "AI Inference", "Insufficient Evidence"]), evidenceIds: js.strArr, status: js.status })),
  risks: js.strArr,
});

export type BrandBrief = { brand: string; description: string; audience: string; platform: string; opportunity: string };

export async function reviewOpportunity(trends: TrendContext[], collision: CollisionAnalysis | undefined, brief: BrandBrief): Promise<{ result: LabReview; model: string; validation: ValidationLog; ledger: EvidenceItem[] }> {
  const context = buildMultiContext(trends);
  const instructions = [
    "You are TREND RADAR's Trend Lab reviewer. Return Korean output only in the JSON schema.",
    `Review the opportunity across exactly these six dimensions, each once: ${labDimensionNames.join(", ")}.`,
    "basis: 'Data Evidence' only when a cited ledger item directly supports the verdict; 'AI Inference' when it is your reasoning from the analyses; 'Insufficient Evidence' when the data cannot answer it.",
    "Demand may use only NAVER relative-interest evidence and must not be expressed as absolute volume, market size, or a forecast. Brand Fit and Feasibility are usually AI Inference based on the brand brief.",
    "Do not produce numeric scores. Use short qualitative verdicts such as 'Promising', 'Needs validation', 'Weak fit'. List concrete risks.",
    "Cite evidence only by exact ledger ids.",
  ].join(" ");
  const input = `${context.prompt}\nCOLLISION (optional): ${JSON.stringify(collision ?? null)}\nBRAND BRIEF: ${JSON.stringify(brief)}`;
  const { data, model } = await callStructured({ name: "trend_lab_review", jsonSchema: labJsonSchema, validator: labReviewSchema, instructions, input, maxOutputTokens: 4000 });
  const valid = new Set(context.ledger.map((item) => item.id));
  const removed: string[] = [];
  const counter = { downgraded: 0 };
  const dimensions = labDimensionNames.map((name) => {
    const item = data.dimensions.find((dimension) => dimension.name === name) ?? { name, verdict: "Not reviewed", rationale: "모델이 이 항목을 반환하지 않았습니다.", basis: "Insufficient Evidence" as const, evidenceIds: [], status: "Insufficient Evidence" as const };
    let evidenceIds = sanitizeIds(item.evidenceIds, valid, removed);
    if (name === "Demand") evidenceIds = evidenceIds.filter((id) => id.includes("NAVER-"));
    const basis = item.basis === "Data Evidence" && evidenceIds.length === 0 ? "Insufficient Evidence" as const : item.basis;
    if (basis !== item.basis) counter.downgraded += 1;
    return { ...item, evidenceIds, basis, status: enforceStatus(item.status, evidenceIds, counter) };
  });
  return { result: { ...data, dimensions }, model, validation: { removedEvidenceIds: [...new Set(removed)], downgraded: counter.downgraded }, ledger: context.ledger };
}

const planJsonSchema = js.obj({
  title: js.str, background: js.str, target: js.str,
  trendEvidence: js.arr(js.obj({ claim: js.str, evidenceIds: js.strArr, status: js.status })),
  consumerInsight: js.obj({ text: js.str, evidenceIds: js.strArr, status: js.status }),
  culturalConnection: js.obj({ text: js.str, status: js.status }),
  structure: js.arr(js.obj({ step: js.str, heading: js.str, detail: js.str })),
  hooks: js.strArr, caption: js.str, cta: js.str, referenceIds: js.strArr, verifyBeforePublishing: js.strArr,
});

export type StudioBrief = { platform: string; format: string; target: string; tone: string };

export async function createContentPlan(trends: TrendContext[], collision: CollisionAnalysis | undefined, lab: LabReview | undefined, brief: StudioBrief): Promise<{ result: ContentPlan; references: EvidenceItem[]; model: string; validation: ValidationLog }> {
  const context = buildMultiContext(trends);
  const instructions = [
    "You are TREND RADAR's Content Studio planner. Return Korean output only in the JSON schema.",
    "Build an executable content brief grounded in the supplied WHY, DNA, collision, and lab results. Do not add facts that are not in them.",
    "trendEvidence: 2-4 claims, each citing exact ledger ids; claims without ids must be Insufficient Evidence or Creative Hypothesis.",
    "Never write that something is '유행', '급성장', or 'viral' unless NAVER evidence shows a rising direction, and even then describe it as relative search interest.",
    "Do not generalise a generation's psychology. Consumer insight is a hypothesis unless directly evidenced.",
    "structure: 4-7 ordered steps for the chosen format. hooks: 2-3 options. referenceIds: ledger ids worth citing; the server attaches real URLs.",
    "verifyBeforePublishing: concrete checks (copyright of visual references, claims needing data, platform rules).",
  ].join(" ");
  const input = `${context.prompt}\nCOLLISION: ${JSON.stringify(collision ?? null)}\nLAB REVIEW: ${JSON.stringify(lab ?? null)}\nBRIEF: ${JSON.stringify(brief)}`;
  const { data, model } = await callStructured({ name: "content_plan", jsonSchema: planJsonSchema, validator: contentPlanSchema, instructions, input, maxOutputTokens: 5000 });
  const valid = new Set(context.ledger.map((item) => item.id));
  const removed: string[] = [];
  const counter = { downgraded: 0 };
  const trendEvidence = data.trendEvidence.map((item) => { const evidenceIds = sanitizeIds(item.evidenceIds, valid, removed); return { ...item, evidenceIds, status: enforceStatus(item.status, evidenceIds, counter) }; });
  const insightIds = sanitizeIds(data.consumerInsight.evidenceIds, valid, removed);
  const referenceIds = sanitizeIds([...data.referenceIds, ...trendEvidence.flatMap((item) => item.evidenceIds), ...insightIds], valid, removed);
  const references = referenceIds.map((id) => context.ledger.find((item) => item.id === id)!).filter(Boolean);
  return {
    result: { ...data, trendEvidence, consumerInsight: { ...data.consumerInsight, evidenceIds: insightIds, status: enforceStatus(data.consumerInsight.status, insightIds, counter) }, referenceIds },
    references, model, validation: { removedEvidenceIds: [...new Set(removed)], downgraded: counter.downgraded },
  };
}
