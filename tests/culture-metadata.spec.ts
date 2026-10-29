import { expect, test } from "@playwright/test";
import {
  standardizeCultureMetadata,
  standardizedCultureMetadataJsonSchema,
  standardizedCultureMetadataSchema,
  type CanonicalAliasRule,
} from "../lib/culture-metadata";
import { dnaDimensionNames, trendDnaSchema, type EvidenceItem, type TrendDna } from "../lib/schemas";

const collectedAt = "2026-10-29T00:00:00.000Z";
const evidence: EvidenceItem[] = [
  { id: "IG-01", kind: "instagram_media", title: "sample", source: "fixture", collectedAt, excerpt: "sample caption" },
  { id: "NAVER-01", kind: "naver_series", title: "series", source: "fixture", collectedAt, excerpt: "relative search interest" },
];

function dna(trend: string, suffix: string): TrendDna {
  return trendDnaSchema.parse({
    trend,
    dimensions: dnaDimensionNames.map((dimension) => ({
      dimension,
      summary: `${dimension} summary ${suffix}`,
      attributes: [{
        label: dimension === "Behavior" ? `꾸미기 ${suffix}` : `${dimension} ${suffix}`,
        description: `${dimension} description ${suffix}`,
        evidenceIds: dimension === "Aesthetic" ? ["IG-01", "UNKNOWN-01"] : [],
        status: dimension === "Aesthetic" ? "Verified Signal" : "Supported Hypothesis",
        limitations: [`${dimension} limitation ${suffix}`],
      }],
    })),
    dominantPattern: { title: `pattern ${suffix}`, explanation: "pattern description", evidenceIds: ["IG-01"], status: "Supported Hypothesis" },
    missingEvidence: [`missing ${suffix}`],
  });
}

test.describe("Culture metadata v1", () => {
  test("converts three DNA results to one validated six-dimension schema", () => {
    const results = ["alpha", "beta", "gamma"].map((name) => standardizeCultureMetadata({
      trendId: `live-${name}`,
      trendName: name,
      sourceAnalyzedAt: collectedAt,
      updatedAt: collectedAt,
      dna: dna(name, name),
      evidence,
    }));

    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(standardizedCultureMetadataSchema.safeParse(result).success).toBe(true);
      expect(result.dimensions.map((item) => item.dimension)).toEqual(dnaDimensionNames);
      expect(result.dimensions).toHaveLength(6);
      expect(result.schemaVersion).toBe("culture-metadata-v1");
    }
  });

  test("preserves the original DNA and separates unresolved evidence from verified references", () => {
    const original = dna("alpha", "one");
    const result = standardizeCultureMetadata({ trendId: "live-alpha", trendName: "alpha", sourceAnalyzedAt: collectedAt, updatedAt: collectedAt, dna: original, evidence });
    const aesthetic = result.dimensions[0].attributes[0];
    const emotion = result.dimensions[1].attributes[0];

    expect(result.originalDna).toEqual(original);
    expect(aesthetic.evidenceIds).toEqual(["IG-01"]);
    expect(aesthetic.source.originalEvidenceIds).toEqual(["IG-01", "UNKNOWN-01"]);
    expect(aesthetic.source.unresolvedEvidenceIds).toEqual(["UNKNOWN-01"]);
    expect(emotion.basis).toBe("AI Hypothesis");
    expect(emotion.verificationStatus).toBe("Insufficient Evidence");
  });

  test("merges only mechanical variants or explicitly reviewed aliases within one dimension", () => {
    const rules: CanonicalAliasRule[] = [{
      dimension: "Behavior",
      canonicalLabel: "개인화",
      aliases: ["꾸미기", "커스터마이징"],
      reviewedBy: "culture-editor",
      reviewedAt: collectedAt,
    }];
    const first = dna("one", "");
    const second = dna("two", "two");
    first.dimensions.find((item) => item.dimension === "Behavior")!.attributes[0].label = "  꾸미기  ";
    second.dimensions.find((item) => item.dimension === "Behavior")!.attributes[0].label = "커스터마이징";
    const a = standardizeCultureMetadata({ trendId: "live-one", trendName: "one", sourceAnalyzedAt: collectedAt, updatedAt: collectedAt, dna: first, evidence, aliasRules: rules });
    const b = standardizeCultureMetadata({ trendId: "live-two", trendName: "two", sourceAnalyzedAt: collectedAt, updatedAt: collectedAt, dna: second, evidence, aliasRules: rules });
    const aAttr = a.dimensions.find((item) => item.dimension === "Behavior")!.attributes[0];
    const bAttr = b.dimensions.find((item) => item.dimension === "Behavior")!.attributes[0];

    expect(aAttr.canonicalLabel).toBe("개인화");
    expect(aAttr.attributeId).toBe(bAttr.attributeId);
    expect(aAttr.source.normalization).toBe("reviewed_alias");
    expect(standardizedCultureMetadataJsonSchema.properties.dimensions.minItems).toBe(6);
  });
});
