"use client";

import { apiFetch } from "./api-fetch";
import { buildCultureGraph, relationTypeLabels } from "./culture-graph";
import { currentRelationRecords } from "./culture-pipeline";
import { inputReport, previewSignals, toCreativeTrendInput, type CreativePriorInput, type CreativeRelationInput, type CreativeRun, type IdeaType } from "./creative-collision";
import type { LiveAnalysisSnapshot, SavedCollision } from "./types";

/*
 * Creative Collision 입력 구성·생성 요청(공용). Creative Collision 화면과 Content Studio의 CREATIVE COLLISION MODE가 같은 코드를 쓴다
 * — 같은 두 트렌드면 같은 요청(같은 서버 캐시 키)이 나간다.
 */
export type CreativeInputs = NonNullable<ReturnType<typeof buildCreativeInputs>>;
export type SelectedConnectionInput = { id: string; title: string; subject?: string; action?: string; object?: string; direction: string; context: string; evidenceIds?: string[]; verificationStatus: string; evidenceCount: number };

export function buildCreativeInputs(snapshots: LiveAnalysisSnapshot[], aKey: string, bKey: string, ledger: Parameters<typeof currentRelationRecords>[0] | null | undefined, collisions: SavedCollision[], selected?: SelectedConnectionInput | null) {
  const a = snapshots.find((item) => item.trendId === aKey), b = snapshots.find((item) => item.trendId === bKey);
  if (!a || !b || a.trendId === b.trendId) return null;
  const ta = toCreativeTrendInput(a, "A"), tb = toCreativeTrendInput(b, "B");
  const pair = snapshots.filter((item) => item.trendId === a.trendId || item.trendId === b.trendId);
  const rel = buildCultureGraph(pair, [], ledger ? currentRelationRecords(ledger, pair) : undefined).relations[0];
  const relation: CreativeRelationInput = rel || selected ? { type: selected?.verificationStatus ?? relationTypeLabels[rel!.primary.type].ko, score: rel?.score ?? null, sharedAttributes: [...(selected ? [selected.subject, selected.action, selected.object, selected.direction, selected.title] : []), ...(rel?.sharedAttributes.map((item) => item.canonicalLabel) ?? [])].filter((item): item is string => Boolean(item)).slice(0, 12), signals: Math.max(rel?.edges.length ?? 0, selected?.evidenceCount ?? 0), ...(selected ? { selectedConnectionId: selected.id, selectedPhenomenon: selected.title, subject: selected.subject, action: selected.action, object: selected.object, direction: selected.direction, culturalContext: selected.context, evidenceIds: selected.evidenceIds, verificationStatus: selected.verificationStatus } : {}) } : null;
  const priorRun = collisions.find((item) => item.trendKeys.length === 2 && item.trendKeys.includes(a.trendId) && item.trendKeys.includes(b.trendId));
  const prior: CreativePriorInput = priorRun ? { title: priorRun.result.title, opportunities: priorRun.result.creativeOpportunities.map((item) => `${item.title}: ${item.concept}`.slice(0, 400)).slice(0, 6), tensions: priorRun.result.culturalTensions.map((item) => `${item.title}: ${item.description}`.slice(0, 400)).slice(0, 6) } : null;
  return { a: ta, b: tb, relation, prior, report: inputReport(ta, tb, relation, prior), preview: previewSignals(ta, tb) };
}

/** /api/creative-collision 1회(비용 가중치 2). 호출 전 확인은 화면이 한다. */
export async function requestCreativeRun(inputs: CreativeInputs, options: { force?: boolean; focusType?: IdeaType } = {}): Promise<CreativeRun> {
  const response = await apiFetch("/api/creative-collision", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: inputs.a, b: inputs.b, relation: inputs.relation, prior: inputs.prior, focusType: options.focusType, force: Boolean(options.force) }) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || "Creative Collision 생성에 실패했습니다.");
  const now = new Date().toISOString();
  return { id: `cc-${Date.now()}`, trendKeys: [inputs.a.key, inputs.b.key], trendNames: [inputs.a.name, inputs.b.name], focusType: options.focusType, analyzedAt: body.analyzedAt, updatedAt: now, model: body.model, promptVersion: body.promptVersion, result: body.result, inputs: body.inputs, validation: body.validation, selectedIdeaId: body.result.ideas[0]?.id, visuals: [] };
}
