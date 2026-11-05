"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Clipboard, LoaderCircle, RotateCcw, Save, Shapes, Sparkles } from "lucide-react";
import { readCultureLedger } from "@/lib/culture-pipeline-client";
import type { PersistenceResult } from "@/lib/cloud-storage";
import {
  creativityLevels, evidenceModeLabels, ideaTypeLabels, ideaTypes, isCreativePayload,
  type ConceptVisual, type CreativeIdea, type CreativeRun, type CreativeSignal, type IdeaType,
} from "@/lib/creative-collision";
import { saveCreativeEverywhere } from "@/lib/creative-cloud";
import { rightsNote, type ImageAssetRef } from "@/lib/image-assets";
import { AssetImage, ImageGenerator } from "./image-generator";
import { getCollisions, getCreativeRuns, getSavedItems, saveCreativeRun } from "@/lib/storage";
import { buildCreativeInputs, requestCreativeRun, type SelectedConnectionInput } from "@/lib/creative-request";
import { useStored } from "@/lib/use-stored";
import { keywordFromLiveId, trendPath } from "@/lib/live-trend";
import type { LiveAnalysisSnapshot } from "@/lib/types";
import { CloudSaveStatus } from "./cloud-save-status";
import { DataBadge, formatDateTime } from "./ui";

const LEVEL_NOTE: Record<CreativeRun["result"]["ideas"][number]["creativity_level"], string> = { SAFE: "바로 실행 가능", BOLD: "실험적·확장형", WILD: "가장 대담한 상상" };
const BASIS_LABEL: Record<CreativeSignal["basis"], string> = { evidence: "EVIDENCE", dna: "DNA", visual_dna: "VISUAL DNA", culture_map: "CULTURE MAP", collision: "COLLISION", inference: "INSIGHT" };

