"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signedInClient } from "./cloud-storage";
import type { FigmaImageSource } from "./figma-export";
import type { ImageAssetRef } from "./image-assets";

/*
 * C5 생성 이미지 저장. 이미지 파일은 Supabase Storage 비공개 버킷(creative-assets, 마이그레이션 0008)에,
 * DB(saved_items.payload)에는 경로·메타데이터만 둔다. 경로 첫 폴더는 user_id(RLS로 본인만 접근).
 * 버킷이 없으면(0008 미적용) 축소 이미지(data URL)를 항목 안에 그대로 저장하고 그 사실을 알린다.
 * REAL REFERENCE(실제 근거 이미지)는 업로드하지 않는다 — 원본 URL만 둔다.
 */
export const ASSET_BUCKET = "creative-assets";
const SIGNED_TTL = 60 * 60;

function dataUrlToBlob(dataUrl: string) {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
  const bytes = Uint8Array.from(atob(body), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}
const missingBucket = (message: string) => /bucket not found|not found.*bucket|does not exist/i.test(message);

export type AssetUploadReport = { uploaded: number; inline: number; skipped: number; error?: string; bucketMissing?: boolean };

/**
 * 계정 저장용 이미지 목록을 만든다. 업로드에 성공한 이미지는 dataUrl을 빼고 storagePath만 남긴다.
 * localAssets: 이 브라우저에 다시 저장할 목록(dataUrl 유지 + storagePath 추가).
 */
export async function prepareAssetsForCloud(supabase: SupabaseClient, userId: string, scope: string, assets: ImageAssetRef[]) {
  const report: AssetUploadReport = { uploaded: 0, inline: 0, skipped: 0 };
  const cloudAssets: ImageAssetRef[] = [], localAssets: ImageAssetRef[] = [];
  for (const asset of assets) {
    if (asset.status === "REAL REFERENCE" || !asset.dataUrl) { cloudAssets.push(asset); localAssets.push(asset); report.skipped += 1; continue; }
    const path = asset.storagePath ?? `${userId}/${scope.replace(/[^A-Za-z0-9_-]/g, "_")}/${asset.id.replace(/[^A-Za-z0-9_-]/g, "_")}.jpg`;
    if (!report.bucketMissing) {
      const { error } = await supabase.storage.from(ASSET_BUCKET).upload(path, dataUrlToBlob(asset.dataUrl), { upsert: true, contentType: "image/jpeg" });
      if (!error) {
        report.uploaded += 1;
        const { dataUrl: _local, ...rest } = asset;
        void _local;
        cloudAssets.push({ ...rest, storagePath: path });
        localAssets.push({ ...asset, storagePath: path });
        continue;
      }
      report.error = error.message;
      if (missingBucket(error.message)) report.bucketMissing = true;
    }
    // 업로드 실패: 축소본을 항목 안에 저장(이미지 참조를 잃지 않게).
    report.inline += 1;
    cloudAssets.push(asset); localAssets.push(asset);
  }
  return { cloudAssets, localAssets, report };
}

export async function removeStoredAssets(supabase: SupabaseClient, paths: string[]) {
  if (!paths.length) return { ok: true, removed: 0 };
  const { data, error } = await supabase.storage.from(ASSET_BUCKET).remove(paths);
  return error ? { ok: false, removed: 0, error: error.message } : { ok: true, removed: (data ?? []).length };
}

export const assetReportText = (report: AssetUploadReport) => report.bucketMissing
  ? `이미지 ${report.inline}개는 계정 저장소(0008) 미적용으로 항목 안에 축소본으로 저장했습니다.`
  : report.inline ? `이미지 ${report.uploaded}개 업로드 · ${report.inline}개 업로드 실패로 항목 안에 저장(${report.error})` : report.uploaded ? `이미지 ${report.uploaded}개를 계정 저장소에 업로드했습니다.` : "";

const signedCache = new Map<string, { url: string; expiresAt: number }>();
/** 이미지 표시 주소: 로컬 축소본 → 실제 원본 URL → 계정 저장소 서명 URL(1시간, 메모리 캐시) 순. */
export function useAssetSrc(asset: Pick<ImageAssetRef, "dataUrl" | "url" | "storagePath"> | null | undefined, client?: SupabaseClient) {
  const direct = asset?.dataUrl ?? asset?.url ?? null;
  const path = !direct ? asset?.storagePath ?? null : null;
  const [signed, setSigned] = useState<{ path: string; url: string | null; error?: string } | null>(null);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    void (async () => {
      const hit = signedCache.get(path);
      if (hit && hit.expiresAt > Date.now()) { if (alive) setSigned({ path, url: hit.url }); return; }
      const supabase = client ?? (await signedInClient())?.supabase;
      if (!supabase) { if (alive) setSigned({ path, url: null, error: "로그인해야 계정에 저장된 이미지를 볼 수 있습니다." }); return; }
      const { data, error } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(path, SIGNED_TTL);
      if (data?.signedUrl) signedCache.set(path, { url: data.signedUrl, expiresAt: Date.now() + (SIGNED_TTL - 60) * 1000 });
      if (alive) setSigned({ path, url: data?.signedUrl ?? null, error: error?.message });
    })();
    return () => { alive = false; };
  }, [path, client]);
  if (direct) return { src: direct, error: undefined };
  return { src: signed?.path === path ? signed.url : null, error: signed?.path === path ? signed.error : undefined };
}

/**
 * Figma 플러그인이 받을 AI 이미지 주소. 계정 저장본은 서명 URL(JSON 내보내기 1시간 · Figma로 보내기는 작업 만료와 같은 24시간), 아니면 이 브라우저의 축소본(data URL).
 * REAL REFERENCE는 넣지 않는다(외부 원본을 Figma 파일에 복제하지 않음).
 */
export async function figmaImageSources(assets: ImageAssetRef[], client?: SupabaseClient, ttlSec = SIGNED_TTL) {
  const out: Record<string, FigmaImageSource> = {};
  let unsigned = 0;
  const generated = assets.filter((asset) => asset.status !== "REAL REFERENCE");
  // 계정에 올라간 이미지는 서명 링크를 우선한다(작업 데이터가 작아진다). 서명에 실패하면 축소본으로 대신한다.
  const supabase = generated.some((asset) => asset.storagePath) ? client ?? (await signedInClient())?.supabase : undefined;
  for (const asset of generated) {
    if (asset.storagePath && supabase) {
      const { data } = await supabase.storage.from(ASSET_BUCKET).createSignedUrl(asset.storagePath, ttlSec);
      if (data?.signedUrl) { out[asset.id] = { url: data.signedUrl, expiresAt: new Date(Date.now() + ttlSec * 1000).toISOString(), kind: "signed" }; continue; }
    }
    if (asset.dataUrl) out[asset.id] = { url: asset.dataUrl, expiresAt: null, kind: "inline" };
    else unsigned += 1;
  }
  return { images: out, unsigned };
}
