"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "./api-fetch";
import { updateLiveAnalysis } from "./storage";
import { cardImage, mergeInstagramImages, type InstagramImage } from "./visual-media";
import type { LiveAnalysisSnapshot } from "./types";

/*
 * 사진 없는 분석 카드 채우기(Overview·Discover).
 * 대표 이미지가 없고 Instagram 근거가 있는 분석의 해시태그를 공식 API로 한 번에 재조회해 사진 URL만 붙인다.
 * - 이미 조회한 해시태그만(새 해시태그 한도 사용 없음). 계정 아이디·캡션은 받지 않는다.
 * - 같은 탭에서는 트렌드마다 한 번만 시도한다(실패해도 반복 호출하지 않음).
 */
const ATTEMPTED = "trend-radar-ig-autofill-attempted";
const MAX_TAGS = 12;
type TagResult = { hashtag: string; ok: true; collectedAt: string; images: InstagramImage[] } | { hashtag: string; ok: false; message: string };
export type AutofillState = { phase: "idle" | "loading" | "done" | "error"; filled: number; message?: string };

/** 분석 때 조회한 해시태그. 클라우드에서 복원한 분석에는 instagram 필드가 없으므로 근거 원장 제목("Instagram #태그 top_media · …")에서 읽는다. */
export function hashtagOf(snapshot: Pick<LiveAnalysisSnapshot, "instagram" | "evidence">) {
  const stored = snapshot.instagram?.hashtag?.replace(/^#/, "").trim();
  if (stored) return stored;
  const titled = (snapshot.evidence ?? []).filter((item) => item.kind === "instagram_media").map((item) => /^Instagram #(\S+) (?:top_media|recent_media)/.exec(item.title)?.[1]);
  return titled.find(Boolean) ?? null;
}
const hasInstagramEvidence = (snapshot: LiveAnalysisSnapshot) => (snapshot.evidence ?? []).some((item) => item.kind === "instagram_media");

function attempted(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem(ATTEMPTED) ?? "[]") as string[]); } catch { return new Set(); }
}
function markAttempted(ids: string[]) {
  try { sessionStorage.setItem(ATTEMPTED, JSON.stringify([...attempted(), ...ids])); } catch { /* 저장 불가여도 이번 렌더에서는 다시 부르지 않는다 */ }
}

/** 채울 대상: 대표 이미지 없음 + Instagram 근거 있음 + 해시태그 기록 있음 + 이번 탭에서 아직 시도 안 함. */
export function autofillCandidates(snapshots: LiveAnalysisSnapshot[], skip = new Set<string>()) {
  return snapshots.filter((item) => !cardImage(item) && hasInstagramEvidence(item) && hashtagOf(item) && !skip.has(item.trendId));
}

export function useInstagramAutofill(snapshots: LiveAnalysisSnapshot[] | null) {
  const [state, setState] = useState<AutofillState>({ phase: "idle", filled: 0 });
  const key = (snapshots ?? []).map((item) => `${item.trendId}:${cardImage(item) ? 1 : 0}`).join("|");
  useEffect(() => {
    if (!snapshots) return;
    const targets = autofillCandidates(snapshots, attempted());
    if (!targets.length) return;
    const tags = [...new Set(targets.map((item) => hashtagOf(item)!))].slice(0, MAX_TAGS);
    const batch = targets.filter((item) => tags.includes(hashtagOf(item)!));
    markAttempted(batch.map((item) => item.trendId));
    // 렌더 중 setState를 피하려고 다음 틱에 시작한다. 사진을 붙이면 key가 바뀌어 effect가 다시 돌지만, 진행 중인 요청은 끝까지 반영한다.
    queueMicrotask(() => setState({ phase: "loading", filled: 0 }));
    void (async () => {
      try {
        const response = await apiFetch("/api/media/instagram-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ hashtags: tags }) });
        const body = await response.json();
        const results = (body.results ?? []) as TagResult[];
        if (!response.ok && !results.length) throw new Error(body.message || "Instagram 사진을 받지 못했습니다.");
        let filled = 0;
        for (const snapshot of batch) {
          const result = results.find((item) => item.hashtag.toLocaleLowerCase() === hashtagOf(snapshot)!.toLocaleLowerCase());
          if (!result?.ok || !result.images.length) continue;
          updateLiveAnalysis(snapshot.trendId, { media: mergeInstagramImages(snapshot, result.images, hashtagOf(snapshot)!, result.collectedAt) });
          filled += 1;
        }
        const failed = results.filter((item) => !item.ok).length;
        setState({ phase: "done", filled, message: `Instagram 사진으로 카드 ${filled}개를 채웠습니다${failed ? ` · ${failed}개 해시태그는 재조회 불가(최근 7일 내 조회 기록 없음 등)` : ""}. 계정 아이디·캡션은 표시하지 않습니다.` });
      } catch (error) {
        setState({ phase: "error", filled: 0, message: error instanceof Error ? error.message : "Instagram 사진을 받지 못했습니다." });
      }
    })();
    // key가 바뀔 때(분석 추가·사진 유무 변화)만 다시 검사한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}
