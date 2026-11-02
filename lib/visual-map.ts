import { snapshotMedia, type VisualMedia } from "./visual-media";
import type { VisualDimensionName, VisualDna } from "./visual-dna";
import type { LiveAnalysisSnapshot } from "./types";

/*
 * PHASE V4 Visual Culture Map: 시각 유사성 레이어.
 * - 기존 문화 관계 엔진·점수(culture-graph)는 바꾸지 않는다. 이 레이어는 별도로 계산하고 별도로 표시한다.
 * - 입력은 저장된 Visual DNA(실제 썸네일을 AI 비전으로 관찰한 결과)뿐이다. 새 API 호출은 없다.
 * - 관찰(observed) 특징과 이미지 인용이 있는 팔레트만 쓴다. 해석(inferred·무드)은 점수에 넣지 않는다.
 * - 시각적으로 닮았다는 것은 문화적 관계·확산·인과를 뜻하지 않는다.
 */
export const VISUAL_SCORE_WEIGHTS = { palette: 0.6, features: 0.4 } as const;
/** 이 점수 이상이고 가까운 색이나 공통 관찰 특징이 하나 이상 있을 때만 선을 그린다. 실측 분포로 보정하지 않은 기준값이다. */
export const VISUAL_EDGE_MIN = 0.4;
/** ΔE(CIE76) 이 값 이하면 "가까운 색"으로 본다. */
export const CLOSE_COLOR_DE = 20;
/** 특징 이름의 글자 2-gram 유사도가 이 값 이상이면 같은 관찰로 본다. */
export const FEATURE_MATCH_MIN = 0.25;
const PALETTE_DE_SCALE = 45;

