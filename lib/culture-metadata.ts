import { z } from "zod";
import {
  analysisStatusSchema,
  dnaDimensionNames,
  evidenceItemSchema,
  trendDnaSchema,
  type AnalysisStatus,
  type DnaDimensionName,
  type EvidenceItem,
  type TrendDna,
} from "./schemas";

export const cultureMetadataBasisSchema = z.enum(["Observed Evidence", "Evidence-backed Interpretation", "AI Hypothesis"]);

export const cultureAttributeSourceSchema = z.object({
  originalLabel: z.string(),
  originalStatus: analysisStatusSchema,
  originalEvidenceIds: z.array(z.string()),
  unresolvedEvidenceIds: z.array(z.string()),
  limitations: z.array(z.string()),
  normalization: z.enum(["surface", "reviewed_alias"]),
});

export const standardizedCultureAttributeSchema = z.object({
  attributeId: z.string().regex(/^attr-[a-z]+-[0-9a-f]{8}$/),
  canonicalLabel: z.string().min(1),
  displayLabel: z.string().min(1),
  dimension: z.enum(dnaDimensionNames),
  description: z.string(),
  evidenceIds: z.array(z.string()),
  verificationStatus: analysisStatusSchema,
  updatedAt: z.string().datetime(),
  basis: cultureMetadataBasisSchema,
  source: cultureAttributeSourceSchema,
});

const standardizedDimensionSchema = z.object({
  dimension: z.enum(dnaDimensionNames),
  summary: z.string(),
  attributes: z.array(standardizedCultureAttributeSchema),
});

export const standardizedCultureMetadataSchema = z.object({
  schemaVersion: z.literal("culture-metadata-v1"),
  trendId: z.string().min(1),
  trendName: z.string().min(1),
  sourceAnalyzedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  dimensions: z.array(standardizedDimensionSchema).length(6).superRefine((dimensions, ctx) => {
    const actual = new Set(dimensions.map((item) => item.dimension));
    for (const dimension of dnaDimensionNames) {
      if (!actual.has(dimension)) ctx.addIssue({ code: "custom", message: `Missing dimension: ${dimension}` });
    }
  }),
  dominantPattern: trendDnaSchema.shape.dominantPattern,
  missingEvidence: z.array(z.string()),
  originalDna: trendDnaSchema,
});

export type StandardizedCultureAttribute = z.infer<typeof standardizedCultureAttributeSchema>;
export type StandardizedCultureMetadata = z.infer<typeof standardizedCultureMetadataSchema>;

export const canonicalAliasRuleSchema = z.object({
  dimension: z.enum(dnaDimensionNames),
  canonicalLabel: z.string().min(1),
  aliases: z.array(z.string().min(1)).min(1),
  reviewedBy: z.string().min(1),
  reviewedAt: z.string().datetime(),
});
export type CanonicalAliasRule = z.infer<typeof canonicalAliasRuleSchema>;

/**
 * Portable JSON Schema for storage contracts and non-TypeScript consumers.
 * Runtime validation remains authoritative in standardizedCultureMetadataSchema.
 */
