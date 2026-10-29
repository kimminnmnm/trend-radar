import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCultureKnowledgeBundle, canonicalizeCultureRelation, cultureRelationDeduplicationKey, restoreCultureMetadata } from "../lib/culture-database";
import { loadCultureKnowledge, persistCultureKnowledge } from "../lib/culture-cloud-storage";
import { standardizeCultureMetadata } from "../lib/culture-metadata";
import { dnaDimensionNames, trendDnaSchema, type EvidenceItem } from "../lib/schemas";

const timestamp = "2026-10-29T04:00:00.000Z";
const evidence: EvidenceItem[] = [{ id: "IG-01", kind: "instagram_media", title: "sample", source: "fixture", collectedAt: timestamp, excerpt: "sample" }];
const dna = trendDnaSchema.parse({
  trend: "테스트 트렌드",
  dimensions: dnaDimensionNames.map((dimension) => ({
    dimension,
    summary: `${dimension} summary`,
    attributes: [{ label: `${dimension} attribute`, description: "description", evidenceIds: dimension === "Object" ? ["IG-01"] : [], status: dimension === "Object" ? "Verified Signal" : "Insufficient Evidence", limitations: [] }],
  })),
  dominantPattern: { title: "pattern", explanation: "description", evidenceIds: [], status: "Creative Hypothesis" },
  missingEvidence: [],
});

test.describe("Culture knowledge database contract", () => {
  test("builds normalized trend, version, attributes, and evidence rows without losing metadata", () => {
    const metadata = standardizeCultureMetadata({ trendId: "live-test", trendName: "테스트 트렌드", sourceAnalyzedAt: timestamp, updatedAt: timestamp, dna, evidence });
    const bundle = buildCultureKnowledgeBundle(metadata, evidence);

    expect(bundle.trend.trendKey).toBe("live-test");
    expect(bundle.analysisVersion.schemaVersion).toBe("culture-metadata-v1");
    expect(bundle.attributes).toHaveLength(6);
    expect(bundle.evidence.map((item) => item.evidenceKey)).toEqual(["IG-01"]);
    expect(restoreCultureMetadata(bundle.analysisVersion.metadata)).toEqual(metadata);
    expect(bundle.analysisVersion.originalDna).toEqual(dna);
  });

  test("canonicalizes relation endpoints and creates an order-independent duplicate key", () => {
    const relation = {
      sourceTrendId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      targetTrendId: "11111111-1111-4111-8111-111111111111",
      sourceAnalysisVersionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      targetAnalysisVersionId: "22222222-2222-4222-8222-222222222222",
      relationType: "shared_attribute" as const,
      commonAttributeIds: ["attr-behavior-12345678"],
      differentialAttributeIds: [],
      score: 0.8,
      reason: "reviewed shared attribute",
      evidenceIds: ["IG-01"],
      verificationStatus: "Supported Hypothesis" as const,
      analyzedAt: timestamp,
    };
    const reversed = canonicalizeCultureRelation(relation);

    expect(reversed.sourceTrendId).toBe(relation.targetTrendId);
    expect(reversed.sourceAnalysisVersionId).toBe(relation.targetAnalysisVersionId);
    expect(cultureRelationDeduplicationKey(relation)).toBe(cultureRelationDeduplicationKey(reversed));
  });

  test("migration defines ownership constraints, RLS, versioning, and relation deduplication", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202610290005_culture_knowledge.sql"), "utf8");
    const tables = ["culture_trends", "culture_analysis_versions", "culture_evidence_items", "culture_trend_attributes", "culture_relations"];

    for (const table of tables) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`on public.${table}`);
    }
    expect(sql).toContain("culture_analysis_trend_version_unique");
    expect(sql).toContain("culture_relation_version_type_unique");
    expect(sql).toContain("culture_relation_distinct_trends_check");
    expect(sql).toContain("references public.trend_analyses(id, user_id)");
    expect(sql).not.toContain("grant all");
  });

  test("cloud adapter stores and reads a validated metadata version through the Supabase contract", async () => {
    const metadata = standardizeCultureMetadata({ trendId: "live-test", trendName: "테스트 트렌드", sourceAnalyzedAt: timestamp, updatedAt: timestamp, dna, evidence });
    let storedMetadata: unknown = null;
    const fakeClient = {
      auth: { getUser: async () => ({ data: { user: { id: "user-fixture" } }, error: null }) },
      rpc: async (_name: string, payload: { p_analysis: { metadata: unknown } }) => {
        storedMetadata = payload.p_analysis.metadata;
        return { data: [{ saved_trend_id: "trend-db-id", saved_analysis_version_id: "version-db-id", saved_version_number: 1 }], error: null };
      },
      from: () => ({
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: [{ metadata: storedMetadata, version_number: 1, analyzed_at: timestamp }], error: null }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    const saved = await persistCultureKnowledge(metadata, evidence, fakeClient);
    const loaded = await loadCultureKnowledge(fakeClient);

    expect(saved).toMatchObject({ target: "cloud", trendId: "trend-db-id", analysisVersionId: "version-db-id", versionNumber: 1 });
    expect(loaded.versions).toEqual([metadata]);
  });
});
