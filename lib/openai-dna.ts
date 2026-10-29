import "server-only";
import { dnaDimensionNames, trendDnaSchema, type EvidenceItem, type SeriesStats, type TrendDna } from "./schemas";
import { callStructured, createEmbedding, EMBEDDING_MODEL, js } from "./openai-client";
import { ledgerForPrompt } from "./evidence-ledger";
import { enforceStatus, sanitizeIds, type ValidationLog } from "./signal";

export const TREND_DNA_PROMPT_VERSION = "dna-live-v1";

const attribute = js.obj({ label: js.str, description: js.str, evidenceIds: js.strArr, status: js.status, limitations: js.strArr });
const dnaJsonSchema = js.obj({
  trend: js.str,
  dimensions: js.arr(js.obj({ dimension: js.enumOf(dnaDimensionNames), summary: js.str, attributes: js.arr(attribute) })),
  dominantPattern: js.obj({ title: js.str, explanation: js.str, evidenceIds: js.strArr, status: js.status }),
  missingEvidence: js.strArr,
});

const instructions = [
  "You are TREND RADAR's cultural DNA analyst. Return Korean output only in the JSON schema.",
  "Decompose the trend into exactly six dimensions, each once, in this order: Aesthetic, Emotion, Behavior, Object, Culture, Audience. Give 2-5 attributes per dimension.",
  "Input is a prior TREND WHY report plus the server-built EVIDENCE LEDGER. Cite evidence only by exact ledger ids. Never invent ids, sources, numbers, or quotes.",
  "NAVER-xx evidence only shows relative search interest over time. It cannot support claims about aesthetics, emotions, behavior, objects, or demographics.",
  "IG-xx evidence is a small sample of hashtag posts. A word, object, or style that literally appears in a cited caption may be Verified Signal, described as 'observed in sampled posts', never as representative of all users.",
  "Emotion and Audience are inferences: use Supported Hypothesis only when captions plausibly indicate them, otherwise Creative Hypothesis or Insufficient Evidence. Never state age, gender, income, or other demographics as fact.",
  "If a dimension cannot be grounded, still return it with an attribute whose status is Insufficient Evidence, an empty evidenceIds array, and a limitation explaining what data is missing.",
  "Every attribute must list concrete limitations (may be one short item). Do not produce scores or percentages.",
  "dominantPattern summarises the recurring cross-dimension pattern; mark its status honestly.",
].join(" ");

export type DnaResult = { dna: TrendDna; model: string; generatedAt: string; promptVersion: string; validation: ValidationLog; embedding: number[] | null; embeddingModel: string | null };

export function validateDna(raw: TrendDna, evidence: EvidenceItem[]): { dna: TrendDna; validation: ValidationLog } {
  const valid = new Set(evidence.map((item) => item.id));
  const removed: string[] = [];
  const counter = { downgraded: 0 };
  const dimensions = dnaDimensionNames.map((name) => {
    const found = raw.dimensions.find((item) => item.dimension === name);
    if (!found) return { dimension: name, summary: "모델이 이 차원을 반환하지 않았습니다.", attributes: [{ label: "분석 공백", description: "이 차원에 대한 분석 결과가 없습니다.", evidenceIds: [], status: "Insufficient Evidence" as const, limitations: ["모델 출력 누락"] }] };
    const attributes = found.attributes.slice(0, 6).map((attr) => {
      const evidenceIds = sanitizeIds(attr.evidenceIds, valid, removed);
      const status = enforceStatus(attr.status, evidenceIds, counter);
      const limitations = status !== attr.status ? [...attr.limitations, "인용한 근거가 원장에 없어 서버에서 상태를 낮췄습니다."] : attr.limitations;
      return { ...attr, evidenceIds, status, limitations };
    });
    return { ...found, attributes };
  });
  const patternIds = sanitizeIds(raw.dominantPattern.evidenceIds, valid, removed);
  return {
    dna: { ...raw, dimensions, dominantPattern: { ...raw.dominantPattern, evidenceIds: patternIds, status: enforceStatus(raw.dominantPattern.status, patternIds, counter) } },
    validation: { removedEvidenceIds: [...new Set(removed)], downgraded: counter.downgraded },
  };
}

export function dnaEmbeddingText(dna: TrendDna) {
  return [dna.trend, ...dna.dimensions.map((d) => `${d.dimension}: ${d.summary} / ${d.attributes.map((a) => a.label).join(", ")}`), dna.dominantPattern.title].join("\n");
}

export async function analyzeDnaWithOpenAI(params: { trend: string; why: unknown; evidence: EvidenceItem[]; stats?: SeriesStats[] }): Promise<DnaResult> {
  const input = [
    `분석 대상: ${params.trend}`,
    `TREND WHY 결과(JSON): ${JSON.stringify(params.why)}`,
    params.stats ? `NAVER 서버 계산 통계: ${JSON.stringify(params.stats)}` : "",
    `EVIDENCE LEDGER: ${JSON.stringify(ledgerForPrompt(params.evidence))}`,
  ].filter(Boolean).join("\n");
  const { data, model } = await callStructured({ name: "trend_dna_analysis", jsonSchema: dnaJsonSchema, validator: trendDnaSchema, instructions, input, maxOutputTokens: 6000 });
  const { dna, validation } = validateDna(data, params.evidence);
  let embedding: number[] | null = null;
  try { embedding = await createEmbedding(dnaEmbeddingText(dna)); } catch { embedding = null; }
  return { dna, model, generatedAt: new Date().toISOString(), promptVersion: TREND_DNA_PROMPT_VERSION, validation, embedding, embeddingModel: embedding ? EMBEDDING_MODEL : null };
}
