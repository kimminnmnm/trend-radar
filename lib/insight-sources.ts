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

/**
 * URL로 받은 Collision ID 조회. 다른 출처로 조용히 바꾸지 않는다.
 * loading: 저장 데이터를 아직 읽는 중 · not-found: 이 브라우저(현재 계정)에 없음(삭제·다른 계정·다른 브라우저)
 * incomplete: Collision은 있지만 구성 트렌드의 WHY 스냅샷이 없거나 근거가 없어 검토 입력이 부족함 · ready: 그대로 검토 가능.
 */
export type CollisionLookup =
  | { state: "loading" }
  | { state: "not-found"; id: string }
  | { state: "incomplete"; collision: SavedCollision; contexts: TrendContext[]; missing: Array<{ key: string; name: string; reason: "no-snapshot" | "no-evidence" }> }
  | { state: "ready"; source: InsightSource };
export function resolveCollisionSource(id: string, snapshots: LiveAnalysisSnapshot[] | null, collisions: SavedCollision[] | null): CollisionLookup {
  if (snapshots === null || collisions === null) return { state: "loading" };
  const collision = collisions.find((item) => item.id === id);
  if (!collision) return { state: "not-found", id };
  const byId = new Map(snapshots.map((item) => [item.trendId, item] as const));
  const contexts: TrendContext[] = [], missing: Array<{ key: string; name: string; reason: "no-snapshot" | "no-evidence" }> = [];
  collision.trendKeys.forEach((key, index) => {
    const snapshot = byId.get(key), context = snapshot ? toTrendContext(snapshot) : null;
    if (context) contexts.push(context); else missing.push({ key, name: collision.trendNames[index] ?? key, reason: snapshot ? "no-evidence" : "no-snapshot" });
  });
  if (missing.length) return { state: "incomplete", collision, contexts, missing };
  return { state: "ready", source: { id: `collision:${collision.id}`, kind: "collision", label: collision.trendNames.join(" × "), detail: `Collision · ${collision.result.title}`, contexts, collision } };
}

export function readQueryParam(name: string) {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}