/** 저장된 실행 기록(이 브라우저) + Workspace에 저장된 항목(다른 브라우저에서 계정으로 복원된 것)을 합친다. 같은 실행은 더 최신 쪽. */
export function mergeCreativeRuns(local: CreativeRun[], savedPayloadRuns: CreativeRun[]) {
  const byId = new Map<string, CreativeRun>();
  // 같은 시각이면 이 브라우저 사본을 쓴다(축소 이미지가 들어 있다).
  for (const run of [...local, ...savedPayloadRuns]) { const prev = byId.get(run.id); if (!prev || Date.parse(run.updatedAt) > Date.parse(prev.updatedAt)) byId.set(run.id, run); }
  return [...byId.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** 링크로 받은 트렌드 두 개를 저장 분석에서 찾는다. 사용자가 고른 값이 있으면 그것을 쓴다. 찾지 못한 요청 트렌드는 missingWanted로 돌려준다. */
function resolvePair(readyIds: string[], initialTrendIds: string[], pickA: string | null, pickB: string | null) {
  const wanted = initialTrendIds.slice(0, 2);
  const has = (id: string | undefined) => Boolean(id) && readyIds.includes(id!);
  const aKey = pickA ?? (has(wanted[0]) ? wanted[0] : readyIds.find((id) => !wanted.includes(id)) ?? readyIds[0] ?? "");
  const bKey = pickB ?? (has(wanted[1]) && wanted[1] !== aKey ? wanted[1] : readyIds.find((id) => id !== aKey && !wanted.includes(id)) ?? readyIds.find((id) => id !== aKey) ?? "");
  return { aKey, bKey, missingWanted: pickA === null && pickB === null ? wanted.filter((id) => !has(id)) : [] };
}

export function CreativeCollision({ snapshots, loading = false, initialTrendIds = [], selectedConnection = null }: { snapshots: LiveAnalysisSnapshot[]; loading?: boolean; initialTrendIds?: string[]; selectedConnection?: SelectedConnectionInput | null }) {
  const ready = useMemo(() => snapshots.filter((item) => item.whyReport || item.dna), [snapshots]);
  const localRuns = useStored(getCreativeRuns);
  const savedItems = useStored(getSavedItems);
  const collisions = useStored(getCollisions);
  const ledgerState = useStored(readCultureLedger);
  const runs = useMemo(() => mergeCreativeRuns(localRuns ?? [], (savedItems ?? []).flatMap((item) => isCreativePayload(item.payload) ? [item.payload.run] : [])), [localRuns, savedItems]);
  // V4 3차: 링크로 받은 트렌드(Trend Web·Culture Map)는 저장 분석을 읽은 뒤에 고른다. 이전에는 첫 렌더(분석을 읽기 전)에만 찾아서
  // 페이지를 바로 열면 요청한 트렌드 대신 첫 번째 저장 트렌드가 선택됐다. 찾지 못한 트렌드는 알리고, 사용자가 고르기 전에는 생성하지 않는다.
  const [pickA, setPickA] = useState<string | null>(null);
  const [pickB, setPickB] = useState<string | null>(null);
  const { aKey, bKey, missingWanted } = useMemo(() => resolvePair(ready.map((item) => item.trendId), initialTrendIds, pickA, pickB), [ready, initialTrendIds, pickA, pickB]);
  const [runId, setRunId] = useState<string | null>(null);
  const run = runs.find((item) => item.id === runId) ?? (missingWanted.length ? undefined : runs.find((item) => item.trendKeys[0] === aKey && item.trendKeys[1] === bKey)) ?? null;
  const [ideaId, setIdeaId] = useState<string | null>(null);
  const idea = run?.result.ideas.find((item) => item.id === (ideaId ?? run.selectedIdeaId)) ?? run?.result.ideas[0] ?? null;
  const [state, setState] = useState<"idle" | "loading" | "sending" | "error">("idle");
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<IdeaType>("goods");
  const [save, setSave] = useState<PersistenceResult | null>(null);
  const [toast, setToast] = useState("");
  const router = useRouter();

  const inputs = useMemo(() => buildCreativeInputs(snapshots, aKey, bKey, ledgerState, collisions ?? [], selectedConnection), [aKey, bKey, snapshots, ledgerState, collisions, selectedConnection]);

  const persist = (next: CreativeRun) => { saveCreativeRun(next); setRunId(next.id); };

  const generate = async (options: { force?: boolean; focusType?: IdeaType } = {}) => {
    if (!inputs) return;
    if (!window.confirm(`${inputs.a.name} × ${inputs.b.name} Creative Collision을 생성할까요?\nOpenAI 1회(비용 가중치 2)가 실행됩니다.${options.focusType ? `\n유형: ${ideaTypeLabels[options.focusType]} (SAFE·BOLD·WILD 3개)` : "\nSAFE·BOLD·WILD 9개, 9개 유형"}`)) return;
    setState("loading"); setError(""); setSave(null); setToast("");
    try {
      persist(await requestCreativeRun(inputs, options)); setIdeaId(null); setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Creative Collision 생성에 실패했습니다."); setState("error"); }
  };

  const select = (item: CreativeIdea) => { setIdeaId(item.id); if (run) saveCreativeRun({ ...run, selectedIdeaId: item.id, updatedAt: new Date().toISOString() }); };
  const visual = run && idea ? run.visuals.find((item) => item.ideaId === idea.id) : undefined;

  const addVisual = (asset: ImageAssetRef) => {
    if (!run || !idea) return;
    const item: ConceptVisual = { ideaId: idea.id, kind: "AI CONCEPT VISUAL", dataUrl: asset.dataUrl, width: asset.width ?? 0, height: asset.height ?? 0, model: asset.model ?? "", prompt: asset.prompt ?? idea.image_prompt, createdAt: asset.createdAt, inspired: Boolean(idea.ip_caution) };
    persist({ ...run, selectedIdeaId: idea.id, visuals: [item, ...run.visuals.filter((v) => v.ideaId !== idea.id)], updatedAt: new Date().toISOString() });
  };

  const toWorkspace = async () => {
    if (!run) return;
    const next = { ...run, selectedIdeaId: idea?.id ?? run.selectedIdeaId, updatedAt: new Date().toISOString() };
    persist(next);
    setSave(await saveCreativeEverywhere(next));
  };
  const toStudio = async () => {
    if (!run || !idea) return;
    const next = { ...run, selectedIdeaId: idea.id, updatedAt: new Date().toISOString() };
    persist(next);
    setState("sending");
    const result = await saveCreativeEverywhere(next);
    setSave(result);
    router.push(`/studio?creative=${encodeURIComponent(next.id)}&idea=${encodeURIComponent(idea.id)}`);
  };
  const copy = async (text: string, label: string) => { try { await navigator.clipboard.writeText(text); setToast(`${label}을(를) 복사했습니다.`); } catch { setToast("복사하지 못했습니다."); } };

  if (loading) return <div className="state-box panel"><LoaderCircle className="spin"/><p>저장된 LIVE 분석을 불러오고 있습니다.</p></div>;
  if (ready.length < 2) return <div className="state-box panel" data-testid="creative-not-ready"><DataBadge status="NOT ANALYZED" detail={`준비 ${ready.length}/2`}/><h3>WHY 또는 DNA가 있는 LIVE 트렌드가 2개 이상 필요합니다.</h3><p>Creative Collision은 저장된 분석 결과만 입력으로 씁니다. 데모 데이터를 대신 쓰지 않습니다.</p><Link className="button primary" href="/discover">Analyze trends</Link></div>;

  const signalsShared = run?.result.structure.shared_signals ?? [];
  const signalsContrast = run?.result.structure.contrasting_signals ?? [];
  return <div className="creative" data-testid="creative-collision">
    <aside className="cc-left panel">
      <div className="titlebar"><span>SELECT.EXE — TREND A × B</span></div>
      <label>TREND A<select value={aKey} onChange={(event) => { setPickA(event.target.value); setRunId(null); setIdeaId(null); }} data-testid="creative-a">{ready.map((item) => <option key={item.trendId} value={item.trendId}>{item.trendName}</option>)}</select></label>
      <label>TREND B<select value={bKey} onChange={(event) => { setPickB(event.target.value); setRunId(null); setIdeaId(null); }} data-testid="creative-b">{ready.filter((item) => item.trendId !== aKey).map((item) => <option key={item.trendId} value={item.trendId}>{item.trendName}</option>)}</select></label>
      {missingWanted.length > 0 && <div className="inputs missing-trend" role="alert" data-testid="creative-missing-trend"><small>요청한 트렌드를 찾지 못했어요</small><p>{missingWanted.map((id, index) => <span key={id}>{index > 0 ? " · " : ""}<Link href={trendPath(id, "why")}>{keywordFromLiveId(id)} WHY 분석</Link></span>)} — 이 브라우저(계정)에 WHY·DNA 분석이 없습니다. 다른 트렌드로 자동으로 바꾸지 않았어요. 위에서 직접 고르면 생성할 수 있어요.</p></div>}
      {inputs && <div className="inputs" data-testid="creative-inputs"><small>INPUTS · 저장된 분석 재사용</small><p>{inputs.report.used.map((item) => <span key={item} className="ok">{item}</span>)}</p>{inputs.report.missing.length > 0 && <p className="missing">없음: {inputs.report.missing.join(", ")} — 없는 정보는 만들지 않습니다.</p>}</div>}
      {selectedConnection && <div className="inputs" data-testid="creative-selected-connection"><small>FROM TREND WEB · {selectedConnection.verificationStatus}</small><p><span className="ok">{selectedConnection.direction}</span>{selectedConnection.title}</p><p>{selectedConnection.context}</p></div>}
      <div className="signals" data-testid="creative-shared"><small>SHARED SIGNALS {run ? "· 생성 결과" : "· DNA 라벨 미리보기"}</small>
        {run ? signalsShared.map((item) => <SignalRow key={item.text} item={item}/>) : inputs?.preview.shared.length ? inputs.preview.shared.map((item) => <p key={item.label}><b className="tag dna">DNA</b>{item.label} <em>{item.dimension}</em></p>) : <p className="none">DNA 라벨이 겹치는 속성이 없습니다.</p>}
        {!run && inputs?.relation && <p><b className="tag map">CULTURE MAP</b>{inputs.relation.type}{inputs.relation.score !== null ? ` · 점수 ${Math.round(inputs.relation.score * 100)}` : ""}{inputs.relation.sharedAttributes.length ? ` · ${inputs.relation.sharedAttributes.join(", ")}` : ""}</p>}
      </div>
      <div className="signals" data-testid="creative-contrast"><small>CONTRASTING SIGNALS</small>
        {run ? signalsContrast.map((item) => <SignalRow key={item.text} item={item}/>) : inputs ? <><p><b className="tag dna">A</b>{inputs.preview.onlyA.map((item) => item.label).join(", ") || "—"}</p><p><b className="tag dna">B</b>{inputs.preview.onlyB.map((item) => item.label).join(", ") || "—"}</p></> : null}
      </div>
      <button type="button" className="button primary" onClick={() => void generate()} disabled={!inputs || state === "loading" || missingWanted.length > 0} data-testid="creative-generate">{state === "loading" ? <><LoaderCircle className="spin"/>Generating…</> : <><Sparkles size={14}/>{run ? "새로 생성 (9개)" : "Creative Collision 생성"}</>}</button>
      {runs.length > 0 && <div className="history"><small>SAVED RUNS</small>{runs.slice(0, 8).map((item) => <button type="button" key={item.id} aria-pressed={run?.id === item.id} onClick={() => { setRunId(item.id); setIdeaId(null); setPickA(item.trendKeys[0]); setPickB(item.trendKeys[1]); }}>{item.trendNames.join(" × ")}{item.focusType ? ` · ${ideaTypeLabels[item.focusType]}` : ""}<em>{formatDateTime(item.updatedAt)}</em></button>)}</div>}
    </aside>

    <section className="cc-center panel">
      <div className="titlebar"><span>IDEAS.EXE — SAFE · BOLD · WILD</span></div>
      <div className="cc-body">
      {state === "error" && <div className="state-box panel error-box" role="alert"><AlertTriangle/><p>{error}</p></div>}
      {!run ? <div className="state-box panel"><Shapes/><h3>두 트렌드를 고르고 생성하세요.</h3><p>WHY·DNA·Visual DNA·Culture Map 관계를 입력으로 SAFE·BOLD·WILD 아이디어 9개(9개 유형)를 만듭니다. OpenAI 1회.</p></div> : <>
        <header className="cc-head"><div><small>INSIGHT · CREATIVE HYPOTHESIS</small><h2>{run.trendNames.join(" × ")}</h2></div><DataBadge status="SAVED" detail={`${run.model} · ${formatDateTime(run.analyzedAt)} · 유형 ${run.validation.typeCount}개`}/></header>
        {run.validation.levelCounts && new Set(Object.values(run.validation.levelCounts)).size > 1 && <p className="warn" data-testid="creative-level-balance">레벨 분포 SAFE {run.validation.levelCounts.SAFE} · BOLD {run.validation.levelCounts.BOLD} · WILD {run.validation.levelCounts.WILD} — 모델이 레벨별 3개 지시를 정확히 지키지 않았습니다. 필요하면 다시 생성하세요.</p>}
        {run.validation.genericTitles.length > 0 && <p className="warn">일반적인 표현이 감지된 아이디어: {run.validation.genericTitles.join(", ")} — 다시 생성을 권장합니다.</p>}
        <div className="levels">{creativityLevels.map((level) => <div className={`level ${level.toLowerCase()}`} key={level} data-testid={`creative-level-${level}`}>
          <h3>{level}<em>{LEVEL_NOTE[level]}</em></h3>
          {run.result.ideas.filter((item) => item.creativity_level === level).map((item) => <button type="button" key={item.id} className="idea-card" aria-pressed={idea?.id === item.id} onClick={() => select(item)} data-testid="creative-idea">
            <span className="meta"><b>{ideaTypeLabels[item.idea_type]}</b><i className={`mode ${item.evidence_mode}`}>{evidenceModeLabels[item.evidence_mode]}</i>{item.ip_caution && <i className="ip">INSPIRED</i>}{run.visuals.some((v) => v.ideaId === item.id) && <i className="img">AI VISUAL</i>}</span>
            <strong>{item.title}</strong>
            <span className="line">{item.concept_line}</span>
            <span className="why">{item.why_it_works}</span>
            <span className="hook">“{item.cardnews_hook}”</span>
          </button>)}
        </div>)}</div>
        <p className="limits">LIMITATIONS · {run.result.limitations.join(" · ")} · SERVER VALIDATION 인용 제거 {run.validation.removedRefs.length} · 근거 구분 하향 {run.validation.downgradedModes}</p>
      </>}
      </div>
    </section>

    <aside className="cc-right panel" data-testid="creative-detail">
      <div className="titlebar"><span>IDEA.EXE — DETAIL</span></div>
      {!idea || !run ? <p className="none">아이디어를 선택하면 상세 기획과 visual brief가 표시됩니다.</p> : <>
        <small className="kicker">{idea.creativity_level} · {ideaTypeLabels[idea.idea_type]} · {evidenceModeLabels[idea.evidence_mode]}</small>
        <h3>{idea.title}</h3>
        <p className="concept">{idea.concept_line}</p>
        {idea.ip_caution && <p className="ip-note" data-testid="creative-ip">INSPIRED CONCEPT · {idea.ip_caution} 공식 원작 디자인을 복제하지 않는 방향으로만 사용하세요.</p>}
        <dl>
          <dt>왜 성립하나</dt><dd>{idea.why_it_works}</dd>
          <dt>참여 포인트</dt><dd>{idea.audience_appeal}</dd>
          <dt>실행 힌트</dt><dd>{idea.execution_hint}</dd>
          <dt>확장 콘텐츠</dt><dd><ul>{idea.content_expansion.map((item) => <li key={item}>{item}</li>)}</ul></dd>
          <dt>카드뉴스 후킹</dt><dd>“{idea.cardnews_hook}”</dd>
          <dt>CTA</dt><dd>{idea.CTA}</dd>
          {idea.evidence_refs.length > 0 && <><dt>EVIDENCE</dt><dd className="refs">{idea.evidence_refs.join(", ")}</dd></>}
        </dl>
        <div className="block"><small>VISUAL DIRECTION</small><p><b>무드</b> {idea.visual_direction.mood}</p><p><b>팔레트</b> {idea.visual_direction.palette.join(" · ")}</p><p><b>질감</b> {idea.visual_direction.texture}</p><p><b>구도</b> {idea.visual_direction.composition}</p><p><b>오브젝트</b> {idea.visual_direction.key_objects.join(", ")}</p><p><b>키워드</b> {idea.visual_direction.styling_keywords.join(", ")}</p></div>
        <div className="block" data-testid="creative-brief"><small>VISUAL BRIEF</small>{Object.entries({ "핵심 피사체": idea.visual_brief.core_subject, 배경: idea.visual_brief.background, 조명: idea.visual_brief.lighting, 샷: idea.visual_brief.shot_type, 컬러: idea.visual_brief.color_direction, 스타일링: idea.visual_brief.styling_direction, 활용처: idea.visual_brief.platform_use_case }).map(([key, value]) => <p key={key}><b>{key}</b> {value}</p>)}</div>
        <div className="block" data-testid="creative-prompt"><small>IMAGE PROMPT <button type="button" className="mini" onClick={() => void copy(idea.image_prompt, "이미지 프롬프트")}><Clipboard size={11}/>복사</button></small><p className="prompt">{idea.image_prompt}</p></div>
        <div className="visual" data-testid="creative-visual"><small>AI CONCEPT VISUAL · 실제 증거 이미지가 아님</small>
          {visual ? <AssetImage asset={{ id: visual.ideaId, status: "AI CONCEPT VISUAL", dataUrl: visual.dataUrl, storagePath: visual.storagePath, title: `${idea.title} · ${formatDateTime(visual.createdAt)}`, model: visual.model, createdAt: visual.createdAt, rights: rightsNote["AI CONCEPT VISUAL"], inspired: visual.inspired }}/> : <p className="none">아직 생성하지 않았습니다. 이미지 프롬프트와 visual brief는 저장되어 나중에 생성할 수 있습니다.</p>}
          <ImageGenerator key={idea.id} initialPrompt={idea.image_prompt} purposes={["concept"]} aspects={["1:1", "4:5", "16:9"]} title={idea.title} inspired={Boolean(idea.ip_caution)} onGenerated={addVisual} testId="creative-image"/>
        </div>
        <div className="actions">
          <button type="button" className="button primary" onClick={() => void toStudio()} disabled={state === "sending"} data-testid="creative-to-studio">{state === "sending" ? <><LoaderCircle className="spin"/>저장 후 이동…</> : <>Content Studio에서 제작하기 <ArrowRight size={14}/></>}</button>
          <button type="button" className="button" onClick={() => void toWorkspace()} data-testid="creative-save"><Save size={14}/>Workspace에 저장</button>
          <button type="button" className="button" onClick={() => void generate({ force: true, focusType: run.focusType })} disabled={state === "loading"}><RotateCcw size={14}/>다시 생성</button>
          <span className="focus"><select aria-label="다른 유형" value={focus} onChange={(event) => setFocus(event.target.value as IdeaType)}>{ideaTypes.map((type) => <option key={type} value={type}>{ideaTypeLabels[type]}</option>)}</select><button type="button" className="button" onClick={() => void generate({ focusType: focus })} disabled={state === "loading"} data-testid="creative-focus">다른 유형으로 생성</button></span>
        </div>
        {save && <CloudSaveStatus result={save}/>}
        {toast && <p className="toast-line" role="status">{toast}</p>}
      </>}
    </aside>
    <style jsx>{`
      .creative{display:grid;grid-template-columns:270px minmax(0,1fr) 360px;gap:14px;align-items:start}
      .creative>*{min-width:0}.cc-left,.cc-right{overflow-wrap:anywhere}.cc-left label,.cc-left select,.focus select{min-width:0;max-width:100%;width:100%}.focus{width:100%}.focus .button{flex:0 0 auto}
      .cc-left,.cc-right{padding:0 0 14px;display:grid;gap:10px;position:sticky;top:12px;max-height:calc(100vh - 24px);overflow:auto}
      .cc-left>:not(.titlebar),.cc-right>:not(.titlebar){margin:0 14px}
      .cc-left label{display:grid;gap:4px;font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--blue)}
      .cc-left select,.focus select{padding:7px;border:1.5px solid var(--ink);border-radius:4px;background:#fff;font-size:13px}
      small{display:block;font-family:var(--font-display);font-size:11px;letter-spacing:.06em;color:var(--blue);margin-bottom:4px}
      .inputs p{display:flex;flex-wrap:wrap;gap:4px;margin:0;font-size:11px}.inputs .ok{padding:1px 6px;border:1px solid #66a45e;background:#f2fff0;border-radius:999px}.inputs .missing{display:block;color:#9b6500;margin-top:6px}
      .signals p{margin:4px 0;font-size:12px;line-height:1.5}.signals em{font-style:normal;color:var(--muted);font-size:11px}
      .tag{display:inline-block;font-size:10px;padding:1px 5px;margin-right:5px;border:1px solid var(--ink);border-radius:3px;background:#fff}.tag.dna{background:#eef1ff}.tag.map{background:#fff6ea}
      .none{font-size:12px;color:var(--muted)}
      .history{display:grid;gap:4px}.history button{display:flex;justify-content:space-between;gap:6px;text-align:left;font-size:11px;padding:6px 8px;border:1px solid var(--border);background:#fff;border-radius:4px;cursor:pointer}.history button[aria-pressed=true]{border-color:var(--ink);background:#f6ff3a}.history em{font-style:normal;color:var(--muted)}
      .cc-head{display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:10px}.cc-head>div{min-width:0}.cc-head :global(.data-badge){max-width:100%;white-space:normal;flex-wrap:wrap}.cc-head :global(.data-badge small){white-space:normal}.level,.idea-card{min-width:0;overflow-wrap:anywhere}.cc-head h2{margin:2px 0 0;font-size:22px}
      .warn{font-size:12px;color:#9b6500;margin:0 0 8px}
      .levels{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .level{display:grid;gap:8px;align-content:start}.cc-center{padding:0 0 14px}.cc-body{padding:14px}.level h3{margin:0;font-family:var(--font-display);font-size:16px;display:flex;flex-wrap:wrap;gap:2px 8px;align-items:baseline;white-space:nowrap}.level h3 em{font-style:normal;font-family:var(--font-body,inherit);font-size:11px;color:var(--muted);white-space:normal}
      .level.safe h3{color:#237a27}.level.bold h3{color:#1f2fe0}.level.wild h3{color:#c2185b}
      .idea-card{display:grid;gap:5px;text-align:left;padding:12px;border:1.5px solid var(--ink);border-radius:8px;background:#fff;box-shadow:3px 3px 0 var(--ink);cursor:pointer;font:inherit}
      .idea-card[aria-pressed=true]{background:#f6ff3a}
      .idea-card .meta{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:10px}.idea-card .meta b{font-size:11px;color:var(--blue)}
      .mode,.ip,.img{font-style:normal;padding:1px 6px;border-radius:999px;border:1px solid var(--ink)}.mode.evidence_based{background:#c9fbd9}.mode.hybrid_inference{background:#e9f1ff}.mode.speculative_concept{background:#f3e8ff}.ip{background:#ffe3e8}.img{background:#14161f;color:#fff}
      .idea-card strong{font-size:15px;line-height:1.35}.idea-card .line{font-size:12px;line-height:1.55}.idea-card .why{font-size:11px;color:var(--muted);line-height:1.5;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.idea-card .hook{font-size:12px;font-weight:700;color:#c2185b}
      .limits{font-size:11px;color:var(--muted);margin-top:12px;line-height:1.6}
      .cc-right h3{margin:0;font-size:19px}.kicker{color:#c2185b}.concept{margin:0;font-size:13px;line-height:1.6}
      .ip-note{margin:0;font-size:11px;padding:6px 8px;background:#ffe3e8;border:1px solid #c2185b;border-radius:4px}
      dl{display:grid;gap:4px;margin:0;font-size:12px}dt{font-weight:800;font-size:11px;color:var(--blue)}dd{margin:0 0 4px;line-height:1.55}dd ul{margin:0;padding-left:16px}.refs{font-family:ui-monospace,monospace;font-size:11px}
      .block{border:1px dashed var(--border);padding:8px;border-radius:6px}.block p{margin:3px 0;font-size:12px;line-height:1.5}.block b{font-size:11px;color:var(--muted);margin-right:4px}
      .prompt{font-family:ui-monospace,monospace;font-size:11px!important;color:#2e3140}
      .mini{display:inline-flex;gap:3px;align-items:center;margin-left:6px;font-size:10px;padding:1px 6px;border:1px solid var(--ink);border-radius:3px;background:#fff;cursor:pointer}
      .visual figure{margin:0;display:grid;gap:4px}.visual img{width:100%;border:1.5px solid var(--ink);border-radius:6px;display:block}.visual figcaption{font-size:10px;color:var(--muted)}.visual small{color:#c2185b}
      .actions{display:flex;flex-wrap:wrap;gap:6px}.actions .button{font-size:12px}.focus{display:flex;gap:4px;flex-wrap:wrap}
      .toast-line{font-size:12px;color:#237a27;margin:0}
      @media(max-width:1200px){.creative{grid-template-columns:250px minmax(0,1fr)}.cc-right{grid-column:1/-1;position:static;max-height:none}}
      @media(max-width:800px){.creative{grid-template-columns:1fr}.cc-left{position:static;max-height:none}.levels{grid-template-columns:1fr}}
    `}</style>
  </div>;
}

function SignalRow({ item }: { item: CreativeSignal }) {
  return <p><b className={`tag ${item.basis === "evidence" ? "map" : "dna"}`}>{BASIS_LABEL[item.basis]}</b>{item.text}{item.refs.length ? <em> · {item.refs.join(", ")}</em> : null}</p>;
}
