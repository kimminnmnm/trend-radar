"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, BookmarkCheck, BookmarkPlus, ExternalLink, LoaderCircle, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import {
  arrangeSignals, connectionRunId, discoveryReportId, parseKeywordPair, type ConnectionRun, discoveryWindows, displayStatusHelp, displayStatusOf, insufficientCandidates, isPhenomenonPayload, phenomenonContextOf, phenomenonImage,
  phenomenonItemId, phenomenonPayloadOf, phenomenonQuery, phenomenonTrendId, reportAgeDays, signalSortLabels, STALE_DAYS,
  type DiscoveryReport, type DiscoverySignal, type DisplayStatus, type PhenomenonContext, type SignalFilter, type SignalSort,
} from "@/lib/discovery";
import { getConnectionRuns, getDiscoveryReports, getSavedItems, removeItem, saveConnectionRun, saveDiscoveryReport, saveItem } from "@/lib/storage";
import { ConnectionResults } from "./connection-results";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import type { DataStatus } from "@/lib/types";
import { DataBadge, WinButtons, formatDateTime } from "./ui";

const statusClass: Record<DisplayStatus, string> = { OBSERVED: "obs", EMERGING: "emg", "INSUFFICIENT EVIDENCE": "ins" };

/** WHY·Studio로 현상 ID·핵심 행동·관측 기간·근거 ID를 함께 넘긴다. */
export const phenomenonWhyHref = (context: PhenomenonContext) => `${trendPath(phenomenonTrendId(context), "why")}?${phenomenonQuery(context)}`;
export const phenomenonStudioHref = (context: PhenomenonContext) => `/studio?${phenomenonQuery(context)}`;

/**
 * T4 WHAT'S HAPPENING NOW?: 넓은 키워드 → 관측 기간 안 실제 자료에서 찾은 세부 현상.
 * 버튼을 눌러야만 기존 발견 API를 부르고(서버 12시간 캐시), 결과는 이 브라우저에 저장해 다시 열 때 API를 부르지 않는다.
 * 상태는 서버가 근거 수로 다시 판정한 값만 표시한다. OBSERVED는 실제 사례 확인이지 인기·급상승이 아니다.
 */
