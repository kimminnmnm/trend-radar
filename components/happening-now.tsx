"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { AlertTriangle, Bookmark, BookmarkCheck, ExternalLink, LoaderCircle, Search } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { arrangeSignals, discoveryReportId, discoveryWindows, phenomenonKey, signalSortLabels, signalStatusLabels, type DiscoveryReport, type DiscoverySignal, type SignalFilter, type SignalSort } from "@/lib/discovery";
import { getDiscoveryReports, getSavedPhenomena, removePhenomenon, saveDiscoveryReport, savePhenomenon } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import type { DataStatus } from "@/lib/types";
import { DataBadge, WinButtons, formatDateTime } from "./ui";

const strengthLabels: Record<DiscoverySignal["evidenceStrength"], string> = { strong: "근거 강함", moderate: "근거 보통", weak: "근거 약함" };
const filters: Array<{ id: SignalFilter; label: string }> = [{ id: "all", label: "전체" }, { id: "Observed", label: "관측됨" }, { id: "Emerging Signal", label: "떠오르는 신호" }];

/** WHY·Studio가 이 현상을 분석 대상으로 받도록 현상 키를 주소에 붙인다. */
export const phenomenonWhyHref = (signal: DiscoverySignal, key: string) => `${trendPath(liveTrendId(signal.title), "why")}?phenomenon=${encodeURIComponent(key)}`;
export const phenomenonStudioHref = (key: string) => `/studio?phenomenon=${encodeURIComponent(key)}`;

/**
 * T4 WHAT'S HAPPENING NOW?: 넓은 키워드 → 관측 기간 안 실제 자료에서 찾은 세부 현상 후보.
 * 버튼을 눌러야만 유료 발견을 실행하고(서버 12시간 캐시), 결과는 이 브라우저에 저장해 다시 열 때 API를 부르지 않는다.
 * 상태·강도·모멘텀은 서버가 다시 판정한 값만 표시한다(모델이 붙인 "급상승"을 쓰지 않음).
 */
