import { z } from "zod";
import {
  cultureMetadataBasisSchema,
  standardizedCultureMetadataSchema,
  type StandardizedCultureMetadata,
} from "./culture-metadata";
import { analysisStatusSchema, dnaDimensionNames, evidenceItemSchema, type EvidenceItem } from "./schemas";

export const cultureRelationTypeSchema = z.enum([
  "shared_attribute",
  "semantic_similarity",
  "observed_connection",
  "creative_hypothesis",
]);
export type CultureRelationType = z.infer<typeof cultureRelationTypeSchema>;

export const storedCultureRelationSchema = z.object({
  sourceTrendId: z.string().uuid(),
  targetTrendId: z.string().uuid(),
  sourceAnalysisVersionId: z.string().uuid(),
  targetAnalysisVersionId: z.string().uuid(),
  relationType: cultureRelationTypeSchema,
  commonAttributeIds: z.array(z.string()),
  differentialAttributeIds: z.array(z.string()),
  score: z.number().min(0).max(1).nullable(),
  reason: z.string().min(1),
  evidenceIds: z.array(z.string()),
  verificationStatus: analysisStatusSchema,
  analyzedAt: z.string().datetime(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  /** 다른 기기에서 관계를 그대로 복원하기 위한 계산 결과 전체(culture_relations.metadata JSONB). */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type StoredCultureRelation = z.infer<typeof storedCultureRelationSchema>;

const cultureTrendRowSchema = z.object({
  trendKey: z.string().min(1),
  canonicalName: z.string().min(1),
  displayName: z.string().min(1),
  isDemo: z.boolean(),
});

const cultureAnalysisVersionRowSchema = z.object({
  schemaVersion: z.literal("culture-metadata-v1"),
  analyzedAt: z.string().datetime(),
  metadata: standardizedCultureMetadataSchema,
  originalDna: standardizedCultureMetadataSchema.shape.originalDna,
  sourceAnalysisId: z.string().uuid().optional(),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
  embeddingModel: z.string().optional(),
});

const cultureAttributeRowSchema = z.object({
  attributeId: z.string(),
  canonicalLabel: z.string(),
  displayLabel: z.string(),
  dimension: z.enum(dnaDimensionNames),
  description: z.string(),
  evidenceIds: z.array(z.string()),
  verificationStatus: analysisStatusSchema,
  basis: cultureMetadataBasisSchema,
  sourceMetadata: z.record(z.string(), z.unknown()),
});

const cultureEvidenceRowSchema = evidenceItemSchema.extend({ evidenceKey: z.string() }).omit({ id: true });

export const cultureKnowledgeBundleSchema = z.object({
  trend: cultureTrendRowSchema,
  analysisVersion: cultureAnalysisVersionRowSchema,
  attributes: z.array(cultureAttributeRowSchema),
  evidence: z.array(cultureEvidenceRowSchema),
});
export type CultureKnowledgeBundle = z.infer<typeof cultureKnowledgeBundleSchema>;
export type CultureAnalysisProvenance = {
  sourceAnalysisId?: string;
  model?: string;
  promptVersion?: string;
  embeddingModel?: string;
};

const canonicalTrendName = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");

/** Build rows for an atomic persistence layer without mutating the original analysis. */
export function buildCultureKnowledgeBundle(metadata: StandardizedCultureMetadata, evidence: EvidenceItem[], provenance: CultureAnalysisProvenance = {}): CultureKnowledgeBundle {
  const validMetadata = standardizedCultureMetadataSchema.parse(metadata);
  const validEvidence = z.array(evidenceItemSchema).parse(evidence);
  const attributes = validMetadata.dimensions.flatMap((dimension) => dimension.attributes.map((attribute) => ({
    attributeId: attribute.attributeId,
    canonicalLabel: attribute.canonicalLabel,
    displayLabel: attribute.displayLabel,
    dimension: attribute.dimension,
    description: attribute.description,
    evidenceIds: [...attribute.evidenceIds],
    verificationStatus: attribute.verificationStatus,
    basis: attribute.basis,
    sourceMetadata: { ...attribute.source },
  })));
  const rows = {
    trend: {
      trendKey: validMetadata.trendId,
      canonicalName: canonicalTrendName(validMetadata.trendName),
      displayName: validMetadata.trendName,
      isDemo: false,
    },
    analysisVersion: {
      schemaVersion: validMetadata.schemaVersion,
      analyzedAt: validMetadata.sourceAnalyzedAt,
      metadata: validMetadata,
      originalDna: validMetadata.originalDna,
      ...provenance,
    },
    attributes,
    evidence: validEvidence.map(({ id, ...item }) => ({ evidenceKey: id, ...item })),
  };
  return cultureKnowledgeBundleSchema.parse(rows);
}

/** Restore and validate a metadata JSONB value read from culture_analysis_versions. */
export function restoreCultureMetadata(value: unknown) {
  return standardizedCultureMetadataSchema.parse(value);
}

/** Canonical ordering is required by the DB constraint and prevents A-B / B-A duplicates. */
export function canonicalizeCultureRelation(input: StoredCultureRelation): StoredCultureRelation {
  const relation = storedCultureRelationSchema.parse(input);
  if (relation.sourceTrendId === relation.targetTrendId) throw new Error("A cultural relation requires two different trends.");
  if (relation.sourceTrendId < relation.targetTrendId) return relation;
  return {
    ...relation,
    sourceTrendId: relation.targetTrendId,
    targetTrendId: relation.sourceTrendId,
    sourceAnalysisVersionId: relation.targetAnalysisVersionId,
    targetAnalysisVersionId: relation.sourceAnalysisVersionId,
  };
}

export function cultureRelationDeduplicationKey(input: StoredCultureRelation) {
  const relation = canonicalizeCultureRelation(input);
  return [relation.sourceAnalysisVersionId, relation.targetAnalysisVersionId, relation.relationType].join(":");
}
