import type { TrendContext } from "./schemas";
import type { LiveAnalysisSnapshot, SavedCollision } from "./types";
import { toTrendContext } from "./live-trend";

/** Lab·Studio의 분석 입력 출처: LIVE 트렌드 1개 또는 저장된 Collision(구성 트렌드 순서 유지) */
export type InsightSource = { id: string; kind: "trend" | "collision"; label: string; detail: string; contexts: TrendContext[]; collision?: SavedCollision };

export function buildInsightSources(snapshots: LiveAnalysisSnapshot[], collisions: SavedCollision[]): InsightSource[] {
  const contexts = new Map(snapshots.map((item) => [item.trendId, toTrendContext(item)] as const));
  const trendSources = snapshots.flatMap((item) => {
    const context = contexts.get(item.trendId);
    return context ? [{ id: `trend:${item.trendId}`, kind: "trend" as const, label: item.trendName, detail: `WHY ${item.dna ? "+ DNA" : "only"} · ${new Date(item.analyzedAt).toLocaleDateString("ko-KR")}`, contexts: [context] }] : [];
  });
  const collisionSources = collisions.flatMap((collision) => {
    // Collision의 근거 ID(T1:…)는 trendKeys 순서에 맞춰져 있으므로 같은 순서로 전달한다.
    const list = collision.trendKeys.map((key) => contexts.get(key)).filter((item): item is TrendContext => Boolean(item));
    return list.length === collision.trendKeys.length ? [{ id: `collision:${collision.id}`, kind: "collision" as const, label: collision.trendNames.join(" × "), detail: `Collision · ${collision.result.title}`, contexts: list, collision }] : [];
  });
  return [...collisionSources, ...trendSources];
}

export function readQueryParam(name: string) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