export function HappeningNow() {
  const reports = useStored(getDiscoveryReports) ?? [];
  const runs = useStored(getConnectionRuns) ?? [];
  // T8: "A × B"를 입력하면 두 키워드 연결(T3)을 찾는다. 결과 화면은 발견(phen)·연결(conn) 중 마지막에 고른 것.
  const [view, setView] = useState<{ kind: "phen" | "conn"; id: string | null }>({ kind: "phen", id: null });
  const savedItems = useStored(getSavedItems) ?? [];
  const [keyword, setKeyword] = useState("");
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ id: string; cached: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SignalSort>("relevance");
  const [filter, setFilter] = useState<SignalFilter>("all");
  const [openEvidence, setOpenEvidence] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const report = reports.find((item) => item.id === (selectedId ?? fresh?.id)) ?? reports[0] ?? null;
  // 아직 아무것도 고르지 않았으면(다시 열었을 때) 발견·연결 중 가장 최근 결과를 보여 준다.
  const latestIsRun = !view.id && !selectedId && Boolean(runs[0]) && (!reports[0] || runs[0].generatedAt > reports[0].generatedAt);
  const run = view.kind === "conn" ? runs.find((item) => item.id === view.id) ?? runs[0] ?? null : latestIsRun ? runs[0] : null;
  const pair = parseKeywordPair(keyword);
  const signals = useMemo(() => report && filter !== "INSUFFICIENT EVIDENCE" ? arrangeSignals(report.signals, sort, filter) : [], [report, sort, filter]);
  const insufficient = report ? insufficientCandidates(report) : [];
  const savedIds = new Set(savedItems.filter((item) => isPhenomenonPayload(item.payload)).map((item) => item.id));
  const ledger = new Map((report?.ledger ?? []).map((item) => [item.id, item]));
  const age = report ? reportAgeDays(report.generatedAt) : 0;
  const shown = run ?? report;
  const status: DataStatus = state === "loading" ? "LOADING" : state === "error" && !shown ? "ERROR" : fresh && shown?.id === fresh.id ? (fresh.cached ? "CACHED" : "LIVE") : shown ? "SAVED" : "NOT ANALYZED";
  const count = (value: SignalFilter) => !report ? 0 : value === "all" ? report.signals.length : value === "INSUFFICIENT EVIDENCE" ? insufficient.length : report.signals.filter((signal) => displayStatusOf(signal.verificationStatus) === value).length;

  const discover = async (event: FormEvent) => {
    event.preventDefault();
    const value = keyword.trim();
    if (!value || state === "loading") return;
    setState("loading"); setError("");
    if (pair) {
      try {
        const response = await apiFetch("/api/discover/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: pair.a, b: pair.b, days, force: false }) });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.message || "연결 찾기에 실패했습니다.");
        if (!body.window || !Array.isArray(body.connections)) throw new Error("연결 결과 형식이 올바르지 않습니다.");
        const generatedAt = new Date().toISOString();
        const next: ConnectionRun = { id: connectionRunId(pair.a, pair.b, days, generatedAt), a: body.a ?? pair.a, b: body.b ?? pair.b, window: body.window, termsA: body.termsA ?? [pair.a], termsB: body.termsB ?? [pair.b], connections: body.connections, ledger: body.ledger ?? [], limitations: body.limitations ?? [], generatedAt };
        saveConnectionRun(next);
        setFresh({ id: next.id, cached: Boolean(body.cached) }); setView({ kind: "conn", id: next.id }); setState("idle");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "연결 찾기에 실패했습니다."); setState("error"); }
      return;
    }
    try {
      const response = await apiFetch("/api/discover/phenomena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: value, days, force: false }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "세부 현상 발견에 실패했습니다.");
      if (!body.window || !Array.isArray(body.signals)) throw new Error("발견 결과 형식이 올바르지 않습니다.");
      const generatedAt = new Date().toISOString();
      const next: DiscoveryReport = { id: discoveryReportId(body.keyword ?? value, days, generatedAt), keyword: body.keyword ?? value, window: body.window, signals: body.signals, excluded: body.excluded ?? [], limitations: body.limitations ?? [], sources: body.sources ?? { youtube: 0, web: 0, webDropped: 0 }, ledger: body.ledger ?? [], model: body.model ?? "", generatedAt };
      saveDiscoveryReport(next);
      setFresh({ id: next.id, cached: Boolean(body.cached) }); setSelectedId(next.id); setView({ kind: "phen", id: next.id }); setFilter("all"); setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "세부 현상 발견에 실패했습니다."); setState("error"); }
  };

  const toggleSave = (signal: DiscoverySignal) => {
    if (!report) return;
    const payload = phenomenonPayloadOf(report, signal);
    const id = phenomenonItemId(payload.context.phenomenonId);
    if (savedIds.has(id)) { removeItem(id); return; }
    const now = new Date().toISOString();
    saveItem({ id, type: "insight", mode: "live", title: signal.title, subtitle: `${report.keyword} 세부 현상 · ${payload.context.verificationStatus} · 독립 출처 ${signal.independentSources}`, createdAt: now, updatedAt: now, payload });
  };

  return <section className="hn panel" aria-label="What's happening now" data-testid="happening-now">
    <div className="titlebar"><span>DISCOVER.EXE — WHAT&apos;S HAPPENING NOW?</span><WinButtons/></div>
    <header className="hn-head">
      <div><small>● WHAT&apos;S HAPPENING NOW?</small><h2>이 키워드 안에서 지금 일어나는 일</h2><p>넓은 키워드의 정의·역사를 설명하지 않고, 관측 기간 안의 YouTube·웹 자료에서 <b>지금 실제로 보이는 세부 현상</b>을 찾습니다.</p></div>
      <div className="hn-actions"><DataBadge status={status} detail={shown && status === "SAVED" ? formatDateTime(shown.generatedAt) : undefined}/><span className="cost">버튼을 누를 때만 검색 · 같은 키워드·기간 12시간 캐시 · Instagram 새 검색 없음</span></div>
    </header>
    <form className="hn-form" onSubmit={discover}>
      <input value={keyword} onChange={(event) => setKeyword(event.target.value.slice(0, 60))} placeholder="넓은 키워드 (예: 메이크업) 또는 두 키워드 (예: 로블록스 × 메이크업)" aria-label="Discovery keyword"/>
      <div className="seg" role="group" aria-label="관측 기간">{discoveryWindows.map((value) => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value}일</button>)}</div>
      <button className="button primary" disabled={!keyword.trim() || state === "loading"} data-testid="hn-discover">{state === "loading" ? <><LoaderCircle className="spin"/>찾는 중…</> : <><Search/>{pair ? "두 키워드 연결 찾기" : "세부 현상 찾기"}</>}</button>
    </form>
    {state === "error" && <div className="hn-error" role="alert"><AlertTriangle/><p>{error}{report ? " 아래는 이전에 저장된 결과입니다." : ""}</p></div>}
    {reports.length + runs.length > 1 && <div className="hn-history" aria-label="저장된 발견 결과">{reports.slice(0, 8).map((item) => <button type="button" key={item.id} aria-pressed={!run && item.id === report?.id} onClick={() => { setSelectedId(item.id); setView({ kind: "phen", id: item.id }); setFilter("all"); }}>{item.keyword}<em>{item.window.days}일</em></button>)}{runs.slice(0, 5).map((item) => <button type="button" key={item.id} aria-pressed={item.id === run?.id} onClick={() => setView({ kind: "conn", id: item.id })}>{item.a} × {item.b}<em>{item.window.days}일</em></button>)}</div>}
    {run && <div className="hn-body"><ConnectionResults run={run} savedIds={savedIds}/></div>}

    {run ? null : report ? <div className="hn-body">
      {age > STALE_DAYS && <p className="hn-stale" role="status" data-testid="hn-stale">{age}일 전에 수집한 결과입니다. 지금도 같은 현상이 보이는지는 다시 찾아 확인해야 합니다.</p>}
      <div className="hn-meta"><strong>{report.keyword}</strong><span>관측 기간 {report.window.from} ~ {report.window.to} ({report.window.days}일)</span><span>YouTube {report.sources.youtube} · 웹 {report.sources.web}</span></div>
      <div className="hn-controls">
        <div className="seg" role="group" aria-label="검증 상태">{(["all", "OBSERVED", "EMERGING", "INSUFFICIENT EVIDENCE"] as SignalFilter[]).map((value) => <button type="button" key={value} aria-pressed={filter === value} onClick={() => setFilter(value)} title={value === "all" ? undefined : displayStatusHelp[value]}>{value === "all" ? "ALL" : value} ({count(value)})</button>)}</div>
        {filter !== "INSUFFICIENT EVIDENCE" && <label>정렬 <select value={sort} onChange={(event) => setSort(event.target.value as SignalSort)} aria-label="정렬">{(Object.keys(signalSortLabels) as SignalSort[]).map((value) => <option key={value} value={value}>{signalSortLabels[value]}</option>)}</select></label>}
      </div>
      <p className="hn-legend"><b>OBSERVED</b> 독립 출처 2곳 이상에서 실제 사례 확인 · <b>EMERGING</b> 근거 1곳뿐 · <b>INSUFFICIENT EVIDENCE</b> 판단할 근거 없음. 상태는 인기도나 검색량 증가를 뜻하지 않습니다.</p>

      {filter === "INSUFFICIENT EVIDENCE" ? (insufficient.length ? <ul className="hn-insufficient">{insufficient.map((item) => <li key={item.title} data-testid="hn-insufficient"><span className="status ins">INSUFFICIENT EVIDENCE</span><h3>{item.title}</h3><p>{item.reason} — 후보로 나왔지만 이 결과만으로는 현상이라고 판단하지 않습니다.</p></li>)}</ul> : <p className="hn-empty">근거 부족으로 빠진 후보가 없습니다.</p>)
      : signals.length ? <ol className="hn-list">{signals.map((signal) => {
        const context = phenomenonContextOf(report.id, report, signal);
        const display = context.verificationStatus;
        const isSaved = savedIds.has(phenomenonItemId(context.phenomenonId));
        const image = phenomenonImage(signal, report.ledger);
        const showEvidence = openEvidence === context.phenomenonId;
        return <li key={signal.signalId} data-testid="hn-signal" data-status={display} data-phenomenon={context.phenomenonId}>
          {image && <figure className="hn-thumb">
            {/* eslint-disable-next-line @next/next/no-img-element -- 근거 영상의 공식 YouTube 썸네일을 그대로 표시 */}
            <img src={image.src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.parentElement!.hidden = true; }}/><figcaption>{image.evidenceId} 썸네일</figcaption></figure>}
          <div className="hn-top"><span className={`status ${statusClass[display]}`} title={displayStatusHelp[display]}>{display}</span><span className="srcs">출처 {signal.independentSources}곳{signal.independentSources === 1 ? " (단일 출처)" : ""} · 근거 {signal.evidenceIds.length}건</span></div>
          <h3>{signal.title}</h3>
          <p className="behavior"><b>핵심 행동</b> {signal.audienceBehavior || "—"}</p>
          <p>{signal.phenomenon}</p>
          <dl className="hn-facts">
            <div><dt>관측 기간</dt><dd>{signal.observedDateRange ? `${signal.observedDateRange.from} ~ ${signal.observedDateRange.to}` : "날짜 미상"}</dd></div>
            <div><dt>플랫폼</dt><dd>{signal.observedPlatforms.join(" · ") || "—"}</dd></div>
            {signal.relatedKeywords.length > 0 && <div><dt>관련 키워드</dt><dd className="kw">{signal.relatedKeywords.map((item) => <span key={item}>{item}</span>)}</dd></div>}
            {signal.momentumIndicator && <div><dt>검색 관심도</dt><dd className="momentum" title={signal.momentumIndicator.basis}>NAVER 「{signal.momentumIndicator.keyword}」 최근 4주 ÷ 이전 = ×{signal.momentumIndicator.ratio} (상대 지수 · 절대 검색량·순위 아님)</dd></div>}
          </dl>
          <div className="hn-links">
            <Link className="button primary" href={phenomenonWhyHref(context)}>EXPLORE WHY</Link>
            <button type="button" className="button" aria-expanded={showEvidence} onClick={() => setOpenEvidence(showEvidence ? null : context.phenomenonId)}>VIEW EVIDENCE</button>
            <Link className="button" href={phenomenonStudioHref(context)}>CREATE CONTENT</Link>
            <button type="button" className="button" aria-pressed={isSaved} onClick={() => toggleSave(signal)}>{isSaved ? <><BookmarkCheck/>SAVED</> : <><BookmarkPlus/>SAVE TO WORKSPACE</>}</button>
          </div>
          {showEvidence && <ul className="hn-ev" data-testid="hn-evidence">{signal.evidenceIds.map((id) => { const item = ledger.get(id); return <li key={id} data-evidence-id={id}><code>{id}</code>{item ? <div><b>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink size={11}/></a> : item.title}</b><small>{item.source}{item.date ? ` · ${item.date.slice(0, 10)}` : " · 날짜 미상"}</small>{item.excerpt && <p>{item.excerpt}</p>}</div> : <span>원장에 없는 근거</span>}</li>; })}</ul>}
        </li>;
      })}</ol> : <p className="hn-empty">{report.signals.length ? "이 상태에 해당하는 현상이 없습니다." : "관측 기간 안의 근거가 있는 세부 현상을 찾지 못했습니다. 기간을 늘리거나 다른 키워드로 찾아 보세요."}</p>}
      {report.limitations.length > 0 && <details className="hn-limits"><summary>이 결과의 한계</summary>{report.limitations.map((item) => <p key={item}>{item}</p>)}</details>}
    </div> : state !== "loading" && <p className="hn-empty pad">아직 찾은 현상이 없습니다. 넓은 키워드를 입력하고 세부 현상 찾기를 누르세요.</p>}

    <form className="hn-custom" onSubmit={(event) => event.preventDefault()}>
      <label>찾는 현상이 목록에 없나요? 직접 입력한 현상 분석<input value={custom} onChange={(event) => setCustom(event.target.value.slice(0, 60))} placeholder="예: 로블록스 메이크업 현실에서 따라 하기" aria-label="Custom phenomenon"/></label>
      {custom.trim() ? <Link className="button" href={`${trendPath(liveTrendId(custom.trim()), "why")}?phenomenon=custom`} data-testid="hn-custom-why">EXPLORE WHY</Link> : <button type="button" className="button" disabled>EXPLORE WHY</button>}
      <span>직접 입력한 현상은 발견 근거가 없으므로 WHY 분석에서 새로 수집한 자료로만 판단합니다.</span>
    </form>

    <style jsx>{`
      .hn{padding:0;overflow:hidden;margin-bottom:16px}.hn-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:24px;border-bottom:2px solid var(--border)}.hn-head small{font-size:12px;color:var(--pink);letter-spacing:.12em}.hn-head h2{font-family:var(--font-display);font-size:clamp(18px,2.2vw,26px);margin:12px 0 10px;color:var(--title)}.hn-head p{font-size:13px;color:var(--muted);margin:0;max-width:640px;line-height:1.7}.hn-head p b{color:var(--accent)}.hn-actions{display:grid;justify-items:end;gap:8px;flex:0 0 auto;max-width:260px;text-align:right}.cost{font-size:11px;color:#6d6d6d}
      .hn-form,.hn-custom{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:16px 24px}.hn-form input{flex:1 1 220px;min-width:0}.hn-form .button :global(svg){width:14px}.seg{display:inline-flex;flex-wrap:wrap;gap:4px}.seg button{font-size:12px;padding:5px 10px;border:1.5px solid var(--ink);background:#fff;border-radius:999px;cursor:pointer}.seg button[aria-pressed="true"]{background:var(--ink);color:#fff}
      .hn-error{display:flex;gap:10px;align-items:center;margin:0 24px 12px;padding:12px;border:2px solid #d590a2;background:#f4f5f9;color:#942348;font-size:12px}.hn-error p{margin:0}
      .hn-history{display:flex;flex-wrap:wrap;gap:6px;padding:0 24px 12px}.hn-history button{font-size:12px;padding:3px 9px;border:1.5px dashed var(--ink);background:#fff;border-radius:999px;cursor:pointer;display:inline-flex;gap:5px}.hn-history button[aria-pressed="true"]{border-style:solid;font-weight:700}.hn-history em{font-style:normal;color:var(--muted)}
      .hn-body{padding:0 24px 16px;display:grid;gap:12px}.hn-stale{margin:0;padding:8px 10px;border:1.5px solid #c98a00;background:#fff6d6;font-size:12px;color:#6b4a00}.hn-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--muted);align-items:baseline}.hn-meta strong{font-size:15px;color:var(--title)}.hn-controls{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}.hn-controls label{font-size:12px;display:flex;gap:6px;align-items:center}.hn-legend{margin:0;font-size:11px;color:var(--muted);line-height:1.6}.hn-legend b{color:#3a3d4a}
      .hn-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px}.hn-list>li,.hn-insufficient>li{border:1.5px solid var(--ink);background:#fff;padding:14px;display:flex;flex-direction:column;gap:6px;min-width:0}
      .hn-thumb{margin:-14px -14px 4px;position:relative;aspect-ratio:16/9;overflow:hidden;background:#e9ebf2;border-bottom:1.5px solid var(--ink)}.hn-thumb img{width:100%;height:100%;object-fit:cover;display:block}.hn-thumb figcaption{position:absolute;left:6px;bottom:6px;font-size:10px;padding:1px 5px;background:rgba(255,255,255,.9);border:1px solid var(--ink)}
      .hn-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:var(--muted)}.status{font-weight:800;font-size:10.5px;letter-spacing:.04em;padding:2px 7px;border:1.5px solid currentColor;background:#fff}.status.obs{color:#0f6b3a}.status.emg{color:#9a5b00}.status.ins{color:#6b6f80}
      .hn-list h3,.hn-insufficient h3{margin:2px 0 0;font-size:15px;color:#14161f;overflow-wrap:anywhere}.hn-list p,.hn-insufficient p{margin:0;font-size:12.5px;line-height:1.6;color:#3a3d4a;overflow-wrap:anywhere}.hn-list .behavior b{font-size:11px;color:var(--accent);margin-right:4px}
      .hn-facts{margin:2px 0 0;display:grid;gap:3px;font-size:11.5px}.hn-facts div{display:flex;gap:6px;min-width:0}.hn-facts dt{flex:0 0 64px;color:var(--muted)}.hn-facts dd{margin:0;min-width:0;overflow-wrap:anywhere}.hn-facts .kw{display:flex;flex-wrap:wrap;gap:4px}.hn-facts .kw span{padding:0 6px;background:#eef0f7;border-radius:3px}.hn-facts .momentum{background:#fff6d6;padding:0 4px}
      .hn-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:6px}.hn-links :global(.button){font-size:11.5px;padding:5px 9px}.hn-links :global(svg){width:13px}
      .hn-ev{list-style:none;margin:4px 0 0;padding:8px;display:grid;gap:8px;border:1px dashed var(--border);background:#fafbfe}.hn-ev li{display:flex;gap:8px;min-width:0;font-size:11.5px}.hn-ev code{font-size:10.5px;color:var(--muted);flex:0 0 auto}.hn-ev div{display:grid;gap:2px;min-width:0}.hn-ev b{overflow-wrap:anywhere}.hn-ev small{color:var(--muted)}.hn-ev p{font-size:11px;color:#555;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
      .hn-insufficient{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}.hn-insufficient>li{border-style:dashed;background:#f7f7fa}
      .hn-empty{margin:0;font-size:13px;color:var(--muted)}.hn-empty.pad{padding:0 24px 16px}.hn-limits{font-size:12px;color:var(--muted)}.hn-limits p{margin:4px 0}
      .hn-custom{border-top:1.5px solid var(--border)}.hn-custom label{display:grid;gap:4px;font-size:12px;font-weight:700;flex:1 1 260px;min-width:0}.hn-custom span{font-size:11px;color:var(--muted);flex-basis:100%}
      @media(max-width:760px){.hn-head{flex-direction:column;align-items:flex-start}.hn-actions{justify-items:start;text-align:left;max-width:none}.hn-form,.hn-custom,.hn-history,.hn-body{padding-left:16px;padding-right:16px}.hn-empty.pad{padding:0 16px 16px}.hn-list,.hn-insufficient{grid-template-columns:1fr}}
    `}</style>
  </section>;
}
