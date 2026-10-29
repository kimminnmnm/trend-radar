"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCultureKnowledgeBundle, canonicalizeCultureRelation, restoreCultureMetadata, type CultureAnalysisProvenance, type StoredCultureRelation } from "./culture-database";
import type { StandardizedCultureMetadata } from "./culture-metadata";
import type { EvidenceItem } from "./schemas";
import { getSupabaseBrowserClient } from "./supabase-browser";

export type CultureCloudWriteResult = {
  target: "cloud" | "unavailable";
  message: string;
  trendId?: string;
  analysisVersionId?: string;
  versionNumber?: number;
};

type SavedKnowledgeRow = {
  saved_trend_id: string;
  saved_analysis_version_id: string;
  saved_version_number: number;
};

const migrationHint = (message: string) => /does not exist|schema cache|PGRST/i.test(message)
  ? "Culture Map 데이터베이스 마이그레이션 202610290005를 먼저 적용하세요."
  : message;

async function authenticatedClient(client?: SupabaseClient) {
  const supabase = client ?? getSupabaseBrowserClient();
  if (!supabase) return { ok: false, error: "Supabase가 설정되지 않았습니다." } as const;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { ok: false, error: "로그인이 필요합니다." } as const;
  return { ok: true, supabase, userId: data.user.id } as const;
}

export async function persistCultureKnowledge(
  metadata: StandardizedCultureMetadata,
  evidence: EvidenceItem[],
  client?: SupabaseClient,
  provenance: CultureAnalysisProvenance = {},
): Promise<CultureCloudWriteResult> {
  const auth = await authenticatedClient(client);
  if (!auth.ok) return { target: "unavailable", message: auth.error };
  const bundle = buildCultureKnowledgeBundle(metadata, evidence, provenance);
  const { data, error } = await auth.supabase.rpc("save_culture_knowledge", {
    p_trend: bundle.trend,
    p_analysis: bundle.analysisVersion,
    p_attributes: bundle.attributes,
    p_evidence: bundle.evidence,
  });
  if (error) return { target: "unavailable", message: migrationHint(error.message) };
  const saved = (Array.isArray(data) ? data[0] : data) as SavedKnowledgeRow | null;
  if (!saved) return { target: "unavailable", message: "문화 메타데이터 저장 결과가 비어 있습니다." };
  return {
    target: "cloud",
    message: `Culture metadata v${saved.saved_version_number}을 저장했습니다.`,
    trendId: saved.saved_trend_id,
    analysisVersionId: saved.saved_analysis_version_id,
    versionNumber: saved.saved_version_number,
  };
}

export async function loadCultureKnowledge(client?: SupabaseClient) {
  const auth = await authenticatedClient(client);
  if (!auth.ok) return { configured: Boolean(client ?? getSupabaseBrowserClient()), authenticated: false, versions: [] as StandardizedCultureMetadata[], error: auth.error };
  const { data, error } = await auth.supabase
    .from("culture_analysis_versions")
    .select("metadata,version_number,analyzed_at")
    .eq("user_id", auth.userId)
    .order("analyzed_at", { ascending: false })
    .limit(100);
  if (error) return { configured: true, authenticated: true, versions: [] as StandardizedCultureMetadata[], error: migrationHint(error.message) };
  const versions: StandardizedCultureMetadata[] = [];
  for (const row of data ?? []) {
    const parsed = restoreCultureMetadata(row.metadata);
    versions.push(parsed);
  }
  return { configured: true, authenticated: true, versions };
}

export async function persistCultureRelation(relationInput: StoredCultureRelation, client?: SupabaseClient) {
  const auth = await authenticatedClient(client);
  if (!auth.ok) return { target: "unavailable" as const, message: auth.error };
  const relation = canonicalizeCultureRelation(relationInput);
  const row = {
    user_id: auth.userId,
    source_trend_id: relation.sourceTrendId,
    target_trend_id: relation.targetTrendId,
    source_analysis_version_id: relation.sourceAnalysisVersionId,
    target_analysis_version_id: relation.targetAnalysisVersionId,
    relation_type: relation.relationType,
    common_attribute_ids: relation.commonAttributeIds,
    differential_attribute_ids: relation.differentialAttributeIds,
    score: relation.score,
    reason: relation.reason,
    evidence_ids: relation.evidenceIds,
    verification_status: relation.verificationStatus,
    analyzed_at: relation.analyzedAt,
    model: relation.model ?? null,
    prompt_version: relation.promptVersion ?? null,
  };
  const { error } = await auth.supabase.from("culture_relations").upsert(row, {
    onConflict: "source_analysis_version_id,target_analysis_version_id,relation_type",
  });
  return error
    ? { target: "unavailable" as const, message: migrationHint(error.message) }
    : { target: "cloud" as const, message: "문화 관계를 저장했습니다." };
}
