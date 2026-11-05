"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronUp, Clipboard, Compass, CopyPlus, Download, ExternalLink, Figma, ImagePlus, Link2, LoaderCircle, NotebookPen, Save, Send, Sparkles, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { syncAccount } from "@/lib/account-sync";
import { signedInClient, type PersistenceResult } from "@/lib/cloud-storage";
import { HANDOFF_TTL_HOURS, type HandoffCreated } from "@/lib/figma-handoff";
import {
  beginSlideImageRequest, conceptAssets, conceptFromIdea, defaultSettings, deleteProductionSlide, duplicateProductionSlide, emptySlideImage, failSlideImageRequest, imageSourceForAsset, isStudioProjectPayload, normalizedSlideImage, productionFormatLabels, projectIdFor, reorderProductionSlide, resolveSlideImageRequest, settingsMode, slideImageAssetId, syncProjectSlideImages, withSlideImage,
  type CreativeConcept, type ProductionPlan, type UserRating, userRatingItems, type ProductionScene, type ProductionSettings, type ProductionSlide, type ProductionValidation, type SlideImage, type SlideImageRef, type StudioProject,
} from "@/lib/content-production";
import { evidenceModeLabels, ideaTypeLabels, isCreativePayload, type CreativeRun } from "@/lib/creative-collision";
import { angleTypeLabels, contentModeInfo, contentModes, customAngle, editorialTypeLabels, evidenceFitLabels, readerValueLabels, type AngleValidation, type ContentAngle, type ContentMode } from "@/lib/editorial";
import type { EditorialReview, QualityReport } from "@/lib/editorial-quality";
import { figmaImageSources } from "@/lib/asset-storage";
import { toFigmaExport } from "@/lib/figma-export";
import { rightsNote, type ImageAspect, type ImageAssetRef } from "@/lib/image-assets";
import { readQueryParam } from "@/lib/insight-sources";
import { phenomenonFromQuery, phenomenonQuery, phenomenonTrendId } from "@/lib/discovery";
import { buildContextLock, type EditorialContextLock } from "@/lib/editorial-lock";
import { slideImageBrief, type ImageBrief } from "@/lib/image-brief";
import { ContextLockPanel } from "./context-lock-panel";
import { liveTrendId, toTrendContext, trendPath } from "@/lib/live-trend";
import { saveProjectEverywhere } from "@/lib/studio-cloud";
import { findPhenomenon, getCreativeRuns, getDiscoveryReports, getSavedItems, getStudioProject, saveStudioProject } from "@/lib/storage";
import { getCollisions, saveCreativeRun } from "@/lib/storage";
import { readCultureLedger } from "@/lib/culture-pipeline-client";
import { buildCreativeInputs, requestCreativeRun } from "@/lib/creative-request";
import { snapshotMedia } from "@/lib/visual-media";
import { useStored } from "@/lib/use-stored";
import type { EvidenceItem } from "@/lib/schemas";
import type { LiveAnalysisSnapshot } from "@/lib/types";
import { CloudSaveStatus } from "./cloud-save-status";
import { CardPreview } from "./card-preview";
import { TemplateGallery, TemplateSlidePreviews, useTemplateLibrary } from "./template-gallery";
import { buildCardDesign, designStyleIds, densities, densityLabels, imageEmphases, imageEmphasisLabels, paletteModeLabels, paletteModes, STYLES, typeMoodLabels, typeMoods, type DesignControls } from "@/lib/card-design";
import { AssetImage, ImageGenerator } from "./image-generator";
import { DataBadge, formatDateTime } from "./ui";

type AnglesResponse = { cached: boolean; generatedAt: string; mode: ContentMode; angles: ContentAngle[]; validation: AngleValidation; model: string };
type Response = { cached: boolean; generatedAt: string; promptVersion: string; model: string; plan: ProductionPlan; validation: ProductionValidation; quality?: QualityReport | null; review?: EditorialReview | null; research?: { requested: boolean; status: string; count: number; message?: string }; references: EvidenceItem[] };
const TONE_PRESETS = ["친구에게 말하듯 가볍게, 구체적으로, 과장 없이", "정보 위주로 담백하게", "팬의 마음으로 유쾌하게", "에세이처럼 차분하게", "입문자에게 친절하게"];

/** 트렌드 근거에서 실제 이미지(REAL REFERENCE) 몇 장을 참조로 가져온다(원본 URL만, 복제 없음). */
/** 잠금의 관측 근거는 프로젝트가 근거로 쓰는 WHY 스냅샷(T1)의 원장 ID여야 한다. */
const lockSource = (snapshot: LiveAnalysisSnapshot | undefined) => snapshot ? { report: snapshot.whyReport, evidence: snapshot.evidence } : null;

function realReferences(snapshot: LiveAnalysisSnapshot | undefined, limit = 3): ImageAssetRef[] {
  if (!snapshot) return [];
  return snapshotMedia(snapshot).filter((item) => item.thumbnailUrl).slice(0, limit).map((item) => ({
    id: `real-${item.mediaId}`.slice(0, 160), status: "REAL REFERENCE", url: item.thumbnailUrl!, sourceUrl: item.sourceUrl, title: `${snapshot.trendName} · ${item.title}`.slice(0, 200), createdAt: item.collectedAt || new Date().toISOString(), rights: rightsNote["REAL REFERENCE"],
  }));
}
const findRun = (id: string): CreativeRun | undefined => [...getCreativeRuns(), ...getSavedItems().flatMap((item) => isCreativePayload(item.payload) ? [item.payload.run] : [])].find((run) => run.id === id);
/** V3(E1): 이 키워드로 WHAT'S HAPPENING NOW?를 실행한 가장 최근 기록의 세부 현상 후보(방향 제안 입력용, 근거 ID 없음). */
const observedPhenomenaFor = (keyword: string) => {
  const key = keyword.trim().toLocaleLowerCase("ko-KR");
  const report = key ? getDiscoveryReports().find((item) => item.keyword.trim().toLocaleLowerCase("ko-KR") === key) : undefined;
  return (report?.signals ?? []).slice(0, 8).map((signal) => ({ title: signal.title.slice(0, 120), behavior: (signal.audienceBehavior || signal.phenomenon || "").slice(0, 300), status: signal.verificationStatus, independentSources: Math.min(50, signal.independentSources) }));
};
const findProject = (id: string): StudioProject | null => getStudioProject(id) ?? getSavedItems().flatMap((item) => isStudioProjectPayload(item.payload) && item.payload.project.id === id ? [syncProjectSlideImages(item.payload.project)] : [])[0] ?? null;


/**
 * V4 P1-4: 근거가 부족한 방향을 고르면 생성 전에 대안을 보여 준다(V3 실측: 치이카와 "일하고 보상받는 장면"이 근거 없이 4장 + 자료 한계 문구로 실패).
 * 고르는 것은 사용자다 — 자동으로 바꾸지 않는다. 추가 조사는 체크만 켜고, 실제 호출은 생성 버튼을 눌러야 일어난다.
 */
function ThinEvidenceOptions({ fit, research, onResearch, slides, onFewerSlides, alternatives, onChoose, hasLock }: { hasLock: boolean; fit: "partial" | "needs_research"; research: boolean; onResearch: () => void; slides: number | null; onFewerSlides: () => void; alternatives: ContentAngle[]; onChoose: (angle: ContentAngle) => void }) {
  return <div className="thin-evidence" role="note" data-testid="thin-evidence">
    <b>{fit === "needs_research" ? "이 방향은 분석 자료에 근거가 거의 없어요." : "이 방향은 근거가 일부만 있어요."}</b>
    <p>그대로 만들면 장수가 줄거나 일반적인 문장이 늘 수 있어요. 아래 중 하나를 골라 보세요.</p>
    <ol>
      <li data-testid="thin-research">A. 디테일 추가 조사 — 웹 검색 1회 추가{research ? <span className="ok"> · 켜져 있음</span> : <button type="button" className="mini" onClick={onResearch}>조사 켜기</button>}</li>
      <li>B. 주제 좁히기 — 위 “관점”을 자료에 실제로 있는 장면·사례 하나로 고쳐 쓰기</li>
      <li data-testid="thin-slides">C. 장수 줄이기{slides !== null && slides > 4 ? <button type="button" className="mini" onClick={onFewerSlides}>4장으로 줄이기</button> : <span className="ok"> · 현재 {slides ?? "—"}장</span>}</li>
      <li data-testid="thin-alternatives">D. 근거가 충분한 다른 방향{alternatives.length ? <span className="alts">{alternatives.slice(0, 3).map((angle) => <button type="button" className="mini" key={angle.angle_id} onClick={() => onChoose(angle)}>{angle.title}</button>)}</span> : <span className="ev"> — 지금 제안 중에는 없어요. 방향을 다시 제안받아 보세요.</span>}</li>
      <li data-testid="thin-materials">E. 내가 아는 자료 넣기 — {hasLock ? "위 편집 맥락 잠금의 USER MATERIALS에" : "위 “관점”에"} 직접 확인한 사실·장면을 적으면 생성에 반영돼요(검증 전 자료로 다룹니다)</li>
    </ol>
    <style jsx>{`
      .thin-evidence{display:grid;gap:4px;padding:8px 10px;border:1.5px dashed #c77700;border-radius:6px;background:#fff8e8;font-size:12px;color:#4a3300}
      .thin-evidence p{margin:0}.thin-evidence ol{margin:2px 0 0;padding-left:0;list-style:none;display:grid;gap:4px}
      .thin-evidence li{line-height:1.5}.thin-evidence .ok{color:#237a27}.thin-evidence .ev{color:var(--muted)}
      .thin-evidence .alts{display:flex;flex-wrap:wrap;gap:4px;margin-top:3px}
      .mini{display:inline-flex;gap:3px;align-items:center;font-size:10px;padding:2px 6px;margin-left:6px;border:1px solid var(--ink);border-radius:3px;background:#fff;cursor:pointer}
      .alts .mini{margin-left:0;text-align:left}
    `}</style>
  </div>;
}

