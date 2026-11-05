"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookMarked, CloudDownload, CloudUpload, FileText, Lightbulb, LoaderCircle, Trash2 } from "lucide-react";
import { useAccountSync } from "@/lib/account-sync";
import { deleteSavedItem, isInsightPayload, isPlanPayload, latestByClientId, loadCloudSavedItems, pullSavedItems, pushAllSavedItems, restoreHiddenSavedItems, type CloudSavedItem } from "@/lib/saved-items-cloud";
import { signedInClient } from "@/lib/cloud-storage";
import { isCreativePayload } from "@/lib/creative-collision";
import { isStudioProjectPayload, productionFormatLabels } from "@/lib/content-production";
import { isPhenomenonPayload, phenomenonQuery, phenomenonTrendId } from "@/lib/discovery";
import { getSavedItems, getSavedTombstones } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { trendPath } from "@/lib/live-trend";
import { isTrendWebPayload } from "@/lib/trend-web";
import type { SavedItem } from "@/lib/types";
import { DataBadge, SectionHeading } from "./ui";

type Busy = "pull" | "push" | "delete" | "load" | null;

/** Workspace Insights & Plans: 로컬(이 브라우저)과 클라우드(계정)를 구분해 보여 주고 동기화·삭제한다. */
export function SavedItemsSection({ index }: { index: string }) {
  const items = useStored(getSavedItems) ?? [];
  const tombstones = useStored(getSavedTombstones) ?? [];
  const sync = useAccountSync();
  const signedIn = Boolean(sync.userId);
  const [filter, setFilter] = useState<"all" | "creative" | SavedItem["type"]>("all");
  const [cloud, setCloud] = useState<Map<string, CloudSavedItem> | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const loadCloud = useCallback(async () => {
    const session = await signedInClient();
    if (!session) { setCloud(null); return; }
    setBusy("load");
    const result = await loadCloudSavedItems(session.supabase, session.user.id);
    setBusy(null);
    if (result.ok) setCloud(latestByClientId(result.items));
    else setMessage({ ok: false, text: `클라우드 항목을 읽지 못했습니다: ${result.error}` });
  }, []);
  // 계정이 바뀌거나 계정 동기화가 끝나면 클라우드 목록을 다시 읽는다(다른 계정 목록이 남지 않게).
  useEffect(() => { const frame = requestAnimationFrame(() => { if (sync.userId && sync.phase === "ready") void loadCloud(); else if (!sync.userId) setCloud(null); }); return () => cancelAnimationFrame(frame); }, [sync.userId, sync.phase, loadCloud]);

  const cloudLive = cloud ? [...cloud.values()].filter((entry) => !entry.deletedAt) : [];
  const hiddenHere = tombstones.filter((item) => item.scope === "local").length;
  const stateOf = (item: SavedItem) => {
    const entry = cloud?.get(item.id);
    if (!signedIn || !cloud) return { label: "LOCAL", cls: "local" };
    if (!entry || entry.deletedAt) return { label: "LOCAL · 클라우드 없음", cls: "local" };
    const mine = new Date(item.updatedAt ?? item.createdAt).getTime(), theirs = new Date(entry.updatedAt).getTime();
    return mine > theirs ? { label: "LOCAL이 더 최신", cls: "ahead" } : { label: "LOCAL + CLOUD", cls: "synced" };
  };

  const pull = async () => { setBusy("pull"); setMessage(null); const report = await pullSavedItems(); setMessage({ ok: report.ok, text: report.message }); setBusy(null); await loadCloud(); };
  const push = async () => {
    if (!window.confirm("이 브라우저의 인사이트·기획안을 계정에 저장할까요?\n· 같은 항목은 중복으로 만들지 않고 갱신합니다.\n· 클라우드가 더 최신인 항목은 덮어쓰지 않습니다.")) return;
    setBusy("push"); setMessage(null); const report = await pushAllSavedItems(); setMessage({ ok: report.ok, text: report.message }); setBusy(null); await loadCloud();
  };
  const remove = async (item: SavedItem, scope: "local" | "all") => {
    setBusy("delete"); const result = await deleteSavedItem(item, scope); setMessage({ ok: result.ok, text: result.message }); setBusy(null); setConfirming(null); if (scope === "all") await loadCloud();
  };

  const isCreative = (item: SavedItem) => isCreativePayload(item.payload);
  const visible = filter === "all" ? items : filter === "creative" ? items.filter(isCreative) : items.filter((item) => item.type === filter && !isCreative(item));
  return <section className="ws-section saved-section" data-testid="saved-items">
    <SectionHeading index={index} title="Insights & plans"/>
    <div className="sync panel" data-testid="saved-sync">
      <div className="counts"><span className="pill local">LOCAL <b data-testid="saved-local-count">{items.length}</b></span><span className="pill cloud">CLOUD <b data-testid="saved-cloud-count">{signedIn && cloud ? cloudLive.length : "—"}</b></span><small>{signedIn ? `${sync.email ?? "로그인됨"} 계정` : "로그인하지 않음 · 이 브라우저에만 저장"}</small></div>
      {signedIn ? <div className="actions">
        <button type="button" className="button" onClick={pull} disabled={busy !== null} data-testid="saved-pull">{busy === "pull" ? <LoaderCircle className="spin" size={14}/> : <CloudDownload size={14}/>}클라우드에서 불러오기</button>
        <button type="button" className="button primary" onClick={push} disabled={busy !== null || !items.length} data-testid="saved-push">{busy === "push" ? <LoaderCircle className="spin" size={14}/> : <CloudUpload size={14}/>}브라우저 → 클라우드 저장</button>
        {hiddenHere > 0 && <button type="button" className="button" onClick={() => { restoreHiddenSavedItems(); void pull(); }}>이 브라우저에서 숨긴 {hiddenHere}개 다시 받기</button>}
      </div> : <Link className="button" href="/auth">로그인하고 계정에 저장</Link>}
      {busy && busy !== "load" && <p className="progress" role="status">{busy === "pull" ? "클라우드에서 불러오는 중…" : busy === "push" ? "클라우드에 저장하는 중…" : "삭제하는 중…"}</p>}
      {message && <p className={`msg ${message.ok ? "ok" : "fail"}`} role="status" data-testid="saved-sync-message">{message.text}</p>}
    </div>
    <div className="tabs">{(["all", "insight", "plan", "creative"] as const).map((type) => <button key={type} type="button" aria-pressed={filter === type} onClick={() => setFilter(type)}>{type === "all" ? "ALL" : type === "insight" ? "INSIGHTS" : type === "plan" ? "CONTENT PLANS" : "CREATIVE"} <span>{type === "all" ? items.length : type === "creative" ? items.filter(isCreative).length : items.filter((item) => item.type === type && !isCreative(item)).length}</span></button>)}</div>
    {visible.length ? <div className="grid">{visible.map((item) => {
      const state = stateOf(item);
      const creative = isCreativePayload(item.payload) ? item.payload : null;
      const creativeIdea = creative ? creative.run.result.ideas.find((idea) => idea.id === creative.selectedIdeaId) ?? creative.run.result.ideas[0] : null;
      const project = isStudioProjectPayload(item.payload) ? item.payload.project : null;
      const phen = isPhenomenonPayload(item.payload) ? item.payload : null;
      const trendWeb = isTrendWebPayload(item.payload) ? item.payload : null;
      const open = trendWeb ? `/trend-web?trendWeb=${encodeURIComponent(trendWeb.session.id)}` : phen ? `${trendPath(phenomenonTrendId(phen.context), "why")}?${phenomenonQuery(phen.context)}` : project ? `/studio?project=${encodeURIComponent(project.id)}` : isPlanPayload(item.payload) ? `/studio?plan=${encodeURIComponent(item.id)}` : isInsightPayload(item.payload) ? trendPath(item.payload.trendId, "why") : creative ? `/studio?creative=${encodeURIComponent(creative.run.id)}${creativeIdea ? `&idea=${encodeURIComponent(creativeIdea.id)}` : ""}` : null;
      return <article className="panel card" key={item.id} data-testid="saved-item">
        <div className="row">{item.type === "insight" ? <Lightbulb size={16}/> : <FileText size={16}/>}<small>{phen ? `PHENOMENON · ${phen.context.verificationStatus}` : creative ? "CREATIVE COLLISION" : project ? `STUDIO PROJECT · ${productionFormatLabels[project.settings.format]}` : item.type.toUpperCase()}</small><DataBadge status={item.mode === "live" ? "SAVED" : "DEMO"}/><span className={`where ${state.cls}`} data-testid="saved-item-state">{state.label}</span></div>
        <h2>{item.title}</h2><p>{item.subtitle}</p>
        {isInsightPayload(item.payload) && <p className="summary">{item.payload.summary}</p>}
        {project && <p className="summary" data-testid="saved-project">{project.mode === "creative" ? "Creative Collision 아이디어" : "단일 트렌드"} · {project.plan ? (project.settings.format === "cardnews" ? `${project.plan.slides.length}장` : `장면 ${project.plan.scenes.length}개`) : "기획 전"} · 이미지 {project.assets.filter((asset) => asset.status !== "REAL REFERENCE").length}개</p>}
        {phen && <p className="summary" data-testid="saved-phenomenon">{phen.context.coreBehavior} · 관측 {phen.context.window.from}~{phen.context.window.to} · 근거 {phen.context.evidenceIds.join(", ")}</p>}
        {creativeIdea && <p className="summary" data-testid="saved-creative">{creativeIdea.creativity_level} · {creativeIdea.concept_line}</p>}
        {trendWeb && <p className="summary" data-testid="saved-trend-web">노드 {trendWeb.session.graph.nodes.length}개 · 연결 {trendWeb.session.graph.edges.length}개 · 선택 {trendWeb.session.selectedNodeIds.length}/2</p>}
        {item.payload && !open && <p className="broken">저장된 내용이 불완전해 열 수 없습니다.</p>}
        {open && <Link className="open" href={open}>{trendWeb ? "Open Trend Web" : phen ? "이 현상 WHY 분석" : project ? "Studio에서 이어서 작업" : isPlanPayload(item.payload) ? "Open plan" : creative ? "Content Studio에서 제작" : "WHY 분석 열기"} <ArrowRight size={12}/></Link>}
        <footer><time>{new Date(item.updatedAt ?? item.createdAt).toLocaleString("ko-KR")}</time>
          {confirming === item.id ? <div className="confirm" role="group" aria-label="삭제 범위 선택">
            <button type="button" onClick={() => void remove(item, "local")} disabled={busy !== null}>이 브라우저에서만</button>
            <button type="button" className="danger" onClick={() => void remove(item, "all")} disabled={busy !== null || !signedIn} title={signedIn ? undefined : "로그인해야 클라우드에서 지울 수 있습니다"}>브라우저 + 클라우드</button>
            <button type="button" onClick={() => setConfirming(null)}>취소</button>
          </div> : <button type="button" className="trash" onClick={() => setConfirming(item.id)} aria-label={`${item.title} 삭제`}><Trash2 size={14}/></button>}
        </footer>
      </article>;
    })}</div> : <div className="empty-state panel"><BookMarked/><h3>{items.length ? "이 분류에 저장한 항목이 없습니다." : "아직 저장한 항목이 없습니다."}</h3><p>{signedIn ? "Content Studio에서 기획안을, LIVE WHY에서 인사이트를 저장해 보세요. 다른 브라우저에서 저장했다면 '클라우드에서 불러오기'를 누르세요." : "Content Studio에서 기획안을 만들어 저장해 보세요."}</p><Link href="/studio" className="button">Open Content Studio</Link></div>}
    <style jsx>{`
      .saved-section{margin-top:40px}
      .sync{padding:12px 14px;margin-bottom:14px;display:grid;gap:10px}
      .counts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .counts small{font-size:12px;color:var(--muted)}
      .pill{font-size:12px;font-weight:800;padding:3px 10px;border:1.5px solid var(--ink);border-radius:999px;background:#fff}
      .pill.cloud{background:#e6efff}
      .actions{display:flex;gap:8px;flex-wrap:wrap}
      .progress{margin:0;font-size:12px;color:var(--muted)}
      .msg{margin:0;font-size:12px;padding:8px 10px;border-radius:6px;border:1px solid var(--line);background:var(--raised)}
      .msg.fail{background:#fff1f1;border-color:#e7a3ad;color:#a3122e}
      .tabs{display:flex;flex-wrap:wrap;gap:0 6px;margin-bottom:16px;padding:0 6px;background:#fff;border:1.5px solid var(--ink);border-radius:8px}
      .tabs button{border:0;border-bottom:2px solid transparent;background:transparent;color:#5d6170;padding:11px 8px;font-size:12px;white-space:nowrap;font-weight:700;cursor:pointer}
      .tabs button[aria-pressed=true]{color:var(--blue);border-color:var(--blue)}
      .tabs span{margin-left:6px;color:#9a9fb0}
      .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
      .card{padding:18px;min-height:210px;display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}
      .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .row :global(svg){color:var(--blue)}
      .row small{font-size:11px;color:var(--muted);font-weight:700}
      .where{font-size:11px;font-weight:800;padding:2px 8px;border-radius:999px;border:1.5px solid var(--ink);background:#fff}
      .where.synced{background:#c9fbd9}.where.ahead{background:#fffbd1}.where.local{background:#f2f3f7}
      .card h2{font-size:16px;margin:4px 0 0}
      .card p{font-size:12px;color:var(--muted);margin:0;line-height:1.6}
      .card .broken{color:#a3122e}
      .card .summary{color:var(--text);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .card :global(.open){display:inline-flex;gap:5px;align-items:center;font-size:12px;font-weight:700;color:var(--blue);margin-top:4px}
      footer{margin-top:auto;width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;padding-top:10px}
      footer time{font-size:11px;color:var(--muted)}
      .trash{border:1.5px solid var(--ink);background:#fff;border-radius:6px;width:32px;height:32px;display:grid;place-items:center;cursor:pointer}
      .confirm{display:flex;gap:4px;flex-wrap:wrap}
      .confirm button{font-size:11px;font-weight:700;border:1.5px solid var(--ink);background:#fff;border-radius:6px;padding:5px 8px;cursor:pointer}
      .confirm button.danger{background:#ffe1e1;color:#a3122e}
      .confirm button:disabled{opacity:.5;cursor:not-allowed}
      @media(max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.grid{grid-template-columns:1fr}}
    `}</style>
  </section>;
}