export const standardizedCultureMetadataJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "TREND RADAR Standardized Culture Metadata v1",
  type: "object",
  required: ["schemaVersion", "trendId", "trendName", "sourceAnalyzedAt", "updatedAt", "dimensions", "dominantPattern", "missingEvidence", "originalDna"],
  properties: {
    schemaVersion: { const: "culture-metadata-v1" },
    trendId: { type: "string", minLength: 1 },
    trendName: { type: "string", minLength: 1 },
    sourceAnalyzedAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    dimensions: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        required: ["dimension", "summary", "attributes"],
        properties: {
          dimension: { enum: dnaDimensionNames },
          summary: { type: "string" },
          attributes: {
            type: "array",
            items: {
              type: "object",
              required: ["attributeId", "canonicalLabel", "displayLabel", "dimension", "description", "evidenceIds", "verificationStatus", "updatedAt"],
              properties: {
                attributeId: { type: "string", pattern: "^attr-[a-z]+-[0-9a-f]{8}$" },
                canonicalLabel: { type: "string", minLength: 1 },
                displayLabel: { type: "string", minLength: 1 },
                dimension: { enum: dnaDimensionNames },
                description: { type: "string" },
                evidenceIds: { type: "array", items: { type: "string" } },
                verificationStatus: { enum: analysisStatusSchema.options },
                updatedAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
      },
    },
    dominantPattern: { type: "object" },
    missingEvidence: { type: "array", items: { type: "string" } },
    originalDna: { type: "object" },
  },
  additionalProperties: false,
} as const;

const cleanDisplayLabel = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ");

/** Surface normalization only; semantic synonym merging requires a reviewed alias rule. */
export function cultureAttributeKey(value: string) {
  return cleanDisplayLabel(value).toLocaleLowerCase("ko-KR").replace(/[\s#·_\-–—/\\()[\]{}'".,!?]/g, "");
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalFor(dimension: DnaDimensionName, label: string, rules: CanonicalAliasRule[]) {
  const key = cultureAttributeKey(label);
  const match = rules.find((rule) => rule.dimension === dimension && rule.aliases.some((alias) => cultureAttributeKey(alias) === key));
  return match
    ? { label: cleanDisplayLabel(match.canonicalLabel), normalization: "reviewed_alias" as const }
    : { label: cleanDisplayLabel(label), normalization: "surface" as const };
}

function verificationStatus(original: AnalysisStatus, evidenceIds: string[]): AnalysisStatus {
  if (evidenceIds.length === 0) return original === "Creative Hypothesis" ? original : "Insufficient Evidence";
  return original;
}

function basisFor(status: AnalysisStatus, evidenceIds: string[]) {
  if (status === "Creative Hypothesis" || evidenceIds.length === 0) return "AI Hypothesis" as const;
  return status === "Verified Signal" ? "Observed Evidence" as const : "Evidence-backed Interpretation" as const;
}

export function standardizeCultureMetadata(params: {
  trendId: string;
  trendName: string;
  sourceAnalyzedAt: string;
  updatedAt?: string;
  dna: TrendDna;
  evidence: EvidenceItem[];
  aliasRules?: CanonicalAliasRule[];
}): StandardizedCultureMetadata {
  const dna = trendDnaSchema.parse(params.dna);
  const evidence = z.array(evidenceItemSchema).parse(params.evidence);
  const rules = z.array(canonicalAliasRuleSchema).parse(params.aliasRules ?? []);
  const updatedAt = params.updatedAt ?? new Date().toISOString();
  const validEvidence = new Set(evidence.map((item) => item.id));

  const dimensions = dnaDimensionNames.map((dimension) => {
    const sourceDimension = dna.dimensions.find((item) => item.dimension === dimension);
    const summary = sourceDimension?.summary ?? "";
    const attributes = (sourceDimension?.attributes ?? []).map((attribute) => {
      const canonical = canonicalFor(dimension, attribute.label, rules);
      const evidenceIds = [...new Set(attribute.evidenceIds.filter((id) => validEvidence.has(id)))];
      const unresolvedEvidenceIds = [...new Set(attribute.evidenceIds.filter((id) => !validEvidence.has(id)))];
      const status = verificationStatus(attribute.status, evidenceIds);
      return {
        attributeId: `attr-${dimension.toLowerCase()}-${fnv1a(`${dimension}:${cultureAttributeKey(canonical.label)}`)}`,
        canonicalLabel: canonical.label,
        displayLabel: cleanDisplayLabel(attribute.label),
        dimension,
        description: attribute.description,
        evidenceIds,
        verificationStatus: status,
        updatedAt,
        basis: basisFor(status, evidenceIds),
        source: {
          originalLabel: attribute.label,
          originalStatus: attribute.status,
          originalEvidenceIds: [...attribute.evidenceIds],
          unresolvedEvidenceIds,
          limitations: [...attribute.limitations],
          normalization: canonical.normalization,
        },
      };
    });
    return { dimension, summary, attributes };
  });

  return standardizedCultureMetadataSchema.parse({
    schemaVersion: "culture-metadata-v1",
    trendId: params.trendId,
    trendName: params.trendName,
    sourceAnalyzedAt: params.sourceAnalyzedAt,
    updatedAt,
    dimensions,
    dominantPattern: dna.dominantPattern,
    missingEvidence: dna.missingEvidence,
    originalDna: dna,
  });
}
