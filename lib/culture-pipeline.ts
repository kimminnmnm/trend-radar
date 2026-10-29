import { analyzeCulturalRelationship, type CulturalRelationshipResult, type RelationshipTrendInput } from "./cultural-relationship-engine";
import { standardizeCultureMetadata, type StandardizedCultureMetadata } from "./culture-metadata";
import { CULTURE_ALIAS_RULES, CULTURE_ALIAS_RULES_VERSION } from "./culture-alias-rules";
import type { CultureRelationRecord, CultureVersionRecord, LiveAnalysisSnapshot } from "./types";

/*
 * PHASE 5 파이프라인 핵심(저장소·네트워크 없음).
 * DNA → 표준 메타데이터 버전 기록 → 새로 필요한 쌍만 관계 계산 → 원장 갱신.
 * OpenAI·NAVER·Meta를 호출하지 않는다. 임베딩은 DNA 분석 때 받은 값을 재사용한다.
 */

export const MAX_VERSIONS_PER_TREND = 10;

export type CultureLedger = { versions: CultureVersionRecord[]; relations: CultureRelationRecord[] };
export type LedgerSyncResult = { ledger: CultureLedger; newVersions: CultureVersionRecord[]; newRelations: CultureRelationRecord[]; changed: boolean };

export const versionTag = (trendId: string, version: number) => `${trendId}@v${version}`;

/** 두 트렌드 버전 쌍의 키. 순서와 무관하게 같은 키가 나와 A-B/B-A 중복 계산을 막는다. */
export function relationRecordKey(a: { trendId: string; version: number }, b: { trendId: string; version: number }) {
  const [first, second] = a.trendId < b.trendId ? [a, b] : [b, a];
  // 동의어 규칙이 바뀌면 같은 버전 쌍이라도 관계를 다시 계산해야 하므로 규칙 버전을 키에 넣는다.
  return `${CULTURE_ALIAS_RULES_VERSION}:${versionTag(first.trendId, first.version)}|${versionTag(second.trendId, second.version)}`;
}

export function pairKey(a: string, b: string) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

/**
 * 스냅샷의 현재 DNA를 검토된 동의어 규칙으로 표준화한다. 원본 DNA에서 다시 만들므로 규칙이 바뀌어도 손실이 없다.
 * 변환 실패 시 저장된 변환값을 쓰고, 그것도 없으면 null.
 */
export function snapshotMetadata(snapshot: LiveAnalysisSnapshot): StandardizedCultureMetadata | null {
  if (!snapshot.dna || !snapshot.evidence?.length) return null;
  try {
    const timestamp = snapshot.cultureMetadata?.sourceAnalyzedAt ?? snapshot.dnaGeneratedAt ?? snapshot.analyzedAt;
    return standardizeCultureMetadata({ trendId: snapshot.trendId, trendName: snapshot.trendName, sourceAnalyzedAt: timestamp, updatedAt: timestamp, dna: snapshot.dna, evidence: snapshot.evidence, aliasRules: CULTURE_ALIAS_RULES });
  } catch { return snapshot.cultureMetadata ?? null; }
}

export function versionsOf(ledger: CultureLedger, trendId: string) {
  return ledger.versions.filter((item) => item.trendId === trendId).sort((a, b) => b.version - a.version);
}

/** 스냅샷의 현재 DNA에 해당하는 버전. DNA가 없거나(재분석 대기) 아직 기록 전이면 null. */
export function currentVersion(ledger: CultureLedger, snapshot: LiveAnalysisSnapshot) {
  const metadata = snapshotMetadata(snapshot);
  if (!metadata) return null;
  return ledger.versions.find((item) => item.trendId === snapshot.trendId && item.analyzedAt === metadata.sourceAnalyzedAt) ?? null;
}

function relationInput(snapshot: LiveAnalysisSnapshot, metadata: StandardizedCultureMetadata): RelationshipTrendInput {
  return { trendId: snapshot.trendId, trendName: snapshot.trendName, keywords: snapshot.keywords, metadata, evidence: snapshot.evidence ?? [], embedding: snapshot.embedding };
}

/**
 * 원장을 현재 스냅샷과 맞춘다.
 * 1) DNA가 있는 트렌드마다 버전을 기록한다(같은 DNA 시각은 같은 버전, 재분석은 다음 번호).
 * 2) 현재 버전끼리의 쌍 중 원장에 없는 것만 관계를 계산해 저장한다.
 * 이전 버전과 그 관계는 지우지 않는다(트렌드당 최근 MAX_VERSIONS_PER_TREND개 보존).
 */
