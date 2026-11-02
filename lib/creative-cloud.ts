"use client";

import { assetReportText, prepareAssetsForCloud } from "./asset-storage";
import { creativeSavedItem, isCreativePayload, type CreativeRun } from "./creative-collision";
import { rightsNote, type ImageAssetRef } from "./image-assets";
import { saveItemEverywhere, type CloudPrep } from "./saved-items-cloud";
import { saveCreativeRun } from "./storage";

/** Creative 실행 저장: 콘셉트 이미지를 Storage에 올리고 DB에는 경로만 둔다. 이 브라우저 사본에는 축소본을 유지한다. */
const prepare: CloudPrep = async ({ supabase, userId }, item) => {
  if (!isCreativePayload(item.payload)) return { cloud: item };
  const run = item.payload.run;
  const assets: ImageAssetRef[] = run.visuals.map((visual) => ({ id: visual.ideaId, status: "AI CONCEPT VISUAL", dataUrl: visual.dataUrl, storagePath: visual.storagePath, title: visual.ideaId, createdAt: visual.createdAt, rights: rightsNote["AI CONCEPT VISUAL"] }));
  const { cloudAssets, localAssets, report } = await prepareAssetsForCloud(supabase, userId, `creative_${run.id}`, assets);
  const merge = (list: ImageAssetRef[]) => run.visuals.map((visual, index) => ({ ...visual, dataUrl: list[index].dataUrl, storagePath: list[index].storagePath }));
  const localRun: CreativeRun = { ...run, visuals: merge(localAssets) };
  saveCreativeRun(localRun);
  return {
    cloud: { ...item, payload: { ...item.payload, run: { ...run, visuals: merge(cloudAssets) } } },
    local: { ...item, payload: { ...item.payload, run: localRun } },
    note: assetReportText(report) || undefined,
  };
};

export const saveCreativeEverywhere = (run: CreativeRun) => saveItemEverywhere(creativeSavedItem(run), prepare);