type Lab = [number, number, number];
export function hexToLab(hex: string): Lab {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255).map((c) => (c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92));
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, y = r * 0.2126 + g * 0.7152 + b * 0.0722, z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
export function deltaE(a: string, b: string) {
  const [x, y] = [hexToLab(a), hexToLab(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

export type PaletteColor = VisualDna["palette"][number];
export type CloseColor = { source: PaletteColor; target: PaletteColor; deltaE: number };

/** 양쪽 팔레트의 각 색이 상대 팔레트에서 가장 가까운 색과 얼마나 가까운지의 평균(0~1). 한쪽이 비면 null. */
export function paletteSimilarity(a: PaletteColor[], b: PaletteColor[]): { score: number | null; close: CloseColor[] } {
  if (!a.length || !b.length) return { score: null, close: [] };
  const nearest = (color: PaletteColor, others: PaletteColor[]) => others.map((other) => ({ other, d: deltaE(color.hex, other.hex) })).sort((x, y) => x.d - y.d)[0];
  const closeness = (d: number) => Math.max(0, 1 - d / PALETTE_DE_SCALE);
  const forward = a.map((color) => ({ color, ...nearest(color, b) }));
  const backward = b.map((color) => nearest(color, a));
  const score = (forward.reduce((sum, item) => sum + closeness(item.d), 0) / a.length + backward.reduce((sum, item) => sum + closeness(item.d), 0) / b.length) / 2;
  const used = new Set<string>();
  const close = forward.filter((item) => item.d <= CLOSE_COLOR_DE).sort((x, y) => x.d - y.d)
    .filter((item) => { if (used.has(item.other.hex)) return false; used.add(item.other.hex); return true; })
    .map((item) => ({ source: item.color, target: item.other, deltaE: Math.round(item.d) }));
  return { score, close };
}

export function labelSimilarity(a: string, b: string) {
  const grams = (value: string) => { const text = value.toLocaleLowerCase("ko-KR").replace(/[^\p{L}\p{N}]+/gu, ""); const set = new Set<string>(); for (let i = 0; i < text.length - 1; i += 1) set.add(text.slice(i, i + 2)); return set; };
  const x = grams(a), y = grams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0; for (const gram of x) if (y.has(gram)) shared += 1;
  return shared / (x.size + y.size - shared);
}

export type ObservedFeature = { dimension: VisualDimensionName; label: string; description: string; mediaIds: string[] };
/** 점수에 쓰는 관찰 특징: basis observed이고 실제 이미지 인용이 있는 것만. */
export function observedFeatures(dna: VisualDna): ObservedFeature[] {
  return dna.dimensions.flatMap((dimension) => dimension.features.filter((feature) => feature.basis === "observed" && feature.mediaIds.length > 0).map((feature) => ({ dimension: dimension.dimension, label: feature.label, description: feature.description, mediaIds: feature.mediaIds })));
}

export type SharedFeature = { dimension: VisualDimensionName; source: ObservedFeature; target: ObservedFeature; similarity: number };
/** 같은 시각 차원 안에서 이름이 비슷한 관찰 특징을 1:1로 짝짓는다(가장 비슷한 쌍부터). */
export function matchFeatures(a: ObservedFeature[], b: ObservedFeature[]): { score: number | null; shared: SharedFeature[]; onlySource: ObservedFeature[]; onlyTarget: ObservedFeature[] } {
  if (!a.length || !b.length) return { score: null, shared: [], onlySource: a, onlyTarget: b };
  const pairs = a.flatMap((x) => b.filter((y) => y.dimension === x.dimension).map((y) => ({ x, y, s: labelSimilarity(x.label, y.label) }))).filter((pair) => pair.s >= FEATURE_MATCH_MIN).sort((p, q) => q.s - p.s);
  const usedA = new Set<ObservedFeature>(), usedB = new Set<ObservedFeature>();
  const shared: SharedFeature[] = [];
  for (const pair of pairs) {
    if (usedA.has(pair.x) || usedB.has(pair.y)) continue;
    usedA.add(pair.x); usedB.add(pair.y);
    shared.push({ dimension: pair.x.dimension, source: pair.x, target: pair.y, similarity: Math.round(pair.s * 100) / 100 });
  }
  return { score: (2 * shared.length) / (a.length + b.length), shared, onlySource: a.filter((item) => !usedA.has(item)), onlyTarget: b.filter((item) => !usedB.has(item)) };
}

export type VisualRelation = {
  id: string;
  source: string;
  target: string;
  /** 0~1. 알고리즘 기반 시각 유사 지표이며 확률·문화 관계가 아니다. */
  score: number;
  breakdown: { palette: number | null; features: number | null };
  closeColors: CloseColor[];
  sharedFeatures: SharedFeature[];
  onlySource: ObservedFeature[];
  onlyTarget: ObservedFeature[];
  analyzedAt: { source: string; target: string };
};

/** 두 Visual DNA의 시각 유사도. 비교할 관찰이 하나도 없으면 null. */
export function compareVisualDna(a: VisualDna, b: VisualDna) {
  const palette = paletteSimilarity(a.palette, b.palette);
  const features = matchFeatures(observedFeatures(a), observedFeatures(b));
  const parts = ([["palette", palette.score], ["features", features.score]] as const).filter(([, value]) => value !== null) as Array<[keyof typeof VISUAL_SCORE_WEIGHTS, number]>;
  if (!parts.length) return null;
  const weight = parts.reduce((sum, [key]) => sum + VISUAL_SCORE_WEIGHTS[key], 0);
  const score = parts.reduce((sum, [key, value]) => sum + VISUAL_SCORE_WEIGHTS[key] * value, 0) / weight;
  return { score: Math.round(score * 1000) / 1000, breakdown: { palette: palette.score, features: features.score }, closeColors: palette.close, sharedFeatures: features.shared, onlySource: features.onlySource, onlyTarget: features.onlyTarget };
}

/** Visual DNA가 있는 트렌드끼리만 비교한다. 없는 트렌드는 missing으로 돌려주고 선을 만들지 않는다. */
export function buildVisualRelations(snapshots: Pick<LiveAnalysisSnapshot, "trendId" | "visualDna">[]) {
  const withDna = snapshots.filter((item) => item.visualDna?.result);
  const relations: VisualRelation[] = [];
  for (let i = 0; i < withDna.length; i += 1) for (let j = i + 1; j < withDna.length; j += 1) {
    const [a, b] = [withDna[i], withDna[j]];
    const compared = compareVisualDna(a.visualDna!.result, b.visualDna!.result);
    if (!compared || compared.score < VISUAL_EDGE_MIN || (!compared.closeColors.length && !compared.sharedFeatures.length)) continue;
    const [source, target] = [a.trendId, b.trendId];
    relations.push({ id: `visual:${source < target ? `${source}|${target}` : `${target}|${source}`}`, source, target, ...compared, analyzedAt: { source: a.visualDna!.analyzedAt, target: b.visualDna!.analyzedAt } });
  }
  return { relations, analyzed: withDna.map((item) => item.trendId), missing: snapshots.filter((item) => !item.visualDna?.result).map((item) => item.trendId) };
}

/** 노드·비교 화면에 쓰는 실제 수집 이미지(원본 URL 그대로). Visual DNA 분석에 쓴 이미지를 먼저 둔다. */
export function trendImages(snapshot: Parameters<typeof snapshotMedia>[0] & Pick<LiveAnalysisSnapshot, "visualDna">, limit = 4): VisualMedia[] {
  const analyzed = new Set(snapshot.visualDna?.media.map((item) => item.mediaId) ?? []);
  const media = snapshotMedia(snapshot).filter((item) => item.thumbnailUrl);
  return [...media.filter((item) => analyzed.has(item.mediaId)), ...media.filter((item) => !analyzed.has(item.mediaId))].slice(0, limit);
}