export function StudioProduction({ snapshots }: { snapshots: LiveAnalysisSnapshot[] }) {
  const [project, setProject] = useState<StudioProject | null>(null);
  const [boot, setBoot] = useState<"loading" | "ready" | "missing">("loading");
  const [bootError, setBootError] = useState("");
  const [pickTrend, setPickTrend] = useState("");
  const [startMode, setStartMode] = useState<"single" | "creative">("single");
  const [trendSearch, setTrendSearch] = useState("");
  const [pickA, setPickA] = useState("");
  const [pickB, setPickB] = useState("");
  const [inlineRun, setInlineRun] = useState<CreativeRun | null>(null);
  const [inlineIdeaId, setInlineIdeaId] = useState("");
  const [collisionState, setCollisionState] = useState<"idle" | "loading" | "error">("idle");
  const [collisionError, setCollisionError] = useState("");
  const [manual, setManual] = useState({ a: "", b: "", topic: "" });
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [references, setReferences] = useState<EvidenceItem[]>([]);
  const [save, setSave] = useState<PersistenceResult | null>(null);
  const [toast, setToast] = useState("");
  const [extraOpen, setExtraOpen] = useState<Set<string>>(new Set());
  const [handoff, setHandoff] = useState<{ state: "sending" | "sent" | "error"; result?: HandoffCreated; message?: string; needLogin?: boolean } | null>(null);
  // P12: MY TEMPLATES 갤러리(로그인 계정의 동기화된 Figma 템플릿). MY TEMPLATES를 고른 카드뉴스에서만 불러온다.
  const templateLibrary = useTemplateLibrary(project?.id ?? "", Boolean(project && project.designSource === "templates" && project.settings.format === "cardnews"));
  const [imageSlots, setImageSlots] = useState<Set<string>>(() => new Set());
  const [linkSlot, setLinkSlot] = useState<string | null>(null);
  const [angleState, setAngleState] = useState<"idle" | "loading" | "error">("idle");
  const [angleError, setAngleError] = useState("");
  // V2 실측: 방향 맞춤 자료가 없으면 일반 팁으로 채워지기 쉬워 기본으로 켠다(웹 검색 1회 추가, 끌 수 있음).
  const [deepResearch, setDeepResearch] = useState(true);
  const projectRef = useRef<StudioProject | null>(null);
  const sceneRequests = useRef(new Map<string, string>());
  // 추가 이미지로 쌓는 생성 요청(슬라이드|요청 ID). 대표 이미지 요청과 따로 둔다 — 대표 이미지를 바꾸지 않는다.
  const extraRequests = useRef(new Set<string>());
  const [stackSlots, setStackSlots] = useState<Set<string>>(() => new Set());
  const requestSequence = useRef(0);
  const bySnapshot = useMemo(() => new Map(snapshots.map((item) => [item.trendId, item])), [snapshots]);
  const storedRuns = useStored(getCreativeRuns);
  const savedItems = useStored(getSavedItems);
  const collisions = useStored(getCollisions);
  const cultureLedger = useStored(readCultureLedger);
  const creativeRuns = useMemo(() => {
    const byId = new Map<string, CreativeRun>();
    for (const run of [...(storedRuns ?? []), ...(savedItems ?? []).flatMap((item) => isCreativePayload(item.payload) ? [item.payload.run] : [])]) {
      const previous = byId.get(run.id);
      if (!previous || Date.parse(run.updatedAt) > Date.parse(previous.updatedAt)) byId.set(run.id, run);
    }
    return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }, [savedItems, storedRuns]);

  /** 모든 수정은 즉시 이 브라우저에 저장한다(새로고침 복원). 계정 저장은 저장 버튼으로. */
  const update = (next: StudioProject) => { const stamped = { ...next, updatedAt: new Date().toISOString() }; projectRef.current = stamped; setProject(stamped); saveStudioProject(stamped); };
  const mutateProject = (change: (current: StudioProject) => StudioProject | null) => {
    const current = projectRef.current;
    if (!current) return false;
    const next = change(current);
    if (!next) return false;
    update(next);
    return true;
  };
  useEffect(() => { projectRef.current = project; }, [project]);
  const openUrl = (id: string) => { try { const url = new URL(window.location.href); url.search = `?project=${encodeURIComponent(id)}`; window.history.replaceState(null, "", url); } catch { /* 주소 갱신 실패는 무시 */ } };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const projectId = readQueryParam("project"), creative = readQueryParam("creative"), ideaId = readQueryParam("idea"), trend = readQueryParam("trend"), phenomenon = readQueryParam("phenomenon");
      const start = (attempt: () => StudioProject | null | "missing", missingText: string) => {
        const first = attempt();
        if (first && first !== "missing") { setProject(first); setBoot("ready"); openUrl(first.id); return; }
        // 이 브라우저에 없으면 계정에서 받은 뒤 다시 찾는다(다른 브라우저에서 만든 작업).
        void syncAccount().then(() => { const again = attempt(); if (again && again !== "missing") { setProject(again); setBoot("ready"); openUrl(again.id); } else { setBootError(missingText); setBoot("missing"); } });
      };
      if (projectId) return start(() => findProject(projectId), "이 프로젝트를 이 브라우저와 계정에서 찾지 못했습니다. 삭제됐거나 다른 계정의 프로젝트일 수 있습니다.");
      if (creative) return start(() => {
        const run = findRun(creative);
        const idea = run?.result.ideas.find((item) => item.id === (ideaId ?? run.selectedIdeaId));
        if (!run || !idea) return null;
        const id = projectIdFor("creative", `${run.id}-${idea.id}`);
        const existing = findProject(id);
        if (existing) return existing;
        const now = new Date().toISOString();
        const created: StudioProject = {
          id, mode: "creative", title: idea.title, source: { trendKeys: [...run.trendKeys], trendNames: [...run.trendNames], creativeRunId: run.id, ideaId: idea.id },
          concept: conceptFromIdea(run, idea), settings: { ...defaultSettings(idea.idea_type === "short_form" ? "shortform" : "cardnews", "concept"), target: idea.audience_appeal.slice(0, 200), cta: idea.CTA.slice(0, 200) },
          assets: [...conceptAssets(run).filter((asset) => asset.id.endsWith(idea.id)), ...run.trendKeys.flatMap((key) => realReferences(bySnapshot.get(key), 2))],
          edited: false, createdAt: now, updatedAt: now,
        };
        saveStudioProject(created);
        return created;
      }, "선택한 Creative Collision 아이디어를 찾지 못했습니다. 삭제됐거나 이 계정에 저장되지 않은 아이디어입니다.");
      if (trend) return start(() => {
        const snapshot = bySnapshot.get(trend);
        if (!snapshot) return null;
        const id = projectIdFor("single", trend);
        const existing = findProject(id);
        if (existing) return existing;
        const now = new Date().toISOString();
        const phen = snapshot.whyReport?.phenomenon?.context;
        const created: StudioProject = { id, mode: "single", title: snapshot.trendName, source: { trendKeys: [trend], trendNames: [snapshot.trendName] }, settings: defaultSettings("cardnews"), ...(phen ? { phenomenon: phen, customTopic: phen.title, contextLock: buildContextLock(phen, lockSource(snapshot)) } : {}), assets: realReferences(snapshot, 4), edited: false, createdAt: now, updatedAt: now };
        saveStudioProject(created);
        return created;
      }, "이 트렌드 분석을 찾지 못했습니다. WHY 분석을 먼저 실행하세요.");
      // T4: Overview에서 고른 세부 현상. 저장된 발견 결과가 없으면 주소에 실린 맥락(현상 ID·행동·기간·근거 ID)을 쓴다.
      if (phenomenon) return start(() => {
        const context = findPhenomenon(phenomenon)?.context ?? phenomenonFromQuery(new URLSearchParams(window.location.search));
        if (!context) return null;
        const id = projectIdFor("single", `phen-${context.phenomenonId}`);
        const existing = findProject(id);
        if (existing) return existing;
        const now = new Date().toISOString();
        // 이 현상의 WHY 분석이 있으면 그것을, 없으면 상위 키워드의 WHY 분석을 근거로 쓴다.
        const trendKey = bySnapshot.get(phenomenonTrendId(context))?.whyReport ? phenomenonTrendId(context) : liveTrendId(context.keyword);
        const created: StudioProject = { id, mode: "single", title: context.title, source: { trendKeys: [trendKey], trendNames: [context.keyword] }, settings: defaultSettings("cardnews"), customTopic: context.title, phenomenon: context, contextLock: buildContextLock(context, lockSource(bySnapshot.get(trendKey))), assets: realReferences(bySnapshot.get(trendKey), 4), edited: false, createdAt: now, updatedAt: now };
        saveStudioProject(created);
        return created;
      }, "선택한 현상을 이 브라우저에서 찾지 못했습니다. Overview에서 현상을 다시 찾거나 Workspace에 저장해 주세요.");
      setBoot("ready");
    });
    return () => cancelAnimationFrame(frame);
  // 첫 진입 때 주소(project·creative·trend)로 한 번만 연다.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startSingle = () => {
    const snapshot = bySnapshot.get(pickTrend) ?? snapshots.find((item) => item.whyReport);
    if (!snapshot) return;
    const id = projectIdFor("single", snapshot.trendId);
    const now = new Date().toISOString();
    const next = findProject(id) ?? { id, mode: "single" as const, title: snapshot.trendName, source: { trendKeys: [snapshot.trendId], trendNames: [snapshot.trendName] }, settings: defaultSettings("cardnews"), assets: realReferences(snapshot, 4), edited: false, createdAt: now, updatedAt: now };
    update(next); openUrl(next.id);
  };

  const ready = useMemo(() => snapshots.filter((item) => item.whyReport || item.dna), [snapshots]);
  const filteredReady = useMemo(() => {
    const query = trendSearch.trim().toLocaleLowerCase();
    return query ? ready.filter((item) => item.trendName.toLocaleLowerCase().includes(query)) : ready;
  }, [ready, trendSearch]);
  const aKey = pickA || filteredReady[0]?.trendId || ready[0]?.trendId || "";
  const bKey = pickB && pickB !== aKey ? pickB : (filteredReady.find((item) => item.trendId !== aKey) ?? ready.find((item) => item.trendId !== aKey))?.trendId || "";
  const collisionInputs = useMemo(() => buildCreativeInputs(snapshots, aKey, bKey, cultureLedger, collisions ?? []), [aKey, bKey, collisions, cultureLedger, snapshots]);
  const pairRun = creativeRuns.find((run) => run.trendKeys.includes(aKey) && run.trendKeys.includes(bKey));
  const activeRun = inlineRun && inlineRun.trendKeys.includes(aKey) && inlineRun.trendKeys.includes(bKey) ? inlineRun : pairRun;
  const activeIdea = activeRun?.result.ideas.find((idea) => idea.id === (inlineIdeaId || activeRun.selectedIdeaId)) ?? activeRun?.result.ideas[0];

  const startCreative = (run: CreativeRun, ideaId: string) => {
    const idea = run.result.ideas.find((item) => item.id === ideaId);
    if (!idea) return;
    const selected = { ...run, selectedIdeaId: idea.id, updatedAt: new Date().toISOString() };
    saveCreativeRun(selected);
    const id = projectIdFor("creative", `${run.id}-${idea.id}`);
    const existing = findProject(id);
    if (existing) { setProject(existing); openUrl(existing.id); return; }
    const now = new Date().toISOString();
    const created: StudioProject = {
      id, mode: "creative", title: idea.title,
      source: { trendKeys: [...run.trendKeys], trendNames: [...run.trendNames], creativeRunId: run.id, ideaId: idea.id },
      concept: conceptFromIdea(selected, idea),
      settings: { ...defaultSettings(idea.idea_type === "short_form" ? "shortform" : "cardnews", "concept"), target: idea.audience_appeal.slice(0, 200), cta: idea.CTA.slice(0, 200) },
      assets: [...conceptAssets(selected).filter((asset) => asset.id.endsWith(idea.id)), ...run.trendKeys.flatMap((key) => realReferences(bySnapshot.get(key), 2))],
      edited: false, createdAt: now, updatedAt: now,
    };
    update(created); openUrl(created.id);
  };

  const generateCollision = async () => {
    if (!collisionInputs) return;
    if (!window.confirm(`${collisionInputs.a.name} × ${collisionInputs.b.name} 아이디어를 생성할까요?\nOpenAI 1회(비용 가중치 2)가 실행됩니다. 기존 저장 아이디어가 있으면 먼저 재사용할 수 있습니다.`)) return;
    setCollisionState("loading"); setCollisionError("");
    try {
      const run = await requestCreativeRun(collisionInputs);
      saveCreativeRun(run); setInlineRun(run); setInlineIdeaId(run.selectedIdeaId ?? run.result.ideas[0]?.id ?? ""); setCollisionState("idle");
    } catch (reason) { setCollisionError(reason instanceof Error ? reason.message : "Creative Collision 생성에 실패했습니다."); setCollisionState("error"); }
  };

  const startManualCreative = () => {
    const a = manual.a.trim(), b = manual.b.trim(), topic = manual.topic.trim();
    if (!a || !b || !topic || a.toLocaleLowerCase() === b.toLocaleLowerCase()) return;
    const now = new Date().toISOString();
    const runId = `manual-${now}`;
    const safe = (value: string) => value.replace(/[^A-Za-z0-9가-힣_-]/g, "_").slice(0, 40);
    const trendKeys: [string, string] = [`manual-${safe(a)}`, `manual-${safe(b)}`];
    const id = projectIdFor("creative", `manual-${a}-${b}-${topic}`);
    const created: StudioProject = {
      id, mode: "creative", title: topic,
      source: { trendKeys, trendNames: [a, b], creativeRunId: runId, ideaId: "user-defined-concept" },
      concept: { runId, ideaId: "user-defined-concept", title: topic, concept: topic, rationale: "사용자가 직접 입력한 주제입니다. 저장된 WHY·DNA 분석이나 Creative Collision 생성 결과가 아닙니다.", level: "CUSTOM", ideaType: "user_defined", evidenceMode: "speculative_concept", hooks: [], audience: "", visualBrief: "", imagePrompt: "", ipCaution: "", trendKeys },
      settings: defaultSettings("cardnews", "concept"), customTopic: topic, assets: [], edited: false, createdAt: now, updatedAt: now,
    };
    update(created); openUrl(created.id);
  };

  // T6: 현상에서 들어온 프로젝트의 편집 맥락 잠금. T6 이전에 만든 프로젝트는 현상 맥락으로 다시 만든다(고치면 저장).
  const lock: EditorialContextLock | undefined = project ? project.contextLock ?? (project.phenomenon ? buildContextLock(project.phenomenon, lockSource(bySnapshot.get(project.source.trendKeys[0]))) : undefined) : undefined;
  const contexts = project ? project.source.trendKeys.map((key) => bySnapshot.get(key)).map((snapshot) => snapshot ? toTrendContext(snapshot) : null).filter((item): item is NonNullable<typeof item> => Boolean(item)) : [];
  const missingTrends = project ? project.source.trendKeys.filter((key) => !bySnapshot.get(key)?.whyReport).map((key, i) => project.source.trendNames[project.source.trendKeys.indexOf(key)] ?? key ?? i) : [];

  /** E2: 카드뉴스를 바로 만들지 않고 방향 5개를 먼저 제안받는다. */
  const proposeAngles = async () => {
    if (!project) return;
    setAngleState("loading"); setAngleError("");
    try {
      const mode = settingsMode(project.settings);
      const response = await apiFetch("/api/studio/angles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trends: contexts.slice(0, 2), concept: project.concept, mode, settings: { format: project.settings.format, target: project.settings.target, goal: project.settings.goal, tone: project.settings.tone }, customTopic: project.customTopic ?? "", phenomena: lock?.enabled ? [] : observedPhenomenaFor(project.source.trendNames[0] ?? ""), ...(lock?.enabled ? { contextLock: lock } : {}), force: Boolean(project.angles && project.angles.mode === mode) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "콘텐츠 방향 제안에 실패했습니다.");
      const data = body as AnglesResponse;
      update({ ...project, angles: { items: data.angles, mode: data.mode, validation: data.validation, model: data.model, generatedAt: data.generatedAt }, angle: undefined });
      setAngleState("idle");
    } catch (reason) { setAngleError(reason instanceof Error ? reason.message : "콘텐츠 방향 제안에 실패했습니다."); setAngleState("error"); }
  };
  const chooseAngle = (angle: ContentAngle) => { if (project) update({ ...project, angle: { ...angle } }); };
  /** 사용자가 입력한 주제를 AI 제안 없이 그대로 기획 방향으로 쓴다(가장 우선). */
  const useCustomTopic = () => { if (project?.customTopic?.trim()) update({ ...project, angle: customAngle(project.customTopic, project.settings.target) }); };
  const editAngle = (patch: Partial<ContentAngle>) => { if (project?.angle) update({ ...project, angle: { ...project.angle, ...patch } }); };
  const setMode = (mode: ContentMode) => { if (project) update({ ...project, settings: { ...project.settings, mode } }); };

  const generate = async () => {
    if (!project) return;
    if (project.plan && project.edited && !window.confirm("직접 고친 카피가 있습니다. 다시 생성하면 새 결과로 바뀝니다(이전 결과는 저장된 Workspace 항목에 남아 있을 수 있습니다). 계속할까요?")) return;
    setState("loading"); setError(""); setToast("");
    try {
      const response = await apiFetch("/api/studio/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trends: contexts.slice(0, 2), concept: project.concept, settings: { ...project.settings, mode: settingsMode(project.settings) }, angle: project.angle, customTopic: project.customTopic ?? "", ...(lock?.enabled ? { contextLock: lock } : {}), research: deepResearch && mode !== "report", assets: project.assets.map((asset) => ({ id: asset.id, status: asset.status, title: asset.title })), force: Boolean(project.plan) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "제작 기획 생성에 실패했습니다.");
      const data = body as Response;
      setReferences(data.references);
      update({ ...project, plan: data.plan, validation: data.validation, quality: data.quality ?? undefined, review: data.review ?? undefined, model: data.model, promptVersion: data.promptVersion, generatedAt: data.generatedAt, edited: false });
      if (data.research?.requested) setToast(data.research.status === "live" ? `방향 맞춤 자료 ${data.research.count}건을 조사해 반영했습니다(Editor Notes 출처).` : `방향 맞춤 자료 조사 실패 — 기존 자료로 만들었습니다. ${data.research.message ?? ""}`);
      setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "제작 기획 생성에 실패했습니다."); setState("error"); }
  };

  const setSettings = (patch: Partial<ProductionSettings>) => { if (!project) return; const settings = { ...project.settings, ...patch }; if (patch.format) settings.aspect = patch.format === "shortform" ? "9:16" : settings.aspect === "9:16" ? "4:5" : settings.aspect; update({ ...project, settings }); };
  const setConcept = (patch: Partial<CreativeConcept>) => { if (project?.concept) update({ ...project, concept: { ...project.concept, ...patch } }); };
  const editSlide = (id: string, patch: Partial<ProductionSlide>) => { mutateProject((current) => current.plan ? { ...current, edited: true, plan: { ...current.plan, slides: current.plan.slides.map((slide) => slide.slide_id === id ? { ...slide, ...patch } : slide) } } : null); };
  const editScene = (id: string, patch: Partial<ProductionScene>) => { mutateProject((current) => current.plan ? { ...current, edited: true, plan: { ...current.plan, scenes: current.plan.scenes.map((scene) => scene.scene_id === id ? { ...scene, ...patch } : scene) } } : null); };
  const linkAsset = (unitId: string, assetId: string) => {
    // 진행 중이던 생성 응답은 사용자가 방금 고른 연결/삭제를 덮어쓸 수 없다.
    requestSequence.current += 1;
    sceneRequests.current.set(unitId, `manual-${requestSequence.current}-${assetId || "remove"}`);
    mutateProject((current) => {
      if (!current.plan) return null;
      if (current.settings.format !== "cardnews") return { ...current, edited: true, plan: { ...current.plan, scenes: current.plan.scenes.map((scene) => scene.scene_id === unitId ? { ...scene, asset_ref: assetId } : scene) } };
      const asset = current.assets.find((item) => item.id === assetId);
      const slides = current.plan.slides.map((slide) => {
        if (slide.slide_id !== unitId) return slide;
        const image: SlideImage = asset ? { ...normalizedSlideImage(slide, asset), assetId, status: "ready", source: imageSourceForAsset(asset), storagePath: asset.storagePath, requestId: undefined, errorMessage: undefined } : emptySlideImage(slide.image?.prompt ?? slide.image_prompt);
        return withSlideImage(slide, image);
      });
      return { ...current, edited: true, plan: { ...current.plan, slides } };
    });
    setLinkSlot(null);
  };
  /** 추가 이미지(slide.images): Figma MY TEMPLATES의 IMAGE_2~4·BG_IMAGE용. 대표 이미지는 slide.image 그대로. */
  const editExtraImages = (id: string, change: (list: SlideImageRef[]) => SlideImageRef[]) => { mutateProject((current) => current.plan ? { ...current, edited: true, plan: { ...current.plan, slides: current.plan.slides.map((slide) => slide.slide_id === id ? { ...slide, images: change(slide.images ?? []) } : slide) } } : null); };
  const toggleExtraImage = (id: string, assetId: string) => editExtraImages(id, (list) => list.some((item) => item.assetId === assetId) ? list.filter((item) => item.assetId !== assetId) : [...list, { assetId, role: "detail" }]);
  // 배경은 한 장만: 고른 이미지를 배경으로, 다른 배경은 일반(detail)으로 되돌린다.
  const toggleBackgroundImage = (id: string, assetId: string) => editExtraImages(id, (list) => list.map((item) => item.assetId === assetId ? { ...item, role: item.role === "background" ? "detail" : "background" } : item.role === "background" ? { ...item, role: "detail" } : item));
  const beginImage = (unitId: string, requestId: string, prompt: string) => {
    sceneRequests.current.set(unitId, requestId);
    mutateProject((current) => {
      if (!current.plan || current.settings.format !== "cardnews") return current;
      return beginSlideImageRequest(current, unitId, requestId, prompt);
    });
  };
  const failImage = (unitId: string, requestId: string, message: string) => {
    if (sceneRequests.current.get(unitId) !== requestId) return;
    mutateProject((current) => {
      if (!current.plan || current.settings.format !== "cardnews") return current;
      return failSlideImageRequest(current, unitId, requestId, message);
    });
  };
  /** 생성 결과를 슬라이드의 추가 이미지(slide.images, detail)로 쌓는다 → MY TEMPLATES의 IMAGE_2·IMAGE_3·IMAGE_4. 생성 창은 열어 둬 여러 번 만들 수 있다. */
  const addExtraAsset = (unitId: string, asset: ImageAssetRef, requestId: string) => {
    if (!extraRequests.current.delete(`${unitId}|${requestId}`)) return;
    mutateProject((current) => current.plan && current.settings.format === "cardnews" ? {
      ...current, edited: true, assets: [asset, ...current.assets.filter((item) => item.id !== asset.id)],
      plan: { ...current.plan, slides: current.plan.slides.map((slide) => slide.slide_id === unitId ? { ...slide, images: [...(slide.images ?? []).filter((item) => item.assetId !== asset.id), { assetId: asset.id, role: "detail" as const }] } : slide) },
    } : null);
    setToast("생성한 이미지를 이 슬라이드의 추가 이미지로 넣었습니다(대표 이미지는 그대로).");
  };
  const beginExtra = (unitId: string, requestId: string) => { extraRequests.current.add(`${unitId}|${requestId}`); };
  const failExtra = (unitId: string, requestId: string, message: string) => { if (extraRequests.current.delete(`${unitId}|${requestId}`)) setToast(`추가 이미지 생성 실패: ${message}`); };
  const addAsset = (unitId: string, asset: ImageAssetRef, requestId: string) => {
    if (sceneRequests.current.get(unitId) !== requestId) return;
    const applied = mutateProject((current) => {
      if (!current.plan) return null;
      if (current.settings.format === "cardnews") {
        return resolveSlideImageRequest(current, unitId, requestId, asset);
      }
      if (sceneRequests.current.get(unitId) !== requestId) return null;
      const assets = [asset, ...current.assets.filter((item) => item.id !== asset.id)];
      const scenes = current.plan.scenes.map((scene) => scene.scene_id === unitId ? { ...scene, asset_ref: asset.id } : scene);
      return { ...current, assets, plan: { ...current.plan, scenes }, edited: true };
    });
    if (applied) setImageSlots((open) => { const next = new Set(open); next.delete(unitId); return next; });
  };
  const moveSlide = (slideId: string, delta: number) => mutateProject((current) => {
    if (!current.plan) return null;
    const index = current.plan.slides.findIndex((slide) => slide.slide_id === slideId);
    return index < 0 ? null : { ...current, edited: true, plan: reorderProductionSlide(current.plan, slideId, index + delta) };
  });
  const duplicateSlide = (slideId: string) => mutateProject((current) => current.plan ? { ...current, edited: true, plan: duplicateProductionSlide(current.plan, slideId) } : null);
  const deleteSlide = (slideId: string) => mutateProject((current) => current.plan && current.plan.slides.length > 1 ? { ...current, edited: true, plan: deleteProductionSlide(current.plan, slideId) } : null);
  const toWorkspace = async () => { if (project) setSave(await saveProjectEverywhere(project)); };
  const exportFigma = async () => {
    if (!project) return;
    // AI 이미지는 플러그인이 바로 넣을 수 있게 서명 URL(1시간)·축소본을 함께 담는다. 실제 근거 이미지는 링크만.
    const { images, unsigned } = await figmaImageSources(project.assets);
    const designFor = project.plan && project.settings.format === "cardnews" ? buildCardDesign({ project, plan: project.plan, controls: project.design, visualDna: bySnapshot.get(project.source.trendKeys[0])?.visualDna ?? null, imageAvailable: (id) => Boolean(images[id]) }) : undefined;
    const blob = new Blob([JSON.stringify(toFigmaExport(project, undefined, images, { design: designFor, templateVersions: templateLibrary.versions }), null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${project.id}.figma.json`; link.click(); URL.revokeObjectURL(link.href);
    const count = Object.keys(images).length;
    setToast(`Figma용 JSON을 내려받았습니다 · AI 이미지 ${count}개 포함${Object.values(images).some((item) => item.kind === "signed") ? "(계정 이미지 링크는 1시간 유효)" : ""}${unsigned ? ` · ${unsigned}개는 로그인 필요로 제외` : ""}. figma-plugin 폴더의 플러그인으로 불러오세요.`);
  };
  /*
   * Figma로 보내기: 프로젝트 저장(이미지 업로드 포함) → Figma 디자인 데이터 생성 → 서버 검증 후 Supabase 작업(Handoff) 저장.
   * Figma 파일을 웹에서 직접 만들 수는 없다(REST API 미지원). 사용자가 Figma에서 플러그인을 실행하면 이 작업이 자동 선택된다.
   */
  const sendToFigma = async () => {
    if (!project?.plan) return;
    setHandoff({ state: "sending" });
    const session = await signedInClient();
    if (!session) { setHandoff({ state: "error", needLogin: true, message: "Figma로 보내려면 로그인이 필요합니다. (로그인 없이 쓰려면 Figma JSON 내보내기를 사용하세요.)" }); return; }
    try {
      // 방금 저장한 사본을 그대로 쓴다(브라우저 저장이 실패해도 예전 사본을 읽지 않음).
      const result = await saveProjectEverywhere(project);
      setSave(result);
      const saved = result.project;
      const { images, unsigned } = await figmaImageSources(saved.assets, session.supabase, HANDOFF_TTL_HOURS * 3600 + 600);
      const response = await apiFetch("/api/figma/handoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ export: toFigmaExport(saved, undefined, images, { design: saved.plan && saved.settings.format === "cardnews" ? buildCardDesign({ project: saved, plan: saved.plan, controls: saved.design, visualDna: bySnapshot.get(saved.source.trendKeys[0])?.visualDna ?? null, imageAvailable: (id) => Boolean(images[id]) }) : undefined, templateVersions: templateLibrary.versions }) }) });
      const body = await response.json().catch(() => ({})) as HandoffCreated & { message?: string; error?: string };
      if (!response.ok) { setHandoff({ state: "error", needLogin: response.status === 401, message: body.message ?? `전송하지 못했습니다(HTTP ${response.status}).` }); return; }
      setHandoff({ state: "sent", result: body, message: unsigned ? `이미지 ${unsigned}개는 주소가 없어 Figma에서 “이미지 없음” 자리표시가 됩니다.` : undefined });
    } catch { setHandoff({ state: "error", message: "서버에 연결하지 못했습니다. 네트워크를 확인하고 다시 시도하세요." }); }
  };
  const copyCaption = async () => { if (!project?.plan) return; try { await navigator.clipboard.writeText([project.plan.caption, project.plan.hashtags.join(" ")].filter(Boolean).join("\n\n")); setToast("캡션과 해시태그를 복사했습니다."); } catch { setToast("복사하지 못했습니다."); } };

  if (boot === "loading") return <div className="state-box panel"><LoaderCircle className="spin"/><p>제작 프로젝트를 여는 중입니다.</p></div>;
  if (boot === "missing") return <div className="state-box panel error-box" data-testid="production-missing"><AlertTriangle/><h3>작업을 열 수 없습니다.</h3><p>{bootError}</p><Link className="button" href="/collision">Creative Collision으로</Link></div>;
  if (!project) {
    const a = bySnapshot.get(aKey), b = bySnapshot.get(bKey);
    return <div className="prod-start panel" data-testid="production-start"><div className="titlebar"><span>STUDIO.EXE — NEW PROJECT</span></div><div className="start-body">
      <div className="start-modes" role="radiogroup" aria-label="제작 모드" data-testid="studio-mode-selector">
        <button type="button" role="radio" aria-checked={startMode === "single"} onClick={() => setStartMode("single")} data-testid="studio-mode-single"><b>SINGLE TREND MODE</b><span>한 트렌드의 WHY·DNA로 콘텐츠 제작</span></button>
        <button type="button" role="radio" aria-checked={startMode === "creative"} onClick={() => setStartMode("creative")} data-testid="studio-mode-creative"><b>CREATIVE COLLISION MODE</b><span>두 트렌드와 선택 아이디어로 콘텐츠 제작</span></button>
      </div>
      {startMode === "single" ? <section className="start-section" data-testid="single-start">
        <p><b>SINGLE TREND MODE</b> 한 트렌드의 WHY·DNA·Visual DNA를 사용합니다.</p>
        {ready.length ? <div className="row"><select value={pickTrend || ready[0].trendId} onChange={(event) => setPickTrend(event.target.value)} aria-label="트렌드 선택">{ready.map((item) => <option key={item.trendId} value={item.trendId}>{item.trendName}</option>)}</select><button type="button" className="button primary" onClick={startSingle} data-testid="production-start-single">이 트렌드로 프로젝트 시작</button></div> : <p>WHY 또는 DNA 분석이 있는 트렌드가 없습니다. <Link href="/discover">Discover</Link>에서 분석하세요.</p>}
      </section> : <section className="start-section collision-start" data-testid="creative-start">
        <header><div><b>CREATIVE COLLISION MODE</b><p>저장된 분석과 기존 아이디어를 먼저 재사용합니다. 새 아이디어 생성은 버튼을 누르고 확인한 경우에만 API를 호출합니다.</p></div><Link className="button" href="/collision">전체 Collision 화면</Link></header>
        <label>트렌드 검색<input value={trendSearch} onChange={(event) => setTrendSearch(event.target.value)} placeholder="저장된 트렌드 이름 검색" data-testid="studio-trend-search"/></label>
        {ready.length >= 2 ? <>
          <div className="dual-picks">
            <label>TREND A<select value={aKey} onChange={(event) => { setPickA(event.target.value); if (event.target.value === bKey) setPickB(""); setInlineRun(null); setInlineIdeaId(""); }} data-testid="studio-trend-a">{filteredReady.map((item) => <option key={item.trendId} value={item.trendId}>{item.trendName}</option>)}</select></label>
            <span aria-hidden="true">×</span>
            <label>TREND B<select value={bKey} onChange={(event) => { setPickB(event.target.value); setInlineRun(null); setInlineIdeaId(""); }} data-testid="studio-trend-b">{filteredReady.filter((item) => item.trendId !== aKey).map((item) => <option key={item.trendId} value={item.trendId}>{item.trendName}</option>)}</select></label>
          </div>
          {a && b && <div className="dual-analysis" data-testid="studio-dual-analysis">
            {[a, b].map((item) => <article key={item.trendId}><small>{item.trendName}</small><p><b>WHY</b> {item.whyReport?.overview?.summary ?? item.whyReport?.what?.summary ?? item.whyReport?.triggers[0]?.explanation ?? "분석 없음"}</p><p><b>DNA</b> {item.dna?.dominantPattern?.title ?? "분석 없음"}</p><p><b>VISUAL DNA</b> {item.visualDna?.result.commonFeatures.map((feature) => feature.label).join(", ") || item.visualDna?.result.dimensions[0]?.summary || "분석 없음"}</p></article>)}
            <article className="relation"><small>RELATION</small><p>{collisionInputs?.relation ? `${collisionInputs.relation.type}${collisionInputs.relation.score !== null ? ` · ${Math.round(collisionInputs.relation.score * 100)}` : ""}${collisionInputs.relation.sharedAttributes.length ? ` · ${collisionInputs.relation.sharedAttributes.join(", ")}` : ""}` : "저장된 Culture Map 관계 없음"}</p><p className="note">사용 입력: {collisionInputs?.report.used.join(" · ") || "없음"}</p></article>
          </div>}
          {activeRun ? <div className="inline-ideas" data-testid="studio-collision-ideas"><p><b>저장된 아이디어를 재사용합니다.</b> 새 API 호출 없이 선택할 수 있습니다.</p>{(["SAFE", "BOLD", "WILD"] as const).map((level) => <div key={level}><small>{level}</small>{activeRun.result.ideas.filter((idea) => idea.creativity_level === level).map((idea) => <button type="button" key={idea.id} aria-pressed={activeIdea?.id === idea.id} onClick={() => setInlineIdeaId(idea.id)} data-testid="studio-collision-idea"><b>{idea.title}</b><span>{idea.concept_line}</span></button>)}</div>)}</div> : <p className="note" data-testid="studio-no-collision">이 조합의 저장된 Creative Collision 아이디어가 없습니다.</p>}
          {collisionState === "error" && <p className="warn" role="alert">{collisionError}</p>}
          <div className="row"><button type="button" className="button" onClick={() => void generateCollision()} disabled={!collisionInputs || collisionState === "loading"} data-testid="studio-generate-collision">{collisionState === "loading" ? <><LoaderCircle className="spin"/>아이디어 생성 중…</> : <><Sparkles size={14}/>{activeRun ? "새 아이디어 생성 (API 1회)" : "SAFE·BOLD·WILD 생성 (API 1회)"}</>}</button><button type="button" className="button primary" onClick={() => activeRun && activeIdea && startCreative(activeRun, activeIdea.id)} disabled={!activeRun || !activeIdea} data-testid="production-start-creative">선택 아이디어로 프로젝트 시작</button></div>
        </> : <p className="note">분석된 트렌드가 2개 미만입니다. 아래에서 사용자 주제로 초안을 만들 수 있습니다.</p>}
        <details className="manual"><summary>분석 없이 사용자 지정 주제로 시작</summary><p className="warn">아래 내용은 저장된 WHY·DNA 또는 AI Collision 분석이 아니라 사용자가 입력한 가상 콘셉트로 표시됩니다.</p><div className="manual-grid"><label>TREND A<input value={manual.a} onChange={(event) => setManual({ ...manual, a: event.target.value.slice(0, 80) })} data-testid="manual-trend-a"/></label><label>TREND B<input value={manual.b} onChange={(event) => setManual({ ...manual, b: event.target.value.slice(0, 80) })} data-testid="manual-trend-b"/></label><label>콘텐츠 중심 주제<input value={manual.topic} onChange={(event) => setManual({ ...manual, topic: event.target.value.slice(0, 200) })} placeholder="예: 두 감각을 섞은 가상 팝업" data-testid="manual-topic"/></label></div>{manual.a.trim() && manual.a.trim().toLocaleLowerCase() === manual.b.trim().toLocaleLowerCase() && <p className="warn">같은 트렌드를 두 번 선택할 수 없습니다.</p>}<button type="button" className="button" onClick={startManualCreative} disabled={!manual.a.trim() || !manual.b.trim() || !manual.topic.trim() || manual.a.trim().toLocaleLowerCase() === manual.b.trim().toLocaleLowerCase()} data-testid="production-start-manual">사용자 주제로 초안 시작</button></details>
      </section>}
    </div><style jsx>{`
      .prod-start{padding:0 0 14px}.start-body{padding:14px;display:grid;gap:12px;font-size:13px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}select,input{padding:7px;border:1.5px solid var(--ink);border-radius:4px;min-width:0;max-width:100%;background:#fff}.start-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px}.start-modes button{display:grid;gap:3px;text-align:left;padding:12px;border:1.5px solid var(--ink);border-radius:6px;background:#fff;cursor:pointer;box-shadow:2px 2px 0 var(--ink)}.start-modes button[aria-checked=true]{background:#f6ff3a}.start-modes span{font-size:11px;color:var(--muted)}.start-section{display:grid;gap:10px;border:1px solid var(--border);padding:12px;border-radius:7px}.start-section>p{margin:0}.collision-start>header{display:flex;justify-content:space-between;align-items:start;gap:10px}.collision-start header p{margin:3px 0;color:var(--muted);font-size:12px}.collision-start label,.manual-grid label{display:grid;gap:4px;font-size:11px;font-weight:800;color:var(--blue)}.dual-picks{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:8px;align-items:end}.dual-picks span{font-size:22px}.dual-analysis{display:grid;grid-template-columns:1fr 1fr;gap:8px}.dual-analysis article{border:1px dashed var(--border);padding:9px;border-radius:5px;min-width:0}.dual-analysis .relation{grid-column:1/-1}.dual-analysis small,.inline-ideas small{font-weight:900;color:var(--blue)}.dual-analysis p{margin:4px 0;font-size:11px;line-height:1.5}.inline-ideas{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.inline-ideas>p{grid-column:1/-1;margin:0;font-size:11px}.inline-ideas>div{display:grid;gap:5px;align-content:start}.inline-ideas button{display:grid;gap:3px;text-align:left;padding:8px;border:1.5px solid var(--ink);border-radius:5px;background:#fff;cursor:pointer;font:inherit}.inline-ideas button[aria-pressed=true]{background:#f6ff3a;box-shadow:2px 2px 0 var(--ink)}.inline-ideas button b{font-size:12px}.inline-ideas button span{font-size:10px;color:var(--muted);line-height:1.4}.manual{border-top:1px solid var(--border);padding-top:8px}.manual summary{cursor:pointer;font-weight:800}.manual-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.manual-grid label:last-child{grid-column:1/-1}.note{font-size:11px;color:var(--muted)}.warn{font-size:11px;color:#9b6500}@media(max-width:760px){.start-modes,.dual-analysis,.inline-ideas,.manual-grid{grid-template-columns:1fr}.dual-analysis .relation,.inline-ideas>p,.manual-grid label:last-child{grid-column:auto}}
    `}</style></div>;
  }

  const plan = project.plan;
  const mode = settingsMode(project.settings);
  const visualDna = bySnapshot.get(project.source.trendKeys[0])?.visualDna ?? null;
  const design = plan && project.settings.format === "cardnews" ? buildCardDesign({ project, plan, controls: project.design, visualDna }) : null;
  const autoStyle = plan && project.settings.format === "cardnews" ? buildCardDesign({ project, plan, controls: { ...project.design, style: "auto" }, visualDna }) : null;
  const setDesign = (patch: Partial<DesignControls>) => update({ ...project, design: { ...project.design, ...patch } });
  /** P14: 슬라이드별 Figma 템플릿 선택(웹은 선택만 저장, 템플릿 원본은 Figma에만 있다). null이면 자동 배정. */
  const assignTemplate = (slideId: string, templateId: string | null) => mutateProject((current) => {
    const next = { ...(current.templateAssignments ?? {}) };
    if (templateId) next[slideId] = templateId; else delete next[slideId];
    return { ...current, templateAssignments: next };
  });
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const aspect = project.settings.aspect as ImageAspect;
  const unitSlot = (unitId: string, ref: string, prompt: string, purposes: Array<"cover" | "body" | "thumbnail" | "background">, image?: SlideImage, brief?: ImageBrief) => {
    const asset = ref ? assetById.get(ref) : undefined;
    const stack = Boolean(image) && stackSlots.has(unitId);
    return <div className="slot">
      {asset ? <AssetImage asset={asset} compact/> : <p className="empty-slot">이미지 없음</p>}
      {image && <p className={`image-state ${image.status}`} data-testid="slide-image-state" data-state={image.status}>{image.status === "generating" ? "이 슬라이드 이미지 생성 중…" : image.status === "error" ? `생성 실패 · ${image.errorMessage ?? "다시 시도하세요"}` : image.status === "ready" ? `연결됨 · ${image.source ?? "unknown"}` : "이미지 대기"}</p>}
      <div className="slot-actions">
        <button type="button" className="mini" onClick={() => { setLinkSlot(linkSlot === unitId ? null : unitId); }} data-testid="slot-link"><Link2 size={11}/>이미지 연결</button>
        <button type="button" className="mini" onClick={() => { setImageSlots((open) => { const next = new Set(open); if (next.has(unitId)) next.delete(unitId); else next.add(unitId); return next; }); setLinkSlot(null); }} data-testid="slot-generate"><ImagePlus size={11}/>새 이미지 생성</button>
        {ref && <button type="button" className="mini" onClick={() => linkAsset(unitId, "")} data-testid="slot-unlink">연결 해제</button>}
      </div>
      {linkSlot === unitId && <div className="picker" data-testid="asset-picker">{project.assets.length ? project.assets.map((item) => <button type="button" key={item.id} onClick={() => linkAsset(unitId, item.id)} aria-label={`${item.status} ${item.title} 연결`} aria-pressed={ref === item.id} data-asset-id={item.id}><AssetImage asset={item} compact/></button>) : <p>연결할 이미지가 없습니다.</p>}</div>}
      {imageSlots.has(unitId) && image && <label className="stack-toggle"><input type="checkbox" checked={stackSlots.has(unitId)} onChange={(event) => { const on = event.target.checked; setStackSlots((current) => { const next = new Set(current); if (on) next.add(unitId); else next.delete(unitId); return next; }); }} data-testid="slot-stack"/>추가 이미지로 쌓기 — 대표 이미지는 그대로 두고 추가 1·2·3 순서로 넣음(여러 번 생성 가능)</label>}
      {imageSlots.has(unitId) && <ImageGenerator key={`${unitId}-${stack ? "stack" : "main"}`} scopeId={stack ? `${unitId}-extra` : unitId} initialPrompt={image?.prompt ?? prompt} purposes={purposes} aspects={[aspect]} defaultAspect={aspect} title={`${plan?.title ?? project.title} · ${unitId}${stack ? " · 추가" : ""}`} inspired={Boolean(project.concept?.ipCaution)}
        onStart={(requestId, value) => { if (stack) beginExtra(unitId, requestId); else beginImage(unitId, requestId, value); }}
        onGenerated={(asset, requestId) => { if (stack) addExtraAsset(unitId, asset, requestId); else addAsset(unitId, asset, requestId); }}
        onError={(message, requestId) => { if (stack) failExtra(unitId, requestId, message); else failImage(unitId, requestId, message); }} testId="slot-image" brief={brief}/>}
    </div>;
  };

  return <div className="prod" data-testid="studio-production">
    <aside className="prod-left panel">
      <div className="titlebar"><span>STUDIO.EXE — {project.mode === "creative" ? "CREATIVE COLLISION MODE" : "SINGLE TREND MODE"}</span></div>
      <div className="left-body">
        <p className="mode" data-testid="production-mode">{project.mode === "creative" ? <>CREATIVE COLLISION MODE · {project.source.trendNames.join(" × ")}</> : <>SINGLE TREND MODE · {project.source.trendNames[0]}</>}</p>
        {project.phenomenon && <p className="phen" data-testid="studio-phenomenon">선택한 현상 · <b>{project.phenomenon.title}</b> ({project.phenomenon.verificationStatus}) · 핵심 행동: {project.phenomenon.coreBehavior || "—"} · 관측 {project.phenomenon.window.from}~{project.phenomenon.window.to} · 근거 {project.phenomenon.evidenceIds.join(", ") || "없음"}</p>}
        {lock && <ContextLockPanel lock={lock} onChange={(next) => update({ ...project, contextLock: next })} whyHref={project.phenomenon ? `${trendPath(phenomenonTrendId(project.phenomenon), "why")}?${phenomenonQuery(project.phenomenon)}` : undefined} research={deepResearch} discoveryIds={project.phenomenon?.evidenceIds ?? []}/>}
        {missingTrends.length > 0 && <p className="warn">분석이 없는 트렌드: {missingTrends.join(", ")} — 그 트렌드의 근거는 쓰지 않습니다.</p>}
        {project.concept && <div className="p-concept" data-testid="production-concept"><small>INSIGHT · 콘셉트 제안 ({project.concept.level} · {ideaTypeLabels[project.concept.ideaType as keyof typeof ideaTypeLabels] ?? project.concept.ideaType} · {evidenceModeLabels[project.concept.evidenceMode as keyof typeof evidenceModeLabels] ?? project.concept.evidenceMode})</small>
          <label>아이디어 제목<input value={project.concept.title} onChange={(event) => setConcept({ title: event.target.value })} maxLength={200} data-testid="concept-title"/></label>
          <label>콘셉트<textarea value={project.concept.concept} onChange={(event) => setConcept({ concept: event.target.value })} rows={3} maxLength={1200}/></label>
          <label>문화적 근거<textarea value={project.concept.rationale} onChange={(event) => setConcept({ rationale: event.target.value })} rows={3} maxLength={1500}/></label>
          <label>후킹 후보<textarea value={project.concept.hooks.join("\n")} onChange={(event) => setConcept({ hooks: event.target.value.split("\n").slice(0, 5) })} rows={2}/></label>
          {project.concept.ipCaution && <p className="ip">INSPIRED CONCEPT · {project.concept.ipCaution} 실제 공식 협업이 아니며, 실제 캐릭터·브랜드 자산의 공개·상업적 사용에는 별도 권리 확인이 필요합니다.</p>}
        </div>}
        <div className="modes" role="radiogroup" aria-label="콘텐츠 모드" data-testid="content-modes"><small>CONTENT MODE · 콘텐츠 목적</small>
          {contentModes.filter((item) => item !== "concept" || project.concept).map((item) => <button type="button" role="radio" key={item} aria-checked={mode === item} onClick={() => setMode(item)} data-testid={`mode-${item}`}><b>{contentModeInfo[item].label}</b><span>{contentModeInfo[item].description}</span></button>)}
        </div>
        <div className="angles-box" data-testid="angles-box"><small><Compass size={11}/> CONTENT ANGLE · 콘텐츠 방향</small>
          <label>직접 정한 주제(선택 · 가장 우선)<input value={project.customTopic ?? ""} onChange={(event) => update({ ...project, customTopic: event.target.value.slice(0, 200) })} placeholder="예: 처음 야구장에 가는 사람을 위한 입덕 가이드" data-testid="custom-topic"/></label>
          {project.customTopic?.trim() && <button type="button" className="mini" onClick={useCustomTopic} data-testid="custom-topic-use">이 주제 그대로 쓰기 (AI 제안 없이)</button>}
          <button type="button" className="button" onClick={() => void proposeAngles()} disabled={angleState === "loading" || (!contexts.length && !project.concept)} data-testid="angles-generate">{angleState === "loading" ? <><LoaderCircle className="spin"/>방향 제안 중…</> : project.customTopic?.trim() ? "이 주제로 방향 5개 제안받기" : project.angles ? "방향 다시 제안받기 (새 API 호출)" : "콘텐츠 방향 5개 제안받기"}</button>
          {angleState === "error" && <p className="warn" role="alert">{angleError}</p>}
          {project.angles && project.angles.mode !== mode && <p className="warn">모드를 바꿨어요. 아래 방향은 {contentModeInfo[project.angles.mode].label} 기준이에요 — 다시 제안받는 것을 권장해요.</p>}
          {mode === "report" && !project.angle && <p className="note">TREND REPORT는 방향 없이 바로 만들 수도 있어요(기존 분석 보고서형).</p>}
          {project.angles && <ol className="angle-list" role="radiogroup" aria-label="콘텐츠 방향">{project.angles.items.map((angle) => <li key={angle.angle_id}><button type="button" role="radio" aria-checked={project.angle?.angle_id === angle.angle_id} onClick={() => chooseAngle(angle)} data-testid="angle-card">
            <b>{angle.title}</b>{angle.focus && <span className="focus" data-testid="angle-focus">초점 · {angle.focus}</span>}{(angle.editorial_type || angle.reader_value) && <span className="brief" data-testid="angle-brief">{angle.editorial_type ? editorialTypeLabels[angle.editorial_type] : ""}{angle.editorial_type && angle.reader_value ? " · " : ""}{angle.reader_value ? `독자 가치: ${readerValueLabels[angle.reader_value]}` : ""}{angle.key_scene ? ` · 대표 장면: ${angle.key_scene}` : ""}</span>}<span className="hook">“{angle.hook}”</span><span>{angle.editorial_perspective}</span>
            <em>{angle.angle_type ? `${angleTypeLabels[angle.angle_type]} · ` : ""}{angle.target_audience} · {evidenceFitLabels[angle.evidence_fit]}{angle.research_anchor ? " · 자료 속 사건 중심" : ""}</em>
          </button></li>)}</ol>}
          {project.angles && <p className="note" data-testid="angles-check">서버 검사 · {project.angles.validation.focusCount !== undefined ? `서로 다른 초점 ${project.angles.validation.focusCount}개 · 키워드 역사·입문 방향 ${project.angles.validation.basicAngles?.length ?? 0}개 · ` : ""}독자 경험 유형 {project.angles.validation.typeCount ?? "—"}종 · 자료 사건 중심 {project.angles.validation.anchored ?? "—"}개 · 흔한 제목 {project.angles.validation.genericTitles.length}개{project.angles.validation.offTopic?.length ? ` · 지정 주제 확인 필요 ${project.angles.validation.offTopic.length}개(단어 기준 참고)` : ""}{project.angles.validation.regenerated ? " · 1회 다시 생성함" : ""}</p>}
          {project.angle && <div className="angle-edit" data-testid="angle-selected"><small>선택한 방향 · 고칠 수 있어요</small>
            {project.angle.angle_type === "custom" && <p className="note">사용자가 입력한 주제를 그대로 씁니다. 이 주제에서 벗어나지 않게 만듭니다.</p>}
            <label>제목<input value={project.angle.title} onChange={(event) => editAngle({ title: event.target.value.slice(0, 120) })} data-testid="angle-title"/></label>
            <label>첫 장 후킹<input value={project.angle.hook} onChange={(event) => editAngle({ hook: event.target.value.slice(0, 200) })}/></label>
            <label>관점<textarea value={project.angle.editorial_perspective} onChange={(event) => editAngle({ editorial_perspective: event.target.value.slice(0, 400) })} rows={2}/></label>
            <p className="note">독자 혜택 · {project.angle.reader_benefit}</p>
            <p className="note">구성 · {project.angle.content_structure.join(" → ")}</p>
            {project.angle.research_requirements.length > 0 && <p className="note">리서치 필요 · {project.angle.research_requirements.join(" / ")}</p>}
          </div>}
          {project.angle && project.angle.angle_type !== "custom" && project.angle.evidence_fit !== "grounded" && <ThinEvidenceOptions
            fit={project.angle.evidence_fit} hasLock={Boolean(lock)}
            research={deepResearch} onResearch={() => setDeepResearch(true)}
            slides={project.settings.format === "cardnews" ? project.settings.slideCount : null} onFewerSlides={() => setSettings({ slideCount: 4 })}
            alternatives={(project.angles?.items ?? []).filter((angle) => angle.evidence_fit === "grounded" && angle.angle_id !== project.angle?.angle_id)} onChoose={chooseAngle}/>}
        </div>
        {project.settings.format === "cardnews" && <div className="settings design-set" data-testid="design-controls"><small>DESIGN · 카드뉴스 디자인</small>
          <div className="design-source" role="radiogroup" aria-label="DESIGN SOURCE" data-testid="design-source"><small>DESIGN SOURCE</small>
            <div className="src-options">
              <label className="src-option"><input type="radio" name="design-source" checked={(project.designSource ?? "auto") === "auto"} onChange={() => update({ ...project, designSource: "auto" })} data-testid="design-source-auto"/>AUTO DESIGN</label>
              <label className="src-option"><input type="radio" name="design-source" checked={project.designSource === "templates"} onChange={() => update({ ...project, designSource: "templates" })} data-testid="design-source-templates"/>MY TEMPLATES</label>
            </div>
          </div>
          {project.designSource === "templates" ? <TemplateGallery library={templateLibrary}/> : <>
          <label>디자인 스타일<select value={project.design?.style ?? "auto"} onChange={(event) => setDesign({ style: event.target.value as DesignControls["style"] })} data-testid="design-style"><option value="auto">자동 추천{autoStyle ? ` (${autoStyle.styleLabel})` : ""}</option>{designStyleIds.map((id) => <option key={id} value={id}>{STYLES[id].label}</option>)}</select></label>
          <div className="two"><label>색<select value={project.design?.palette ?? "auto"} onChange={(event) => setDesign({ palette: event.target.value as DesignControls["palette"] })} data-testid="design-palette">{paletteModes.map((id) => <option key={id} value={id}>{paletteModeLabels[id]}</option>)}</select></label>
          <label>글자 분위기<select value={project.design?.typeMood ?? "auto"} onChange={(event) => setDesign({ typeMood: event.target.value as DesignControls["typeMood"] })} data-testid="design-type">{typeMoods.map((id) => <option key={id} value={id}>{typeMoodLabels[id]}</option>)}</select></label></div>
          <div className="two"><label>이미지 비중<select value={project.design?.imageEmphasis ?? "auto"} onChange={(event) => setDesign({ imageEmphasis: event.target.value as DesignControls["imageEmphasis"] })} data-testid="design-image">{imageEmphases.map((id) => <option key={id} value={id}>{imageEmphasisLabels[id]}</option>)}</select></label>
          <label>밀도<select value={project.design?.density ?? "balanced"} onChange={(event) => setDesign({ density: event.target.value as DesignControls["density"] })} data-testid="design-density">{densities.map((id) => <option key={id} value={id}>{densityLabels[id]}</option>)}</select></label></div>
          <p className="note">비율은 위 “비율”을 따릅니다. 생성 후 오른쪽에서 미리보고, Figma로 보내면 같은 디자인으로 편집 가능한 레이어가 만들어집니다.</p>
          </>}
        </div>}
        <div className="settings" data-testid="production-settings">
          <label>콘텐츠 형식<select value={project.settings.format} onChange={(event) => setSettings({ format: event.target.value as ProductionSettings["format"] })} data-testid="setting-format">{(["cardnews", "shortform"] as const).map((format) => <option key={format} value={format}>{productionFormatLabels[format]}</option>)}</select></label>
          {project.settings.format === "cardnews" ? <div className="two"><label>비율<select value={project.settings.aspect} onChange={(event) => setSettings({ aspect: event.target.value as ProductionSettings["aspect"] })}><option value="4:5">4:5</option><option value="1:1">1:1</option></select></label><label>슬라이드 수<input type="number" min={4} max={10} value={project.settings.slideCount} onChange={(event) => setSettings({ slideCount: Math.max(4, Math.min(10, Number(event.target.value) || 4)) })} data-testid="setting-slides"/></label></div>
            : <div className="two"><label>비율<input value="9:16" readOnly/></label><label>영상 길이(초)<input type="number" min={15} max={60} step={5} value={project.settings.durationSec} onChange={(event) => setSettings({ durationSec: Math.max(15, Math.min(60, Number(event.target.value) || 15)) })} data-testid="setting-duration"/></label></div>}
          <label>타깃<input value={project.settings.target} onChange={(event) => setSettings({ target: event.target.value.slice(0, 200) })} placeholder="비워 두면 분석 결과에서 제안"/></label>
          <label>톤앤매너<input value={project.settings.tone} onChange={(event) => setSettings({ tone: event.target.value.slice(0, 200) })} list="tone-presets" data-testid="setting-tone"/><datalist id="tone-presets">{TONE_PRESETS.map((tone) => <option key={tone} value={tone}/>)}</datalist></label>
          <label>브랜드명(선택)<input value={project.settings.brand} onChange={(event) => setSettings({ brand: event.target.value.slice(0, 80) })} placeholder="없으면 비워 두기"/></label>
          <label>콘텐츠 목표<input value={project.settings.goal} onChange={(event) => setSettings({ goal: event.target.value.slice(0, 200) })} placeholder="예: 저장·공유 유도"/></label>
          <label>CTA<input value={project.settings.cta} onChange={(event) => setSettings({ cta: event.target.value.slice(0, 200) })}/></label>
        </div>
        <button type="button" className="button primary" onClick={() => void generate()} disabled={state === "loading" || (!contexts.length && !project.concept) || (!project.angle && mode !== "report")} data-testid="production-generate">{state === "loading" ? <><LoaderCircle className="spin"/>기획 생성 중…</> : <><Sparkles size={14}/>{plan ? "다시 생성 (새 API 호출)" : `${productionFormatLabels[project.settings.format]} 만들기`}</>}</button>
        {!project.angle && mode !== "report" && <small className="note">먼저 콘텐츠 방향을 골라 주세요.</small>}
        {mode !== "report" && <label className="check"><input type="checkbox" checked={deepResearch} onChange={(event) => setDeepResearch(event.target.checked)} data-testid="angle-research"/>선택한 방향에 맞는 디테일 조사 (권장 · 웹 검색 1회 추가 · 실제 조회한 출처만) — 생성 후 편집 리뷰 1회 포함</label>}
        <small className="note">OpenAI 1회 · 같은 입력 12시간 캐시. 이미지는 슬라이드마다 직접 생성 버튼을 눌러야 만들어집니다.</small>
        <div className="assets" data-testid="production-assets"><small>IMAGES · {project.assets.length}</small><div>{project.assets.map((asset) => <AssetImage key={asset.id} asset={asset} compact/>)}</div>{!project.assets.length && <p className="note">연결 가능한 이미지가 없습니다.</p>}</div>
      </div>
    </aside>

    <section className="prod-out panel" aria-label="Production plan">
      <div className="titlebar"><span>{project.settings.format === "cardnews" ? "CARDNEWS.EXE" : "STORYBOARD.EXE"} — {plan?.title ?? project.title}</span></div>
      <div className="out-body">
        {state === "error" && <div className="state-box error-box" role="alert"><AlertTriangle/><p>{error}</p></div>}
        {!plan ? <div className="state-box"><DataBadge status="NOT ANALYZED"/><p>왼쪽 설정을 확인하고 기획을 생성하세요. 생성 후 카피를 직접 고칠 수 있고, 고친 내용은 자동으로 이 브라우저에 저장됩니다.</p></div> : <>
          <header className="out-head"><div><small>{productionFormatLabels[project.settings.format]} · {project.settings.format === "cardnews" ? `${plan.slides.length}장 · ${project.settings.aspect}` : `${project.settings.durationSec}초 · 9:16`}</small><h2>{plan.title}</h2></div><DataBadge status="SAVED" detail={`${project.model ?? ""} · ${formatDateTime(project.generatedAt)}${project.edited ? " · 수정됨" : ""}`}/></header>
          {plan.concept_notice && <p className="notice" data-testid="concept-notice">CONCEPT · {plan.concept_notice}</p>}
          {project.designSource === "templates" && project.settings.format === "cardnews" && <details className="design-box" open data-testid="my-templates-preview"><summary>MY TEMPLATES PREVIEW · 슬라이드별 템플릿</summary>
            <TemplateSlidePreviews project={project} slides={plan.slides} library={templateLibrary} onAssign={assignTemplate}/>
          </details>}
          {design && project.designSource !== "templates" && <details className="design-box" open><summary>DESIGN PREVIEW · {design.styleLabel} · {design.frames.map((frame) => frame.layout).join(" ")}</summary>
            <CardPreview design={design} assets={project.assets}/>
            <p className="ev" data-testid="design-reason">스타일: {design.styleReason} · 색: {design.colorSources.filter((item) => item.source === "observed").length ? `Visual DNA 관찰 색 ${design.colorSources.filter((item) => item.source === "observed").length}개 사용(역할 배정은 규칙 해석)` : "스타일 기본색"}{design.notes.length ? ` · ${design.notes.join(" ")}` : ""}</p>
            {design.frames.some((frame) => frame.notes.length) && <ul className="design-notes">{design.frames.filter((frame) => frame.notes.length).map((frame) => <li key={frame.id}>{frame.number}번: {frame.notes.join(" / ")}</li>)}</ul>}
          </details>}
          <p className="pub-label" data-testid="publishing-content"><b>PUBLISHING CONTENT</b> 게시용 카피 · 캡션 · 해시태그 · 이미지 · 비주얼 디렉션{project.angle ? ` · 방향 “${project.angle.title}”` : ""} · {contentModeInfo[mode].label}</p>
          {project.settings.format === "cardnews" ? <ol className="slides" data-testid="production-slides">{plan.slides.map((slide, slideIndex) => <li key={slide.slide_id} className="slide" data-testid="production-slide" data-slide-id={slide.slide_id}>
            <div className="slide-head"><b>{String(slide.number).padStart(2, "0")}</b><span>{slide.type.toUpperCase()}</span><em>{slide.layout_hint}</em>{slide.review?.length ? <i className="review" title={slide.review.join("\n")} data-testid="slide-review">검증 필요 {slide.review.length}</i> : null}{slide.revised ? <i className="revised" title={slide.revised} data-testid="slide-revised">리뷰 수정</i> : null}<span className="slide-actions"><button type="button" className="mini" onClick={() => moveSlide(slide.slide_id, -1)} disabled={slideIndex === 0} aria-label={`${slide.number}번 슬라이드 위로`} data-testid="slide-up"><ChevronUp size={11}/></button><button type="button" className="mini" onClick={() => moveSlide(slide.slide_id, 1)} disabled={slideIndex === plan.slides.length - 1} aria-label={`${slide.number}번 슬라이드 아래로`} data-testid="slide-down"><ChevronDown size={11}/></button><button type="button" className="mini" onClick={() => duplicateSlide(slide.slide_id)} aria-label={`${slide.number}번 슬라이드 복제`} data-testid="slide-duplicate"><CopyPlus size={11}/></button><button type="button" className="mini" onClick={() => deleteSlide(slide.slide_id)} disabled={plan.slides.length <= 1} aria-label={`${slide.number}번 슬라이드 삭제`} data-testid="slide-delete"><Trash2 size={11}/></button></span></div>
            <label>헤드라인<textarea value={slide.headline} onChange={(event) => editSlide(slide.slide_id, { headline: event.target.value })} rows={2} data-testid="slide-headline"/></label>
            <label>본문<textarea value={slide.body} onChange={(event) => editSlide(slide.slide_id, { body: event.target.value })} rows={2}/></label>
            <label>보조 문구<input value={slide.supporting_text} onChange={(event) => editSlide(slide.slide_id, { supporting_text: event.target.value })}/></label>
            {slide.cta && <label>CTA<input value={slide.cta} onChange={(event) => editSlide(slide.slide_id, { cta: event.target.value })}/></label>}
            <p className="vd"><b>VISUAL</b> {slide.visual_direction}</p>
            {unitSlot(slide.slide_id, slideImageAssetId(slide), slide.image_prompt, slide.type === "cover" ? ["cover", "background", "body"] : ["body", "background", "cover"], normalizedSlideImage(slide, assetById.get(slideImageAssetId(slide))), slideImageBrief(slide, { lock, title: plan?.title ?? project.title }))}
            {(() => { const extras = (slide.images ?? []).filter((item) => item.assetId !== slideImageAssetId(slide) && assetById.has(item.assetId)); let order = 1; return extras.length ? <ul className="extra-strip" data-testid="slide-extra-strip">{extras.map((item) => { const slot = item.role === "background" ? "BG_IMAGE" : `추가 ${(order += 1) - 1}`; return <li key={item.assetId} data-slot={slot}><span className="extra-thumb"><AssetImage asset={assetById.get(item.assetId)!} compact/></span><b>{slot}</b><button type="button" className="mini" onClick={() => toggleExtraImage(slide.slide_id, item.assetId)} aria-label={`${slot} 이미지 빼기`} data-testid="extra-remove">빼기</button></li>; })}</ul> : null; })()}
            {project.assets.some((item) => item.id !== slideImageAssetId(slide)) && <details className="extra-images" data-testid="slide-extra-images" onToggle={(event) => { const open = (event.currentTarget as HTMLDetailsElement).open; setExtraOpen((current) => { const next = new Set(current); if (open) next.add(slide.slide_id); else next.delete(slide.slide_id); return next; }); }}><summary>추가 이미지 · Figma 템플릿용 ({(slide.images ?? []).filter((item) => item.assetId !== slideImageAssetId(slide) && assetById.has(item.assetId)).length})</summary>
              <p className="note">MY TEMPLATES: 대표 이미지는 IMAGE_MAIN, 추가 이미지는 IMAGE_1·IMAGE_2·IMAGE_3… 순서로(IMAGE_MAIN이 없는 템플릿은 대표 이미지가 IMAGE_1), “배경”으로 고른 1장은 BG_IMAGE에 들어갑니다. 대표 이미지는 위 “이미지 연결”.</p>
              {/* 열었을 때만 그린다: 닫힌 칸에 다른 슬라이드 이미지가 섞여 보이지 않게 */}
              {extraOpen.has(slide.slide_id) && <div className="picker">{project.assets.filter((item) => item.id !== slideImageAssetId(slide)).map((item) => { const ref = slide.images?.find((entry) => entry.assetId === item.id); return <div key={item.id} className="extra"><button type="button" onClick={() => toggleExtraImage(slide.slide_id, item.id)} aria-pressed={Boolean(ref)} aria-label={`${item.title} 추가 이미지로 ${ref ? "빼기" : "넣기"}`} data-testid="extra-image-toggle" data-asset-id={item.id}><AssetImage asset={item} compact/></button>{ref && <label><input type="checkbox" checked={ref.role === "background"} onChange={() => toggleBackgroundImage(slide.slide_id, item.id)} data-testid="extra-image-background"/>배경</label>}</div>; })}</div>}
            </details>}
          </li>)}</ol>
          : <ol className="slides" data-testid="production-scenes">{plan.scenes.map((scene) => <li key={scene.scene_id} className="slide" data-testid="production-scene">
            <div className="slide-head"><b>{scene.time_range}</b><span>{scene.transition}</span>{scene.review?.length ? <i className="review" title={scene.review.join("\n")} data-testid="slide-review">검증 필요 {scene.review.length}</i> : null}</div>
            <p className="vd">{scene.description}</p>
            <label>화면 자막<input value={scene.on_screen_text} onChange={(event) => editScene(scene.scene_id, { on_screen_text: event.target.value })}/></label>
            <label>내레이션<textarea value={scene.voice_over} onChange={(event) => editScene(scene.scene_id, { voice_over: event.target.value })} rows={2}/></label>
            <p className="vd"><b>VISUAL</b> {scene.visual_direction}</p>
            {unitSlot(scene.scene_id, scene.asset_ref, scene.image_prompt, ["thumbnail", "background"], undefined, slideImageBrief(scene, { lock, title: plan?.title ?? project.title }))}
          </li>)}</ol>}
          <div className="copy" data-testid="publishing-caption"><small>CAPTION</small><p className="caption-text">{plan.caption}</p><p className="tags">{plan.hashtags.join(" ")}</p></div>
          <details className="editor-notes" data-testid="editor-notes"><summary><NotebookPen size={13}/> EDITOR NOTES · 제작자 전용(게시하지 않음){(project.validation?.needsReview?.length ?? 0) + (project.validation?.reportPhrases?.length ?? 0) > 0 ? ` · 확인 필요 ${(project.validation?.needsReview?.length ?? 0) + (project.validation?.reportPhrases?.length ?? 0)}` : ""}</summary>
            {plan.summary && <p className="summary">{plan.summary}</p>}
            {(plan.storyline?.length ?? 0) > 0 && <div className="copy" data-testid="notes-storyline"><small>STORYLINE · 먼저 세운 전개</small><ol>{plan.storyline!.map((beat, index) => <li key={index}>{beat.beat}<span className="ev"> → {beat.reader_gets}</span></li>)}</ol></div>}
            {(plan.detail_bank?.length ?? 0) > 0 && <div className="copy" data-testid="notes-detail-bank"><small>DETAIL BANK · 쓰기 전에 모은 소재 고유 디테일 {plan.detail_bank!.length} (근거 확인 {plan.detail_bank!.filter((item) => item.status === "verified").length})</small><ul>{plan.detail_bank!.map((item) => <li key={item.id}><b>{item.id}</b> {item.detail} <span className="ev">· 사례 {item.example} · 활용 {item.use} · {item.status === "verified" ? `근거 ${item.source_ids.join(", ")}` : "검증 필요(일반 지식)"}</span></li>)}</ul></div>}
            {project.quality && <div className="copy quality" data-testid="quality-gate"><small>A. 필수 검증 · 자동 규칙 {project.quality.passed}/{project.quality.total}</small><ul>{project.quality.checks.filter((check) => (check.group ?? "required") === "required").map((check) => <li key={check.id} className={check.pass ? "ok" : "bad"}>{check.pass ? "○" : "×"} {check.label} — {check.detail}</li>)}</ul>
              <small>B. 편집 신호 · 규칙 기반 참고(통과 여부는 편집 리뷰가 판단)</small><ul>{project.quality.checks.filter((check) => check.group === "editorial").map((check) => <li key={check.id} className={check.pass ? "ok" : "hint"}>{check.pass ? "○" : "△"} {check.label} — {check.detail}</li>)}</ul>{project.quality.genericSentences.length > 0 && <p className="ev">다른 소재에도 통하는 문장: {project.quality.genericSentences.slice(0, 4).join(" / ")}</p>}</div>}
            <UserRatingPanel key={project.id} rating={project.userRating} planTitle={plan.title} onSave={(rating) => update({ ...project, userRating: rating })}/>
            {project.review && <div className="copy review-box" data-testid="editorial-review"><small>편집 리뷰 · AI 참고 점수(사용자 평가 아님) · {project.review.model}</small><p className="scores">후킹 {project.review.scores.hook} · 소재 고유성 {project.review.scores.specificity} · 전개 {project.review.scores.story} · 저장·공유 {project.review.scores.save_share} · 문체 {project.review.scores.voice} <span className="ev">(1~5)</span></p><p>{project.review.summary}</p>{project.review.patched.length > 0 ? <ul>{project.review.titleChange && <li>제목: “{project.review.titleChange.from}” → “{project.review.titleChange.to}”</li>}{project.review.patched.filter((item) => item.unit !== "title").map((item) => <li key={String(item.unit)}>{item.unit}번 고쳐 씀 — {item.reason}</li>)}</ul> : <p className="ev">고쳐 쓴 슬라이드 없음</p>}{(project.review.reverted?.length ?? 0) > 0 && <p className="ev" data-testid="review-reverted">새 문제가 생겨 초안으로 되돌린 슬라이드: {project.review.reverted!.map((item) => `${item.unit}번(${item.problems.join(", ")})`).join(" · ")}</p>}<p className="ev">필수 검증: 수정 전 {project.review.before.passed}/{project.review.before.total} → 수정 후 {project.quality?.passed ?? "—"}/{project.quality?.total ?? "—"}</p></div>}
            {(project.validation?.needsReview?.length ?? 0) > 0 && <div className="copy" data-testid="notes-review"><small>사실 확인 필요 · 근거 없는 주장</small><ul>{[...plan.slides, ...plan.scenes].flatMap((unit) => (unit.review ?? []).map((line) => <li key={`${"slide_id" in unit ? unit.slide_id : unit.scene_id}-${line}`}>{"slide_id" in unit ? `슬라이드 ${unit.number}` : unit.time_range} · {line.replace(/^검증 필요: /, "")}</li>))}</ul></div>}
            {(project.validation?.reportPhrases?.length ?? 0) > 0 && <div className="copy" data-testid="notes-report-phrases"><small>보고서식 표현이 게시용 문구에 남음</small><ul>{project.validation!.reportPhrases!.map((item, index) => <li key={index}>{item.unit === "caption" ? "캡션" : `${item.unit}번`} · “{item.phrase}”</li>)}</ul></div>}
            {plan.claims.length > 0 && <div className="p-claims"><small>EVIDENCE · 핵심 주장과 근거 ID</small>{plan.claims.map((claim) => <p key={claim.text}><b>{claim.status}</b> {claim.text}{claim.evidence_ids.length ? <em> · {claim.evidence_ids.join(", ")}</em> : null}</p>)}</div>}
            {[...plan.slides, ...plan.scenes].some((unit) => unit.evidence_ids.length || unit.fact_checks?.length) && <div className="copy"><small>슬라이드별 근거</small>{[...plan.slides, ...plan.scenes].map((unit) => (unit.evidence_ids.length || unit.fact_checks?.length) ? <p key={"slide_id" in unit ? unit.slide_id : unit.scene_id} className="ev">{"slide_id" in unit ? `${unit.number}번` : unit.time_range} · {[...unit.evidence_ids, ...(unit.fact_checks ?? []).flatMap((fact) => fact.evidence_ids)].filter((id, index, all) => all.indexOf(id) === index).join(", ") || "근거 ID 없음"}{(unit.fact_checks ?? []).length ? ` · 사실 ${unit.fact_checks!.length}건` : ""}</p> : null)}</div>}
            <div className="copy"><small>VERIFY BEFORE PUBLISHING</small><ul>{plan.verify_before_publishing.map((item) => <li key={item}>{item}</li>)}{plan.editor_notes?.fact_checks.map((item) => <li key={`f-${item}`}>{item}</li>)}</ul></div>
            {(plan.editor_notes?.research_gaps.length ?? 0) > 0 && <div className="copy"><small>RESEARCH GAPS · 내부 참고</small><ul>{plan.editor_notes!.research_gaps.map((item) => <li key={item}>{item}</li>)}</ul></div>}
            <div className="copy" data-testid="notes-rights"><small>IMAGE RIGHTS · AI 표시</small><ul>{(plan.editor_notes?.image_rights ?? []).map((item) => <li key={item}>{item}</li>)}{project.assets.filter((asset) => [...plan.slides.map((slide) => slide.image_ref), ...plan.scenes.map((scene) => scene.asset_ref)].includes(asset.id)).map((asset) => <li key={asset.id}>{asset.status} · {asset.title} — {asset.rights}</li>)}</ul>{plan.editor_notes?.ai_disclosure && <p className="ev">{plan.editor_notes.ai_disclosure}</p>}</div>
            {project.validation && <p className="ev" data-testid="server-validation">SERVER VALIDATION · 근거 ID 제거 {project.validation.removedEvidenceIds.length} · 근거 없는 주장 하향 {project.validation.downgradedClaims} · 검증 필요 슬라이드 {project.validation.needsReview?.length ?? 0} · 게시 문구의 내부 ID 제거 {project.validation.strippedRefs ?? 0} · 없는 이미지 참조 제거 {project.validation.removedImageRefs} · 장면 시간 정리 {project.validation.timingFixed}</p>}
            {references.length > 0 && <div className="copy"><small>REFERENCES · 서버 근거 원장</small>{references.map((item) => <p key={item.id} className="ev">{item.id} · {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</p>)}</div>}
          </details>
        </>}
        <div className="actions">
          <button type="button" className="button primary" onClick={() => void toWorkspace()} data-testid="production-save"><Save size={14}/>Workspace에 저장</button>
          <button type="button" className="button primary" onClick={() => void sendToFigma()} disabled={!plan || handoff?.state === "sending"} data-testid="production-figma-send"><Send size={14}/>{handoff?.state === "sending" ? "Figma로 보내는 중…" : "Figma로 보내기"}</button>
          <button type="button" className="button" onClick={() => void exportFigma()} disabled={!plan} data-testid="production-figma"><Download size={14}/>Figma JSON 내보내기</button>
          <button type="button" className="button" onClick={() => void copyCaption()} disabled={!plan}><Clipboard size={14}/>캡션 복사</button>
        </div>
        {handoff && handoff.state !== "sending" && <div className={`handoff ${handoff.state}`} role="status" data-testid="figma-handoff" data-state={handoff.state}>
          {handoff.state === "sent" && handoff.result ? <>
            <p className="h-title"><Figma size={14}/>Figma로 보냈습니다{handoff.result.duplicate ? " · 같은 내용의 기존 작업을 다시 사용" : ""}</p>
            <p>작업 코드 <b data-testid="figma-handoff-code">{handoff.result.code}</b> · {formatDateTime(handoff.result.expiresAt)}까지 유효 · AI 이미지 {handoff.result.images.included}개 포함</p>
            <ol><li>Figma에서 카드뉴스를 넣을 파일을 엽니다.</li><li>Plugins → <b>TREND RADAR Studio Import</b> 실행 (처음이면 “TREND RADAR 연결” 1회)</li><li>코드 <b>{handoff.result.code}</b> 작업이 자동 선택되면 “카드뉴스 만들기”</li></ol>
            {handoff.message && <p className="warn">{handoff.message}</p>}
            <div className="actions"><a className="button" href="https://www.figma.com/files/recents-and-sharing" target="_blank" rel="noreferrer" data-testid="figma-open"><ExternalLink size={14}/>Figma 열기</a></div>
            <p className="note">Figma 파일은 웹에서 직접 만들 수 없어(Figma 공식 API 제한) 플러그인 실행이 한 번 필요합니다. 기존 파일의 작업은 지우지 않고 옆에 추가합니다.</p>
          </> : <><p className="h-title"><AlertTriangle size={14}/>Figma로 보내지 못했습니다</p><p data-testid="figma-handoff-error">{handoff.message}</p>{handoff.needLogin && <Link className="button" href="/auth">로그인</Link>}</>}
        </div>}
        {save && <CloudSaveStatus result={save}/>}
        {toast && <p className="toast-line" role="status">{toast}</p>}
      </div>
    </section>
    <style jsx>{`
      .prod{display:grid;grid-template-columns:330px minmax(0,1fr);gap:14px;align-items:start}.prod>*{min-width:0}
      .prod-left,.prod-out{padding:0 0 14px;overflow-wrap:anywhere}
      .left-body,.out-body{padding:14px;display:grid;gap:10px}
      small{display:block;font-family:var(--font-display);font-size:11px;letter-spacing:.06em;color:var(--blue);margin-bottom:4px}
      label{display:grid;gap:3px;font-size:11px;font-weight:700;color:#2e3140;min-width:0}
      input,textarea,select{font:inherit;font-size:12px;font-weight:400;padding:6px 7px;border:1.5px solid var(--ink);border-radius:4px;background:#fff;min-width:0;width:100%;box-sizing:border-box}
      .mode{margin:0;font-size:12px;font-weight:800;padding:6px 8px;background:#f6ff3a;border:1.5px solid var(--ink);border-radius:4px}
      .warn{margin:0;font-size:11px;color:#9b6500}.phen{margin:0;font-size:11px;line-height:1.5;padding:6px 8px;border:1px dashed var(--border);background:#fffdf0;overflow-wrap:anywhere}
      .p-concept,.settings{display:grid;gap:6px;padding:8px;border:1px dashed var(--border);border-radius:6px}
      .ip{margin:0;font-size:11px;padding:6px 8px;background:#ffe3e8;border:1px solid #c2185b;border-radius:4px}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:6px}
      .note{font-size:10px;color:var(--muted);margin:0}
      .assets>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
      .out-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px}.out-head h2{margin:2px 0 0;font-size:22px}
      .notice{margin:0;font-size:12px;color:#6b3fa0;background:#f3e8ff;border:1px solid #d8c2f2;padding:6px 10px;border-radius:6px}
      .summary{margin:0;font-size:13px;line-height:1.6}
      .p-claims p{margin:3px 0;font-size:12px}.p-claims b{font-size:10px;padding:1px 5px;border:1px solid var(--ink);border-radius:3px;background:#c9fbd9}.p-claims em,.ev{font-style:normal;font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;margin:0}
      .slides{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .slide{display:grid;gap:6px;align-content:start;padding:10px;border:1.5px solid var(--ink);border-radius:8px;background:#fff;box-shadow:3px 3px 0 var(--ink);min-width:0}
      .slide-head{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap}.slide-head b{font-family:var(--font-display);font-size:16px;color:#1f2fe0}.slide-head span{font-size:10px;font-weight:800;padding:1px 6px;border:1px solid var(--ink);border-radius:999px;background:#eef1ff}.slide-head em{font-style:normal;font-size:10px;color:var(--muted)}
      .slide-head .slide-actions{display:flex;margin-left:auto;padding:0;border:0;background:transparent;border-radius:0}.slide-actions .mini{padding:2px 4px}.slide-actions .mini:disabled{opacity:.35;cursor:not-allowed}
      .vd{margin:0;font-size:11px;color:#2e3140;line-height:1.5}.vd b{font-size:10px;color:var(--muted);margin-right:4px}
      .slot{display:grid;gap:6px;padding-top:6px;border-top:1px dashed var(--line)}
      .empty-slot{margin:0;font-size:11px;color:var(--muted)}
      .image-state{margin:0;font-size:10px;color:var(--muted)}.image-state.generating{color:#1f2fe0}.image-state.error{color:#a3122e}.image-state.ready{color:#237a27}
      .slot-actions{display:flex;gap:4px;flex-wrap:wrap}
      .mini{display:inline-flex;gap:3px;align-items:center;font-size:10px;padding:2px 6px;border:1px solid var(--ink);border-radius:3px;background:#fff;cursor:pointer}
      .design-source{display:grid;gap:4px;font-size:11px;border:1px solid var(--border);background:#fff;padding:6px 8px}.design-source .src-options{display:flex;gap:6px 14px;flex-wrap:wrap}.design-source label.src-option{display:inline-flex;gap:5px;align-items:center;font-weight:700;white-space:nowrap;color:var(--ink)}.design-source label.src-option input{width:auto;height:auto;padding:0;margin:0;border:0;flex:none}.stack-toggle{display:flex;gap:5px;align-items:flex-start;font-size:10px;font-weight:700;margin-top:4px}.stack-toggle input{width:auto;padding:0;margin:2px 0 0;flex:none}
      .extra-strip{list-style:none;margin:6px 0 0;padding:0;display:flex;gap:6px;flex-wrap:wrap}.extra-strip li{display:grid;gap:2px;width:84px;font-size:10px}.extra-strip .extra-thumb{display:block;max-height:84px;overflow:hidden}.extra-strip b{font-size:9px;letter-spacing:.04em}
      .extra-images{margin-top:6px;font-size:11px}.extra-images summary{cursor:pointer}.extra-images .extra{display:grid;gap:2px}.extra-images .extra label{font-size:10px;display:flex;gap:3px;align-items:center}.extra-images button[aria-pressed=true]{outline:2px solid var(--accent,#1F2FE0)}
      .picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.picker button{border:1px solid var(--border);background:#fff;padding:3px;border-radius:4px;cursor:pointer;min-width:0}
      .copy p{margin:0;font-size:12px;line-height:1.6}.copy ul{margin:0;padding-left:16px;font-size:12px}.tags{color:#1f2fe0}
      .actions{display:flex;flex-wrap:wrap;gap:6px}
      .toast-line{margin:0;font-size:12px;color:#237a27}
      .modes{display:grid;gap:4px}
      .modes button,.angle-list button{display:grid;gap:2px;text-align:left;font:inherit;padding:6px 8px;border:1.5px solid var(--border);border-radius:5px;background:#fff;cursor:pointer;min-width:0}
      .modes button b{font-size:11px;letter-spacing:.04em}.modes button span{font-size:10px;color:var(--muted);line-height:1.4}
      .angle-list .focus{font-size:10px;font-weight:800;color:var(--blue)}
      .modes button[aria-checked=true],.angle-list button[aria-checked=true]{border-color:var(--ink);background:#f6ff3a;box-shadow:2px 2px 0 var(--ink)}
      .angles-box{display:grid;gap:6px;padding:8px;border:1px dashed var(--border);border-radius:6px}
      .angle-list{list-style:none;margin:0;padding:0;display:grid;gap:5px}
      .angle-list b{font-size:12px;line-height:1.4}.angle-list span{font-size:11px;line-height:1.5;color:#2e3140}.angle-list .hook{color:#1f2fe0}.angle-list em{font-style:normal;font-size:10px;color:var(--muted)}
      .angle-edit{display:grid;gap:5px;padding-top:6px;border-top:1px dashed var(--line)}
      .pub-label{margin:0;font-size:11px;color:var(--muted)}.pub-label b{color:#14161f;letter-spacing:.06em;margin-right:4px}
      .review{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border:1px solid #c2185b;border-radius:999px;background:#ffe3e8;color:#8a1040;cursor:help}
      .caption-text{white-space:pre-wrap}
      .design-box{border:1.5px solid var(--ink);border-radius:8px;padding:8px 10px;background:#fff;min-width:0}
      .design-box summary{cursor:pointer;font-size:12px;font-weight:800}
      .design-notes{margin:4px 0 0;padding-left:16px;font-size:11px;color:#8a5a08}
      .check{display:flex;gap:6px;align-items:flex-start;font-weight:400;font-size:11px}.check input{width:auto;margin-top:2px}
      .quality li.bad{color:#8a1040}.quality li.ok{color:#237a27}.quality li.hint{color:#8a5a08}.quality small+ul{margin-bottom:6px}
      .revised{font-style:normal;font-size:10px;font-weight:800;padding:1px 6px;border:1px solid #1f2fe0;border-radius:999px;background:#eef1ff;color:#1f2fe0;cursor:help}
      .review-box .scores{font-weight:700}
      .user-rating .rating-grid{display:grid;gap:4px;margin:4px 0}.user-rating label{display:flex;justify-content:space-between;gap:6px;align-items:center;font-size:11px;font-weight:600;color:var(--ink)}.user-rating label em{font-style:normal;color:var(--muted);font-size:10px}.user-rating select{width:auto}.user-rating .rating-note{display:grid;justify-content:stretch}
      .angle-list .brief{font-size:10px;color:var(--muted)}
      .copy ol{margin:0;padding-left:18px;font-size:12px;line-height:1.6}
      .editor-notes{border:1.5px dashed var(--ink);border-radius:8px;padding:8px 10px;background:#fbfbf4;display:grid;gap:8px}
      .editor-notes summary{cursor:pointer;font-size:12px;font-weight:800;display:flex;gap:6px;align-items:center}
      .editor-notes[open]{gap:8px}.editor-notes[open] summary{margin-bottom:6px}
      .handoff{display:grid;gap:6px;padding:10px 12px;border:1.5px solid var(--ink);border-radius:8px;background:#f0fff4;font-size:12px;line-height:1.6;min-width:0}
      .handoff.error{background:#fff3f1;border-color:#c0392b}
      .handoff p{margin:0}.handoff ol{margin:0;padding-left:18px}
      .handoff .h-title{display:flex;gap:6px;align-items:center;font-weight:800;font-size:13px}
      .handoff b{font-family:ui-monospace,monospace}
      @media(max-width:1000px){.prod{grid-template-columns:1fr}.slides{grid-template-columns:1fr}}
    `}</style>
  </div>;
}

/** V3(E4) 사용자 평가. AI 편집 리뷰 점수와 따로 저장·표시한다(출처: user). 게시 후 성과(저장·공유 수)와도 섞지 않는다. */
function UserRatingPanel({ rating, planTitle, onSave }: { rating?: UserRating; planTitle: string; onSave: (rating: UserRating) => void }) {
  const [draft, setDraft] = useState<{ scores: UserRating["scores"]; note: string }>(() => ({ scores: rating?.scores ?? {}, note: rating?.note ?? "" }));
  const stale = rating && rating.planTitle !== planTitle;
  return <div className="copy user-rating" data-testid="user-rating"><small>내 평가 · 사용자 평가(AI 점수와 별개, 1~5){rating ? ` · 저장 ${new Date(rating.ratedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}{stale ? " · 이전 기획에 대한 평가" : ""}</small>
    <div className="rating-grid">{userRatingItems.map((item) => <label key={item.id}><span>{item.label} <em>{item.rubric}</em></span><select value={draft.scores[item.id] ?? ""} onChange={(event) => setDraft((current) => ({ ...current, scores: { ...current.scores, [item.id]: event.target.value ? Number(event.target.value) : undefined } }))} data-testid={`user-rating-${item.id}`}><option value="">—</option>{[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}</div>
    <label className="rating-note">한 줄 메모<input value={draft.note} maxLength={300} onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))} placeholder="예: 3번 장이 2번을 반복함" data-testid="user-rating-note"/></label>
    <button type="button" className="mini" onClick={() => onSave({ source: "user", scores: draft.scores, note: draft.note.trim(), ratedAt: new Date().toISOString(), planTitle })} disabled={!Object.values(draft.scores).some(Boolean)} data-testid="user-rating-save">평가 저장</button>
  </div>;
}
