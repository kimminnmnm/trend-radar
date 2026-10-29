"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { persistCultureKnowledge, persistCultureRelation } from "./culture-cloud-storage";
import { calibrateSemanticThreshold, displayableSignals } from "./culture-calibration";
import { currentRelationRecords, currentVersion, syncCultureLedger, type CultureLedger, type LedgerSyncResult } from "./culture-pipeline";
import { getCultureRelations, getCultureVersions, getLiveAnalyses, saveCultureLedger } from "./storage";
import type { LiveAnalysisSnapshot } from "./types";

/** DNA 분석 때 쓰는 임베딩 모델(lib/openai-client.ts EMBEDDING_MODEL). 서버 모듈을 브라우저에 번들하지 않으려고 값만 둔다. */
const EMBEDDING_MODEL = "text-embedding-3-small";

export type CloudSyncStatus = { status: "saved" | "skipped" | "unavailable"; message: string; versions: number; relations: number };
export type CulturePipelineReport = { newVersions: number; computed: number; connected: number; cloud: CloudSyncStatus };

export function readCultureLedger(): CultureLedger {
  return { versions: getCultureVersions(), relations: getCultureRelations() };
}

/** 브라우저 원장만 갱신한다(네트워크 없음). 바뀐 것이 없으면 저장하지 않아 렌더링 반복을 막는다. */
export function syncCultureLedgerLocal(snapshots: LiveAnalysisSnapshot[] = getLiveAnalyses()): LedgerSyncResult {
  const result = syncCultureLedger(readCultureLedger(), snapshots);
  if (result.changed) saveCultureLedger(result.ledger.versions, result.ledger.relations);
  return result;
}

const notSignedIn = (message: string) => /로그인|설정되지/.test(message);

/**
 * 현재 버전 메타데이터와 관계를 Supabase에 저장한다. 이미 저장한 항목은 건너뛴다.
 * save_culture_knowledge RPC는 같은 분석 시각에 대해 멱등이고, 관계는 (버전, 버전, 유형) 유일 제약으로 upsert한다.
 */
export async function syncCultureCloud(ledger: CultureLedger, snapshots: LiveAnalysisSnapshot[], client?: SupabaseClient): Promise<{ ledger: CultureLedger; status: CloudSyncStatus }> {
  const versions = [...ledger.versions];
  const relations = [...ledger.relations];
  let savedVersions = 0, savedRelations = 0;
  const done = (status: CloudSyncStatus["status"], message: string) => ({ ledger: { versions, relations }, status: { status, message, versions: savedVersions, relations: savedRelations } });

  for (const snapshot of snapshots) {
    const version = currentVersion({ versions, relations }, snapshot);
    if (!version || version.cloud) continue;
    const result = await persistCultureKnowledge(version.metadata, snapshot.evidence ?? [], client, { model: version.model, promptVersion: version.promptVersion, embeddingModel: version.hasEmbedding ? EMBEDDING_MODEL : undefined });
    if (result.target !== "cloud" || !result.trendId || !result.analysisVersionId || !result.versionNumber) {
      return done(notSignedIn(result.message) ? "skipped" : "unavailable", notSignedIn(result.message) ? `브라우저에만 저장했습니다. ${result.message}` : `클라우드 저장 실패: ${result.message}`);
    }
    versions[versions.indexOf(version)] = { ...version, cloud: { trendUuid: result.trendId, versionUuid: result.analysisVersionId, versionNumber: result.versionNumber } };
    savedVersions += 1;
  }

  const byTag = new Map(versions.map((item) => [`${item.trendId}@v${item.version}`, item]));
  // 지도와 같은 기준으로, 보정 기준 미만의 의미 유사 신호는 클라우드에도 관계로 저장하지 않는다.
  const semantic = calibrateSemanticThreshold(snapshots.filter((item) => currentVersion({ versions, relations }, item)).map((item) => item.embedding));
  for (const record of currentRelationRecords({ versions, relations }, snapshots).values()) {
    if (!record.result.exists || record.cloudSavedAt) continue;
    const source = byTag.get(`${record.sourceTrendId}@v${record.sourceVersion}`)?.cloud, target = byTag.get(`${record.targetTrendId}@v${record.targetVersion}`)?.cloud;
    if (!source || !target) continue;
    const common = record.result.sharedAttributes.map((item) => item.attributeId);
    const differential = [...record.result.differentialAttributes.source, ...record.result.differentialAttributes.target].map((item) => item.attributeId);
    const signals = displayableSignals(record.result, semantic.threshold);
    if (!signals.length) continue;
    for (const signal of signals) {
      const saved = await persistCultureRelation({
        sourceTrendId: source.trendUuid, targetTrendId: target.trendUuid, sourceAnalysisVersionId: source.versionUuid, targetAnalysisVersionId: target.versionUuid,
        relationType: signal.type, commonAttributeIds: common, differentialAttributeIds: differential, score: signal.score, reason: signal.reason,
        evidenceIds: signal.evidenceIds, verificationStatus: signal.verificationStatus, analyzedAt: record.result.analyzedAt,
      }, client);
      if (saved.target !== "cloud") return done("unavailable", `클라우드 관계 저장 실패: ${saved.message}`);
    }
    relations[relations.indexOf(record)] = { ...record, cloudSavedAt: new Date().toISOString() };
    savedRelations += 1;
  }
  return done(savedVersions || savedRelations ? "saved" : "skipped", savedVersions || savedRelations ? `Supabase에 메타데이터 버전 ${savedVersions}개 · 관계 ${savedRelations}쌍을 저장했습니다.` : "Supabase에 새로 저장할 항목이 없습니다.");
}

/**
 * 분석 완료 후 실행: 버전 기록 → 새 관계 계산 → 브라우저 원장 저장 → (로그인 시) Supabase 저장.
 * 외부 유료 API는 호출하지 않는다.
 */
export async function runCulturePipeline(options: { cloud?: boolean; client?: SupabaseClient } = {}): Promise<CulturePipelineReport> {
  const snapshots = getLiveAnalyses();
  const local = syncCultureLedgerLocal(snapshots);
  let cloud: CloudSyncStatus = { status: "skipped", message: "클라우드 동기화를 실행하지 않았습니다.", versions: 0, relations: 0 };
  if (options.cloud !== false) {
    try {
      const synced = await syncCultureCloud(local.ledger, snapshots, options.client);
      cloud = synced.status;
      if (synced.status.versions || synced.status.relations) saveCultureLedger(synced.ledger.versions, synced.ledger.relations);
    } catch (reason) {
      cloud = { status: "unavailable", message: `클라우드 저장 실패: ${reason instanceof Error ? reason.message : "알 수 없는 오류"}`, versions: 0, relations: 0 };
    }
  }
  return { newVersions: local.newVersions.length, computed: local.newRelations.length, connected: local.newRelations.filter((item) => item.result.exists).length, cloud };
}

export function describePipeline(report: CulturePipelineReport) {
  return `Culture Map 반영: 새 버전 ${report.newVersions}개 · 관계 계산 ${report.computed}쌍(연결 ${report.connected}) · ${report.cloud.message}`;
}