export function HappeningNow() {
  const reports = useStored(getDiscoveryReports) ?? [];
  const saved = useStored(getSavedPhenomena) ?? [];
  const [keyword, setKeyword] = useState("");
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ id: string; cached: boolean } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sort, setSort] = useState<SignalSort>("relevance");
  const [filter, setFilter] = useState<SignalFilter>("all");
  const [custom, setCustom] = useState("");
  const report = reports.find((item) => item.id === (selectedId ?? fresh?.id)) ?? reports[0] ?? null;
  const signals = useMemo(() => report ? arrangeSignals(report.signals, sort, filter) : [], [report, sort, filter]);
  const savedKeys = new Set(saved.map((item) => item.key));
  const ledger = new Map((report?.ledger ?? []).map((item) => [item.id, item]));
  const status: DataStatus = state === "loading" ? "LOADING" : state === "error" && !report ? "ERROR" : fresh && report?.id === fresh.id ? (fresh.cached ? "CACHED" : "LIVE") : report ? "SAVED" : "NOT ANALYZED";

  const discover = async (event: FormEvent) => {
    event.preventDefault();
    const value = keyword.trim();
    if (!value || state === "loading") return;
    setState("loading"); setError("");
    try {
      const response = await apiFetch("/api/discover/phenomena", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keyword: value, days, force: false }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "세부 현상 발견에 실패했습니다.");
      const generatedAt = new Date().toISOString();
      const next: DiscoveryReport = { id: discoveryReportId(body.keyword ?? value, days, generatedAt), keyword: body.keyword ?? value, window: body.window, signals: body.signals ?? [], excluded: body.excluded ?? [], limitations: body.limitations ?? [], sources: body.sources ?? { youtube: 0, web: 0, webDropped: 0 }, ledger: body.ledger ?? [], model: body.model ?? "", generatedAt };
      saveDiscoveryReport(next);
      setFresh({ id: next.id, cached: Boolean(body.cached) }); setSelectedId(next.id); setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "세부 현상 발견에 실패했습니다."); setState("error"); }
  };

  const toggleSave = (signal: DiscoverySignal) => {
    if (!report) return;
    const key = phenomenonKey(report.id, signal.signalId);
    if (savedKeys.has(key)) { removePhenomenon(key); return; }
    const ids = new Set(signal.evidenceIds);
    savePhenomenon({ key, reportId: report.id, keyword: report.keyword, window: report.window, signal, evidence: report.ledger.filter((item) => ids.has(item.id)), savedAt: new Date().toISOString() });
  };

  return <section className="hn panel" aria-label="What's happening now" data-testid="happening-now">
    <div className="titlebar"><span>DISCOVER.EXE — WHAT&apos;S HAPPENING NOW?</span><WinButtons/></div>
    <header className="hn-head">
      <div><small>● WHAT&apos;S HAPPENING NOW?</small><h2>이 키워드 안에서 지금 일어나는 일</h2><p>넓은 키워드를 하나의 주제로 설명하지 않고, 관측 기간 안의 YouTube·웹 자료에서 <b>지금 실제로 보이는 세부 현상</b>을 찾습니다. 키워드의 정의·역사는 후보에서 뺍니다.</p></div>
      <div className="hn-actions"><DataBadge status={status} detail={report && status === "SAVED" ? formatDateTime(report.generatedAt) : undefined}/><span className="cost">버튼을 누를 때만 검색 · 같은 키워드·기간 12시간 캐시 · Instagram 새 검색 없음</span></div>
    </header>
    <form className="hn-form" onSubmit={discover}>
      <input value={keyword} onChange={(event) => setKeyword(event.target.value.slice(0, 60))} placeholder="넓은 키워드 (예: 메이크업)" aria-label="Discovery keyword"/>
      <div className="seg" role="group" aria-label="관측 기간">{discoveryWindows.map((value) => <button type="button" key={value} aria-pressed={days === value} onClick={() => setDays(value)}>{value}일</button>)}</div>
      <button className="button primary" disabled={!keyword.trim() || state === "loading"} data-testid="hn-discover">{state === "loading" ? <><LoaderCircle className="spin"/>찾는 중…</> : <><Search/>세부 현상 찾기</>}</button>
    </form>
    {state === "error" && <div className="hn-error" role="alert"><AlertTriangle/><p>{error}{report ? " 아래는 이전에 저장된 결과입니다." : ""}</p></div>}
    {reports.length > 1 && <div className="hn-history" aria-label="저장된 발견 결과">{reports.slice(0, 8).map((item) => <button type="button" key={item.id} aria-pressed={item.id === report?.id} onClick={() => setSelectedId(item.id)}>{item.keyword}<em>{item.window.days}일</em></button>)}</div>}

    {report ? <div className="hn-body">
      <div className="hn-meta"><strong>{report.keyword}</strong><span>관측 기간 {report.window.from} ~ {report.window.to} ({report.window.days}일)</span><span>YouTube {report.sources.youtube} · 웹 {report.sources.web}</span><span>후보 {report.signals.length} · 제외 {report.excluded.length}</span></div>
      <div className="hn-controls">
        <div className="seg" role="group" aria-label="신호 필터">{filters.map((item) => <button type="button" key={item.id} aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>{item.label} ({item.id === "all" ? report.signals.length : report.signals.filter((signal) => signal.verificationStatus === item.id).length})</button>)}</div>
        <label>정렬 <select value={sort} onChange={(event) => setSort(event.target.value as SignalSort)} aria-label="정렬">{(Object.keys(signalSortLabels) as SignalSort[]).map((value) => <option key={value} value={value}>{signalSortLabels[value]}</option>)}</select></label>
      </div>
      {signals.length ? <ol className="hn-list">{signals.map((signal) => {
        const key = phenomenonKey(report.id, signal.signalId);
        const isSaved = savedKeys.has(key);
        return <li key={signal.signalId} data-testid="hn-signal" data-status={signal.verificationStatus}>
          <div className="hn-top"><span className={`status ${signal.verificationStatus === "Observed" ? "obs" : "emg"}`}>{signalStatusLabels[signal.verificationStatus]}</span><span className="strength">{strengthLabels[signal.evidenceStrength]} · 독립 출처 {signal.independentSources}</span>{signal.observedDateRange && <span className="range">{signal.observedDateRange.from} ~ {signal.observedDateRange.to}</span>}</div>
          <h3>{signal.title}</h3>
          <p>{signal.phenomenon}</p>
          {signal.audienceBehavior && <p className="behavior"><b>사람들이 하는 일</b> {signal.audienceBehavior}</p>}
          <div className="hn-tags">{signal.observedPlatforms.map((platform) => <span key={platform}>{platform}</span>)}{signal.momentumIndicator && <span className="momentum" title={signal.momentumIndicator.basis}>NAVER 「{signal.momentumIndicator.keyword}」 최근 4주 ×{signal.momentumIndicator.ratio} · 상대 지수</span>}</div>
          {signal.contentExamples.length > 0 && <ul className="hn-ex">{signal.contentExamples.slice(0, 3).map((example) => { const item = ledger.get(example.evidenceId); return <li key={example.evidenceId}><code>{example.evidenceId}</code>{item?.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink size={11}/></a> : <span>{item?.title ?? example.note}</span>}</li>; })}</ul>}
          <div className="hn-links">
            <Link className="button" href={phenomenonWhyHref(signal, key)}>이 현상 WHY 분석</Link>
            <Link className="button" href={phenomenonStudioHref(key)}>Content Studio로</Link>
            <button type="button" className="button" aria-pressed={isSaved} onClick={() => toggleSave(signal)}>{isSaved ? <><BookmarkCheck/>저장됨</> : <><Bookmark/>저장</>}</button>
          </div>
        </li>;
      })}</ol> : <p className="hn-empty">{report.signals.length ? "이 필터에 맞는 현상이 없습니다." : "관측 기간 안의 근거가 있는 세부 현상을 찾지 못했습니다. 기간을 늘리거나 다른 키워드로 찾아 보세요."}</p>}
      {(report.limitations.length > 0 || report.excluded.length > 0) && <details className="hn-limits"><summary>한계와 제외된 후보</summary>{report.limitations.map((item) => <p key={item}>{item}</p>)}{report.excluded.map((item) => <p key={item.title}>제외 · {item.title} — {item.reason}</p>)}</details>}
    </div> : state !== "loading" && <p className="hn-empty">아직 찾은 현상이 없습니다. 넓은 키워드를 입력하고 세부 현상 찾기를 누르세요.</p>}

    {saved.length > 0 && <div className="hn-saved" data-testid="hn-saved"><small>저장한 현상 · {saved.length}</small><div>{saved.slice(0, 12).map((item) => <Link key={item.key} href={phenomenonWhyHref(item.signal, item.key)}>{item.signal.title}<em>{item.keyword}</em></Link>)}</div></div>}

    <form className="hn-custom" onSubmit={(event) => event.preventDefault()}>
      <label>찾는 현상이 목록에 없나요? 직접 입력한 현상 분석<input value={custom} onChange={(event) => setCustom(event.target.value.slice(0, 60))} placeholder="예: 로블록스 메이크업 현실에서 따라 하기" aria-label="Custom phenomenon"/></label>
      {custom.trim() ? <Link className="button" href={`${trendPath(liveTrendId(custom.trim()), "why")}?phenomenon=custom`} data-testid="hn-custom-why">WHY 분석</Link> : <button type="button" className="button" disabled>WHY 분석</button>}
      <span>직접 입력한 현상은 발견 근거가 없으므로 WHY 분석에서 새로 수집한 자료로만 판단합니다.</span>
    </form>

    <style jsx>{`
      .hn{padding:0;overflow:hidden;margin-bottom:16px}.hn-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:24px;border-bottom:2px solid var(--border)}.hn-head small{font-size:12px;color:var(--pink);letter-spacing:.12em}.hn-head h2{font-family:var(--font-display);font-size:clamp(18px,2.2vw,26px);margin:12px 0 10px;color:var(--title)}.hn-head p{font-size:13px;color:var(--muted);margin:0;max-width:640px;line-height:1.7}.hn-head p b{color:var(--accent)}.hn-actions{display:grid;justify-items:end;gap:8px;flex:0 0 auto;max-width:260px;text-align:right}.cost{font-size:11px;color:#6d6d6d}
      .hn-form,.hn-custom{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:16px 24px}.hn-form input{flex:1 1 220px;min-width:0}.hn-form .button :global(svg){width:14px}.seg{display:inline-flex;flex-wrap:wrap;gap:4px}.seg button{font-size:12px;padding:5px 10px;border:1.5px solid var(--ink);background:#fff;border-radius:999px;cursor:pointer}.seg button[aria-pressed="true"]{background:var(--ink);color:#fff}
      .hn-error{display:flex;gap:10px;align-items:center;margin:0 24px 12px;padding:12px;border:2px solid #d590a2;background:#f4f5f9;color:#942348;font-size:12px}.hn-error p{margin:0}
      .hn-history{display:flex;flex-wrap:wrap;gap:6px;padding:0 24px 12px}.hn-history button{font-size:12px;padding:3px 9px;border:1.5px dashed var(--ink);background:#fff;border-radius:999px;cursor:pointer;display:inline-flex;gap:5px}.hn-history button[aria-pressed="true"]{border-style:solid;font-weight:700}.hn-history em{font-style:normal;color:var(--muted)}
      .hn-body{padding:0 24px 16px;display:grid;gap:12px}.hn-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--muted);align-items:baseline}.hn-meta strong{font-size:15px;color:var(--title)}.hn-controls{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center}.hn-controls label{font-size:12px;display:flex;gap:6px;align-items:center}
      .hn-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px}.hn-list>li{border:1.5px solid var(--ink);background:#fff;padding:14px;display:flex;flex-direction:column;gap:6px;min-width:0}.hn-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;color:var(--muted)}.status{font-weight:700;padding:2px 7px;border:1.5px solid currentColor}.status.obs{color:#0f6b3a}.status.emg{color:#9a5b00}.hn-list h3{margin:2px 0 0;font-size:15px;color:#14161f;overflow-wrap:anywhere}.hn-list p{margin:0;font-size:12.5px;line-height:1.6;color:#3a3d4a;overflow-wrap:anywhere}.hn-list .behavior b{font-size:11px;color:var(--accent);margin-right:4px}
      .hn-tags{display:flex;flex-wrap:wrap;gap:4px}.hn-tags span{font-size:11px;padding:1px 6px;background:#eef0f7;border-radius:3px}.hn-tags .momentum{background:#fff6d6}.hn-ex{list-style:none;margin:0;padding:0;display:grid;gap:3px;font-size:11.5px}.hn-ex li{display:flex;gap:6px;min-width:0}.hn-ex code{font-size:10.5px;color:var(--muted);flex:0 0 auto}.hn-ex a,.hn-ex span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.hn-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:6px}.hn-links :global(.button){font-size:12px;padding:5px 10px}.hn-links :global(svg){width:13px}
      .hn-empty{margin:0;padding:0 24px 16px;font-size:13px;color:var(--muted)}.hn-body .hn-empty{padding:0}.hn-limits{font-size:12px;color:var(--muted)}.hn-limits p{margin:4px 0}
      .hn-saved{padding:12px 24px;border-top:1.5px solid var(--border);display:grid;gap:6px}.hn-saved small{font-size:12px;font-weight:700;color:var(--muted)}.hn-saved>div{display:flex;flex-wrap:wrap;gap:6px}.hn-saved :global(a){display:inline-flex;gap:6px;font-size:12.5px;font-weight:700;padding:3px 10px;border:1.5px solid var(--ink);border-radius:999px;background:#fff}.hn-saved :global(em){font-style:normal;font-weight:400;color:var(--muted)}
      .hn-custom{border-top:1.5px solid var(--border)}.hn-custom label{display:grid;gap:4px;font-size:12px;font-weight:700;flex:1 1 260px;min-width:0}.hn-custom span{font-size:11px;color:var(--muted);flex-basis:100%}
      @media(max-width:760px){.hn-head{flex-direction:column;align-items:flex-start}.hn-actions{justify-items:start;text-align:left;max-width:none}.hn-form,.hn-custom,.hn-history,.hn-body{padding-left:16px;padding-right:16px}.hn-list{grid-template-columns:1fr}}
    `}</style>
  </section>;
}
