import "server-only";
import { callStructured } from "./openai-client";
import { dnaDimensionNames } from "./schemas";
import { VISUAL_DNA_PROMPT_VERSION, validateVisualDna, visualDimensionNames, visualDnaSchema, type VisualDnaMedia } from "./visual-dna";

const arr = (items: object) => ({ type: "array", items });
const str = { type: "string" };
const statusEnum = { type: "string", enum: ["Verified Signal", "Supported Hypothesis", "Creative Hypothesis", "Insufficient Evidence"] };
const jsonSchema = {
  type: "object", additionalProperties: false,
  required: ["trend", "palette", "dimensions", "commonFeatures", "dnaLinks", "limitations"],
  properties: {
    trend: str,
    palette: arr({ type: "object", additionalProperties: false, required: ["hex", "name", "mediaIds"], properties: { hex: str, name: str, mediaIds: arr(str) } }),
    dimensions: arr({ type: "object", additionalProperties: false, required: ["dimension", "summary", "features"], properties: {
      dimension: { type: "string", enum: [...visualDimensionNames] }, summary: str,
      features: arr({ type: "object", additionalProperties: false, required: ["label", "description", "basis", "mediaIds", "status"], properties: { label: str, description: str, basis: { type: "string", enum: ["observed", "inferred"] }, mediaIds: arr(str), status: statusEnum } }),
    } }),
    commonFeatures: arr({ type: "object", additionalProperties: false, required: ["label", "description", "dimension", "mediaIds"], properties: { label: str, description: str, dimension: { type: "string", enum: [...visualDimensionNames] }, mediaIds: arr(str) } }),
    dnaLinks: arr({ type: "object", additionalProperties: false, required: ["dnaDimension", "visualDimension", "note"], properties: { dnaDimension: { type: "string", enum: [...dnaDimensionNames] }, visualDimension: { type: "string", enum: [...visualDimensionNames] }, note: str } }),
    limitations: arr(str),
  },
};

const INSTRUCTIONS = `당신은 시각 문화 분석가입니다. 제공된 이미지(공개 영상 썸네일)만 보고 트렌드의 시각적 특징을 한국어로 구조화합니다.
규칙:
- 이미지 ID(M1, M2 …)만 인용하세요. 목록에 없는 ID를 만들지 마세요.
- basis "observed"는 그 이미지에서 실제로 보이는 것(색, 글자 모양, 질감, 구도, 사물)이며 반드시 해당 이미지 ID를 인용합니다.
- basis "inferred"는 해석입니다(무드, 의미, 동기). Visual Mood는 항상 inferred입니다.
- 썸네일은 전체 트렌드를 대표하지 않는 작은 표본입니다. 표본 밖으로 일반화하지 말고 limitations에 적으세요.
- 사람의 신원, 나이, 인종 등 민감한 속성을 추정하지 마세요.
- palette는 실제로 보이는 주요 색 3~6개를 #rrggbb로, 그 색이 보이는 이미지 ID와 함께 적으세요.
- commonFeatures는 서로 다른 이미지 2장 이상에서 공통으로 보이는 특징만 적으세요.
- dnaLinks는 시각적 특징이 TREND DNA 차원(Aesthetic, Emotion, Behavior, Object, Culture, Audience) 중 어디와 연결되는지 짧게 적으세요.
- status: 이미지에서 직접 보이는 관찰은 "Supported Hypothesis", 해석은 "Creative Hypothesis", 판단 근거가 부족하면 "Insufficient Evidence".`;

/** 실제 썸네일로 Visual DNA를 만든다. 이미지 ID는 프롬프트에서 M1..Mn 별칭으로 쓰고 결과에서 mediaId로 되돌린다. */
export async function analyzeVisualDnaWithOpenAI(trend: string, media: VisualDnaMedia[]) {
  const alias = new Map(media.map((item, index) => [`M${index + 1}`, item.mediaId]));
  const list = media.map((item, index) => `M${index + 1}: ${item.title.slice(0, 120)} (YouTube 썸네일)`).join("\n");
  const { data, model } = await callStructured({
    name: "visual_dna", jsonSchema, validator: visualDnaSchema, instructions: INSTRUCTIONS, maxOutputTokens: 3500,
    input: `트렌드: ${trend}\n이미지 목록(순서대로 첨부):\n${list}`,
    images: media.map((item) => ({ url: item.thumbnailUrl! })),
  });
  const back = (ids: string[]) => ids.map((id) => alias.get(id.trim().toUpperCase()) ?? id);
  const mapped = {
    ...data,
    palette: data.palette.map((item) => ({ ...item, mediaIds: back(item.mediaIds) })),
    dimensions: data.dimensions.map((dimension) => ({ ...dimension, features: dimension.features.map((feature) => ({ ...feature, mediaIds: back(feature.mediaIds) })) })),
    commonFeatures: data.commonFeatures.map((item) => ({ ...item, mediaIds: back(item.mediaIds) })),
  };
  const { dna, validation } = validateVisualDna(mapped, media.map((item) => item.mediaId));
  return { dna, validation, model, promptVersion: VISUAL_DNA_PROMPT_VERSION };
}