export function syncCultureLedger(previous: CultureLedger, snapshots: LiveAnalysisSnapshot[], now = new Date().toISOString()): LedgerSyncResult {
  const versions = [...previous.versions];
  const relations = [...previous.relations];
  const newVersions: CultureVersionRecord[] = [];
  const newRelations: CultureRelationRecord[] = [];
  const current: Array<{ snapshot: LiveAnalysisSnapshot; metadata: StandardizedCultureMetadata; version: number }> = [];

  for (const snapshot of snapshots) {
    const metadata = snapshotMetadata(snapshot);
    if (!metadata) continue;
    let record = versions.find((item) => item.trendId === snapshot.trendId && item.analyzedAt === metadata.sourceAnalyzedAt);
    if (!record) {
      const latest = Math.max(0, ...versions.filter((item) => item.trendId === snapshot.trendId).map((item) => item.version));
      record = {
        trendId: snapshot.trendId, trendName: snapshot.trendName, version: latest + 1, analyzedAt: metadata.sourceAnalyzedAt, recordedAt: now,
        whyAnalyzedAt: snapshot.analyzedAt, model: snapshot.dnaModel, promptVersion: snapshot.dnaPromptVersion, hasEmbedding: Boolean(snapshot.embedding?.length), metadata,
      };
      versions.push(record);
      newVersions.push(record);
    }
    current.push({ snapshot, metadata, version: record.version });
  }

  const known = new Set(relations.map((item) => item.key));
  for (let i = 0; i < current.length; i += 1) for (let j = i + 1; j < current.length; j += 1) {
    const a = current[i], b = current[j];
    const key = relationRecordKey({ trendId: a.snapshot.trendId, version: a.version }, { trendId: b.snapshot.trendId, version: b.version });
    if (known.has(key)) continue;
    const [first, second] = a.snapshot.trendId < b.snapshot.trendId ? [a, b] : [b, a];
    let result: CulturalRelationshipResult;
    try {
      result = analyzeCulturalRelationship(relationInput(first.snapshot, first.metadata), relationInput(second.snapshot, second.metadata), { analyzedAt: [first.metadata.sourceAnalyzedAt, second.metadata.sourceAnalyzedAt].sort().at(-1) });
    } catch { continue; }
    const record: CultureRelationRecord = { key, sourceTrendId: first.snapshot.trendId, targetTrendId: second.snapshot.trendId, sourceVersion: first.version, targetVersion: second.version, computedAt: now, result };
    relations.push(record);
    newRelations.push(record);
    known.add(key);
  }

  // 트렌드별 오래된 버전 정리. 남은 버전을 가리키지 않는 관계도 함께 정리한다.
  const kept = new Set<string>();
  for (const trendId of new Set(versions.map((item) => item.trendId))) {
    versions.filter((item) => item.trendId === trendId).sort((a, b) => b.version - a.version).slice(0, MAX_VERSIONS_PER_TREND).forEach((item) => kept.add(versionTag(item.trendId, item.version)));
  }
  const prunedVersions = versions.filter((item) => kept.has(versionTag(item.trendId, item.version)));
  const prunedRelations = relations.filter((item) => kept.has(versionTag(item.sourceTrendId, item.sourceVersion)) && kept.has(versionTag(item.targetTrendId, item.targetVersion)));
  const changed = newVersions.length > 0 || newRelations.length > 0 || prunedVersions.length !== versions.length || prunedRelations.length !== relations.length;
  return { ledger: { versions: prunedVersions, relations: prunedRelations }, newVersions, newRelations, changed };
}

/** 현재 버전끼리의 저장된 관계 결과. 지도는 이것을 재사용하고 없는 쌍만 직접 계산한다. */
export function currentRelationRecords(ledger: CultureLedger, snapshots: LiveAnalysisSnapshot[]) {
  const versionByTrend = new Map<string, number>();
  for (const snapshot of snapshots) { const version = currentVersion(ledger, snapshot); if (version) versionByTrend.set(snapshot.trendId, version.version); }
  const result = new Map<string, CultureRelationRecord>();
  for (const record of ledger.relations) {
    if (versionByTrend.get(record.sourceTrendId) === record.sourceVersion && versionByTrend.get(record.targetTrendId) === record.targetVersion) result.set(pairKey(record.sourceTrendId, record.targetTrendId), record);
  }
  return result;
}
