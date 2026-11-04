"use client";

import { assetReportText, prepareAssetsForCloud } from "./asset-storage";
import { isStudioProjectPayload, productionFormatLabels, syncProjectSlideImages, type StudioProject } from "./content-production";
import { saveItemEverywhere, type CloudPrep } from "./saved-items-cloud";
import { saveStudioProject } from "./storage";
import type { SavedItem } from "./types";

/** Studio 프로젝트를 Workspace 항목(saved_items, item_type plan)으로 저장한다. 같은 프로젝트는 같은 ID로 갱신된다. */
export function studioSavedItem(project: StudioProject): SavedItem {
  const units = project.settings.format === "cardnews" ? `${project.plan?.slides.length ?? 0}장` : `${project.settings.durationSec}초 · 장면 ${project.plan?.scenes.length ?? 0}개`;
  return {
    id: project.id, type: "plan", mode: "live", title: project.plan?.title ?? project.title,
    subtitle: `${productionFormatLabels[project.settings.format]} · ${units} · ${project.mode === "creative" ? "Creative Collision" : "단일 트렌드"} · ${project.source.trendNames.join(" × ")}`,
    createdAt: project.createdAt, updatedAt: project.updatedAt,
    payload: { kind: "studio-project", project },
  };
}

/** 생성 이미지를 Storage에 올리고, DB 사본에는 경로만 둔다. 이 브라우저 사본은 축소본 + 경로를 함께 가진다. */
const prepare: CloudPrep = async ({ supabase, userId }, item) => {
  if (!isStudioProjectPayload(item.payload)) return { cloud: item };
  const project = item.payload.project;
  const { cloudAssets, localAssets, report } = await prepareAssetsForCloud(supabase, userId, project.id, project.assets);
  const local = syncProjectSlideImages(project, localAssets);
  const cloud = syncProjectSlideImages(project, cloudAssets);
  saveStudioProject(local);
  return { cloud: { ...item, payload: { kind: "studio-project", project: cloud } }, local: { ...item, payload: { kind: "studio-project", project: local } }, note: assetReportText(report) || undefined };
};

/**
 * 저장하고, 방금 저장한 프로젝트(클라우드 이미지 경로 반영)를 함께 돌려준다.
 * 브라우저 저장 공간이 꽉 차 로컬 저장이 실패해도 localStorage의 예전 사본을 다시 읽지 않도록, 호출한 쪽은 이 project를 쓴다.
 */
export async function saveProjectEverywhere(project: StudioProject) {
  let prepared: StudioProject | null = null;
  const result = await saveItemEverywhere(studioSavedItem(project), async (context, item) => {
    const out = await prepare(context, item);
    if (out.local && isStudioProjectPayload(out.local.payload)) prepared = out.local.payload.project;
    return out;
  });
  return { ...result, project: prepared ?? syncProjectSlideImages(project) };
}
