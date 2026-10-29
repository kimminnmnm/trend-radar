import { cosineSimilarity, type CulturalRelationshipResult } from "./cultural-relationship-engine";

/*
 * PHASE 6 의미 유사 표시 기준 보정.
 *
 * 실측 8개 트렌드의 DNA 임베딩(text-embedding-3-small, 256차원)은 서로 무관해 보이는 쌍도 cos 0.48~0.62가 나왔다
 * (예: 러닝↔보컬로이드 0.553). 같은 언어·같은 분석 형식의 문장이라 기본 유사도가 높기 때문이다.
 * 엔진의 고정 기준 0.45로는 28쌍 중 27쌍이 연결되어, 약한 관계를 무리하게 잇는 문제가 있었다.
 *
 * 그래서 화면·클라우드에 내보낼 때만 다음 기준을 쓴다. 엔진 결과(원장)는 그대로 보존한다.
 *   threshold = max(SEMANTIC_DISPLAY_FLOOR, 평균 + 1×표준편차)   (현재 트렌드 쌍이 6개 이상일 때)
 *   threshold = SEMANTIC_DISPLAY_FLOOR                            (쌍이 6개 미만일 때)
 */
export const SEMANTIC_DISPLAY_FLOOR = 0.65;
export const MIN_PAIRS_FOR_CALIBRATION = 6;

export type SemanticCalibration = { threshold: number; mean: number | null; std: number | null; pairs: number; calibrated: boolean };

const round = (value: number) => Math.round(value * 1000) / 1000;

export function calibrateSemanticThreshold(embeddings: Array<number[] | null | undefined>): SemanticCalibration {
  const vectors = embeddings.filter((item): item is number[] => Boolean(item?.length));
  const values: number[] = [];
  for (let i = 0; i < vectors.length; i += 1) for (let j = i + 1; j < vectors.length; j += 1) {
    const value = cosineSimilarity(vectors[i], vectors[j]);
    if (value !== null) values.push(value);
  }
  if (values.length < MIN_PAIRS_FOR_CALIBRATION) return { threshold: SEMANTIC_DISPLAY_FLOOR, mean: null, std: null, pairs: values.length, calibrated: false };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const std = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
  return { threshold: round(Math.max(SEMANTIC_DISPLAY_FLOOR, mean + std)), mean: round(mean), std: round(std), pairs: values.length, calibrated: true };
}

/** 표시 기준 미만의 의미 유사 신호를 뺀 신호 목록. 비어 있으면 그 쌍은 화면에 선을 그리지 않는다. */
export function displayableSignals(result: CulturalRelationshipResult, threshold: number) {
  return result.signals.filter((signal) => signal.type !== "semantic_similarity" || (signal.score ?? 0) >= threshold);
}
