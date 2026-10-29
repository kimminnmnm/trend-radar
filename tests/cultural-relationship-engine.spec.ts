import { expect, test } from "@playwright/test";
import { analyzeCulturalRelationship, RELATION_SCORE_WEIGHTS, type RelationshipTrendInput } from "../lib/cultural-relationship-engine";
import { standardizeCultureMetadata } from "../lib/culture-metadata";
import { dnaDimensionNames, trendDnaSchema, type EvidenceItem } from "../lib/schemas";

const analyzedAt = "2026-10-29T06:00:00.000Z";

function trend(params: {
  id: string;
  name: string;
  behaviorLabel: string;
  evidence?: EvidenceItem[];
  embedding?: number[];
  keywords?: string[];
}): RelationshipTrendInput {
  const evidence = params.evidence ?? [];
  const evidenceId = evidence[0]?.id;
  const dna = trendDnaSchema.parse({
    trend: params.name,
    dimensions: dnaDimensionNames.map((dimension) => ({
      dimension,
      summary: `${dimension} summary`,
      attributes: [{
        label: dimension === "Behavior" ? params.behaviorLabel : `${params.id}-${dimension}`,
        description: `${dimension} description`,
        evidenceIds: dimension === "Behavior" && evidenceId ? [evidenceId] : [],
        status: dimension === "Behavior" && evidenceId ? "Verified Signal" : "Insufficient Evidence",
        limitations: [],
      }],
    })),
    dominantPattern: { title: "pattern", explanation: "description", evidenceIds: [], status: "Creative Hypothesis" },
    missingEvidence: [],
  });
  return {
    trendId: params.id,
    trendName: params.name,
    keywords: params.keywords ?? [],
    evidence,
    embedding: params.embedding,
    metadata: standardizeCultureMetadata({ trendId: params.id, trendName: params.name, sourceAnalyzedAt: analyzedAt, updatedAt: analyzedAt, dna, evidence }),
  };
}

const evidence = (id: string, excerpt = "independent sample"): EvidenceItem => ({ id, kind: "instagram_media", title: "sample post", source: "fixture", collectedAt: analyzedAt, excerpt });

test.describe("Cultural relationship engine", () => {
  test("matches only evidence-grounded canonical Attribute IDs and reports differential attributes", () => {
    const a = trend({ id: "live-a", name: "Alpha", behaviorLabel: "개인화", evidence: [evidence("A-01")] });
    const b = trend({ id: "live-b", name: "Beta", behaviorLabel: "개인화", evidence: [evidence("B-01")] });
    const result = analyzeCulturalRelationship(a, b, { analyzedAt });

    expect(result.exists).toBe(true);
    expect(result.primaryType).toBe("shared_attribute");
    expect(result.sharedAttributes).toHaveLength(1);
    expect(result.sharedAttributes[0]).toMatchObject({ canonicalLabel: "개인화", dimension: "Behavior" });
    expect(result.scoreBreakdown.attribute).toBe(1);
    expect(result.score).toBe(RELATION_SCORE_WEIGHTS.attribute);
    expect(result.evidenceIds.sort()).toEqual(["live-a:A-01", "live-b:B-01"]);
  });

  test("creates semantic similarity as a hypothesis, not verified evidence", () => {
    const a = trend({ id: "live-a", name: "Alpha", behaviorLabel: "수집", embedding: [1, 0] });
    const b = trend({ id: "live-b", name: "Beta", behaviorLabel: "공유", embedding: [0.9, 0.1] });
    const result = analyzeCulturalRelationship(a, b, { analyzedAt });
    const semantic = result.signals.find((signal) => signal.type === "semantic_similarity");

    expect(result.exists).toBe(true);
    expect(result.primaryType).toBe("semantic_similarity");
    expect(semantic?.verificationStatus).toBe("Creative Hypothesis");
    expect(semantic?.evidenceIds).toEqual([]);
    expect(result.reason).toContain("실제 상호작용이나 확산의 증거가 아닙니다");
  });

  test("detects a sampled cross-mention and keeps its exact evidence ID", () => {
    const a = trend({ id: "live-a", name: "Alpha", behaviorLabel: "수집", evidence: [evidence("A-01", "Beta 챌린지와 함께 기록한 게시물")] });
    const b = trend({ id: "live-b", name: "Beta", behaviorLabel: "공유", evidence: [evidence("B-01")], keywords: ["Beta 챌린지"] });
    const result = analyzeCulturalRelationship(a, b, { analyzedAt });

    expect(result.primaryType).toBe("observed_connection");
    expect(result.verificationStatus).toBe("Verified Signal");
    expect(result.evidenceIds).toEqual(["live-a:A-01"]);
    expect(result.reason).toContain("전체 이용자나 전체 플랫폼의 관계를 대표하지 않습니다");
    expect(result.differentialAttributes.source[0].canonicalLabel).toBe("수집");
    expect(result.differentialAttributes.target[0].canonicalLabel).toBe("공유");
  });

  test("does not connect distant trends without an explainable signal", () => {
    const a = trend({ id: "live-a", name: "Alpha", behaviorLabel: "수집", embedding: [1, 0] });
    const b = trend({ id: "live-b", name: "Beta", behaviorLabel: "공유", embedding: [0, 1] });
    const result = analyzeCulturalRelationship(a, b, { analyzedAt, creativeHypothesis: "근거 없는 아이디어" });

    expect(result.exists).toBe(false);
    expect(result.primaryType).toBeNull();
    expect(result.signals).toEqual([]);
    expect(result.verificationStatus).toBe("Insufficient Evidence");
    expect(result.reason).toContain("기준 0.45 미만");
  });

  test("allows an explicit creative hypothesis only when a measurable anchor exists", () => {
    const a = trend({ id: "live-a", name: "Alpha", behaviorLabel: "수집", embedding: [1, 0] });
    const b = trend({ id: "live-b", name: "Beta", behaviorLabel: "공유", embedding: [0.4, 0.9165] });
    const result = analyzeCulturalRelationship(a, b, { analyzedAt, creativeHypothesis: "서로 다른 행동을 연결하는 탐색 가설" });

    expect(result.scoreBreakdown.semantic).toBeGreaterThanOrEqual(0.35);
    expect(result.scoreBreakdown.semantic).toBeLessThan(0.45);
    expect(result.signals.map((signal) => signal.type)).toEqual(["creative_hypothesis"]);
    expect(result.verificationStatus).toBe("Creative Hypothesis");
  });
});
