"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, Atom, Database, ExternalLink, LoaderCircle, Play, RotateCcw, Sparkles } from "lucide-react";
import type { DataStatus, InstagramCollection, LiveAnalysisSnapshot, Trend } from "@/lib/types";
import type { EvidenceItem, SeriesStats, TrendAnalysis } from "@/lib/schemas";
import type { ValidationLog } from "@/lib/signal";
import { evidenceLookup } from "@/lib/signal";
import { persistLiveAnalysis } from "@/lib/cloud-storage";
import { getLiveAnalyses } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import { DataBadge, EvidenceRefs, formatDateTime, StatusPill } from "./ui";

type PeriodMonths = 1 | 3 | 12;
type NaverSeries = { title: string; keywords: string[]; data: Array<{ period: string; ratio: number }> };
type NaverSignal = { source: "live_naver_datalab"; sourceName: string; collectedAt: string; startDate: string; endDate: string; timeUnit: "date" | "week" | "month"; title: string; keywords: string[]; data: Array<{ period: string; ratio: number }>; series: NaverSeries[]; methodology: string };
type LiveResponse = { mode: "live"; cached: boolean; naver: NaverSignal; signalStats: SeriesStats[]; evidence: EvidenceItem[]; instagram: InstagramCollection; report: TrendAnalysis; model: string; analyzedAt: string; promptVersion: string; validation: ValidationLog };
type View = { status: DataStatus; report: TrendAnalysis; naver?: NaverSignal; evidence: EvidenceItem[]; stats: SeriesStats[]; instagram?: InstagramCollection; model?: string; analyzedAt: string; validation?: ValidationLog; keywords: string[]; periodMonths: PeriodMonths };

const chartColors = ["#000080", "#008080", "#a00000", "#806000", "#800080"];

function fromSnapshot(snapshot: LiveAnalysisSnapshot): View | null {
  if (!snapshot.whyReport) return null;
  return { status: "SAVED", report: snapshot.whyReport, naver: snapshot.naverSignal as NaverSignal | undefined, evidence: snapshot.evidence ?? [], stats: snapshot.signalStats ?? [], instagram: snapshot.instagram, model: snapshot.whyModel, analyzedAt: snapshot.analyzedAt, validation: snapshot.whyValidation, keywords: snapshot.keywords, periodMonths: snapshot.periodMonths };
}

export function LiveWhyPanel({ trend, lockKeyword = false }: { trend: Trend; lockKeyword?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [fresh, setFresh] = useState<LiveResponse | null>(null);
  const [partial, setPartial] = useState<{ naver?: NaverSignal; evidence?: EvidenceItem[] } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(trend.name);
  const [comparison, setComparison] = useState("");
  const [periodMonths, setPeriodMonths] = useState<PeriodMonths>(12);
  const [includeInstagram, setIncludeInstagram] = useState(true);
  const [storageMessage, setStorageMessage] = useState("");
  const snapshots = useStored(getLiveAnalyses);

  const targetId = liveTrendId(query || trend.name);
  const saved = snapshots?.find((item) => item.trendId === targetId) ?? null;
  const requestedKeywords = useMemo(() => [...new Set([query, ...comparison.split(",")].map((item) => item.trim()).filter(Boolean))].slice(0, 5), [query, comparison]);

  const view: View | null = fresh
    ? { status: fresh.cached ? "CACHED" : "LIVE", report: fresh.report, naver: fresh.naver, evidence: fresh.evidence, stats: fresh.signalStats, instagram: fresh.instagram, model: fresh.model, analyzedAt: fresh.analyzedAt, validation: fresh.validation, keywords: requestedKeywords, periodMonths }
    : saved ? fromSnapshot(saved) : null;
  const signal = view?.naver || partial?.naver;
  const ledger = useMemo(() => evidenceLookup(view?.evidence ?? partial?.evidence), [view?.evidence, partial?.evidence]);
  const chartData = useMemo(() => {
    if (!signal) return [];
    const rows = new Map<string, Record<string, string | number>>();
    signal.series.forEach((series) => series.data.forEach((item) => {
      const row = rows.get(item.period) || { period: item.period };
      row[series.title] = item.ratio;
      rows.set(item.period, row);
    }));
    return [...rows.values()].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  }, [signal]);

  const run = async () => {
    const keyword = query.trim();
    if (!keyword) { setError("분석할 키워드를 입력하세요."); setState("error"); return; }
    setState("loading"); setError(""); setFresh(null); setPartial(null); setStorageMessage("");
    try {
      // 저장된 결과가 있는데 다시 실행하는 것은 사용자의 명시적 재분석이므로 서버 캐시도 우회한다.
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trend: keyword, keywords: requestedKeywords, periodMonths, includeInstagram, force: Boolean(saved) }) });
      const body = await response.json();
      if (!response.ok) { if (body.naver) setPartial({ naver: body.naver, evidence: body.evidence }); throw new Error(body.message || "실시간 분석에 실패했습니다."); }
      const data = body as LiveResponse;
      setFresh(data); setState("success");
      const snapshot: LiveAnalysisSnapshot = { id: `live-${Date.now()}`, trendId: liveTrendId(keyword), trendName: keyword, keywords: requestedKeywords, periodMonths, summary: data.report.origin.summary, analyzedAt: data.analyzedAt, source: "NAVER DataLab + OpenAI", whyReport: data.report, naverSignal: data.naver, whyPromptVersion: data.promptVersion, whyModel: data.model, whyValidation: data.validation, evidence: data.evidence, signalStats: data.signalStats, instagram: data.instagram };
      const result = await persistLiveAnalysis(snapshot, data.report, data.naver, data.promptVersion);
      setStorageMessage(`${result.message}${saved?.dna ? " WHY가 갱신되어 이전 DNA는 다시 분석해야 합니다." : ""}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "실시간 분석에 실패했습니다."); setState("error"); }
  };

  const badge: DataStatus = state === "loading" ? "LOADING" : state === "error" && !view ? "ERROR" : view?.status ?? "NOT ANALYZED";

  return <section className="live-why panel" aria-label="Live Trend Why analysis">
    <header><div><span className="live-dot"/><small>LIVE ANALYSIS PIPELINE</small><h2>NAVER + Instagram signal → OpenAI interpretation</h2><p>실제 데이터로 근거 원장을 만들고, AI는 원장 ID로만 근거를 인용합니다. 서버가 존재하지 않는 근거 ID를 제거하고 근거 없는 주장의 상태를 낮춥니다.</p></div><div className="head-actions"><DataBadge status={badge} detail={view?.status === "SAVED" ? formatDateTime(view.analyzedAt) : undefined}/><button className="button primary" onClick={run} disabled={state === "loading"}>{state === "loading" ? <><LoaderCircle className="spin"/>Analyzing…</> : saved || fresh ? <><RotateCcw/>Re-analyze (new API call)</> : <><Play/>Run live analysis</>}</button></div></header>
    <div className="controls"><label>PRIMARY KEYWORD<input value={query} maxLength={100} readOnly={lockKeyword} onChange={(event) => { setQuery(event.target.value); setFresh(null); setState("idle"); }} placeholder="분석할 키워드"/></label><label>COMPARE · COMMA SEPARATED<input value={comparison} maxLength={300} onChange={(event) => setComparison(event.target.value)} placeholder="비교 키워드, 최대 4개"/></label><fieldset><legend>PERIOD</legend>{([1, 3, 12] as const).map((period) => <button type="button" aria-pressed={periodMonths === period} onClick={() => setPeriodMonths(period)} key={period}>{period}M</button>)}</fieldset></div>
    <div className="request-preview"><span>REQUEST</span>{requestedKeywords.map((keyword) => <b key={keyword}>{keyword}</b>)}<label className="ig-toggle"><input type="checkbox" checked={includeInstagram} onChange={(event) => setIncludeInstagram(event.target.checked)}/>Instagram #{(query || "").replace(/\s+/g, "")} 근거 수집</label><small>{periodMonths}개월 · 최대 5개 비교 · Meta 해시태그 조회는 7일간 30개 고유 태그로 제한됩니다</small></div>
    {storageMessage && <p role="status" className="storage-message">{storageMessage}</p>}
    {!view && state === "idle" && <div className="idle"><Database/><div><h3>{snapshots === null ? "저장된 분석을 확인하고 있습니다." : "아직 분석하지 않은 키워드입니다."}</h3><p>API 호출은 버튼을 누를 때만 실행됩니다. 같은 키워드의 저장된 분석이 있으면 호출 없이 먼저 표시합니다.</p></div></div>}
    {state === "loading" && <div className="loading"><LoaderCircle className="spin"/><p>NAVER DataLab·Instagram 수집 후 구조화된 TREND WHY 분석을 생성하고 있습니다. (최대 1분)</p></div>}
    {state === "error" && <div className="error"><AlertTriangle/><div><h3>분석을 완료하지 못했습니다.</h3><p>{error}</p>{partial?.naver && <small>NAVER 실데이터 수집은 성공했지만 OpenAI 해석 단계에서 중단됐습니다. {view ? "아래는 이전에 저장된 분석입니다." : ""}</small>}</div></div>}
    {signal && <div className="signal"><div className="signal-head"><div><small>VERIFIED SIGNAL · LIVE NAVER · {view?.status === "SAVED" ? "SAVED" : "FRESH"}</small><h3>Relative search interest comparison</h3></div><time>수집 {formatDateTime(signal.collectedAt)}</time></div><div className="legend">{signal.series.map((series, index) => <span key={series.title}><i style={{ background: chartColors[index] }}/>{series.title}</span>)}</div><ResponsiveContainer width="100%" height={240}><LineChart data={chartData}><CartesianGrid stroke="#dee2e8" vertical={false}/><XAxis dataKey="period" stroke="#8c8c8c" tick={{ fontSize: 8 }} axisLine={false}/><YAxis domain={[0, 100]} stroke="#8c8c8c" tick={{ fontSize: 8 }} axisLine={false}/><Tooltip contentStyle={{ background: "#e3e3e3", border: "1px solid #dbdbdb", fontSize: 10 }}/>{signal.series.map((series, index) => <Line key={series.title} type="stepAfter" dataKey={series.title} stroke={chartColors[index]} dot={false} strokeWidth={2} connectNulls/>)}</LineChart></ResponsiveContainer><p className="method">{signal.methodology}</p>
      {view?.stats.length ? <table className="stats"><thead><tr><th>KEYWORD</th><th>MEAN</th><th>PEAK</th><th>LATEST</th><th>EARLY ⅓ → RECENT ⅓</th><th>DIRECTION</th></tr></thead><tbody>{view.stats.map((stat) => <tr key={stat.title}><td>{stat.title}</td><td>{stat.mean}</td><td>{stat.peak.ratio} <small>{stat.peak.period}</small></td><td>{stat.latest.ratio}</td><td>{stat.earlyAvg} → {stat.recentAvg}</td><td>{stat.direction}{stat.partialLastExcluded && <small> · 진행 중 구간 제외</small>}</td></tr>)}</tbody></table> : null}
    </div>}
    {view && <div className="report"><div className="report-meta"><span><Sparkles/>OPENAI INTERPRETATION</span><small>{view.model || "model unknown"} · 분석 {formatDateTime(view.analyzedAt)} · {view.periodMonths}개월 · {view.keywords.join(", ")}</small></div>
      <div className="provenance"><span>SOURCES</span><b>NAVER {view.evidence.filter((item) => item.kind === "naver_series").length}</b><b>Instagram {view.evidence.filter((item) => item.kind === "instagram_media").length}</b>{view.instagram && <em className={`ig-${view.instagram.status}`}>IG #{view.instagram.hashtag}: {view.instagram.status.toUpperCase()}{view.instagram.message ? ` — ${view.instagram.message}` : ""}</em>}</div>
      <article className="origin"><small>ORIGIN</small><p>{view.report.origin.summary}</p><EvidenceRefs ids={view.report.origin.evidenceIds} evidence={ledger} empty="근거 없음 · 기원 검증 필요"/></article>
      <div className="report-grid"><div><small>WHY NOW · CAUSAL HYPOTHESES</small>{view.report.triggers.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.explanation}</p><StatusPill status={item.status}/><EvidenceRefs ids={item.evidenceIds} evidence={ledger}/></article>)}</div><div><small>MOTIVATION</small>{view.report.motivations.map((item) => <article key={item.label}><h3>{item.label}</h3><p>{item.explanation}</p><StatusPill status={item.status}/><EvidenceRefs ids={item.evidenceIds} evidence={ledger}/></article>)}</div></div>
      <div className="live-timeline"><small>OBSERVED TIMELINE · 근거가 있는 항목만 날짜순</small>{view.report.timeline.length ? view.report.timeline.map((item) => <article key={`${item.date}-${item.label}`}><time>{item.date}</time><p>{item.label}</p><EvidenceRefs ids={item.evidenceIds} evidence={ledger}/></article>) : <p className="none">근거가 연결된 타임라인 항목이 없습니다.</p>}</div>
      <div className="future-list"><small>CREATIVE SCENARIOS</small>{view.report.futureScenarios.map((item) => <article key={item.title}><h3>{item.title}</h3><p>{item.explanation}</p><StatusPill status="Creative Hypothesis"/></article>)}</div>
      <div className="evidence-ledger"><small>EVIDENCE LEDGER · 서버가 API 응답으로 생성</small>{view.evidence.length ? view.evidence.map((item) => <article key={item.id}><b>{item.id}</b><div><h3>{item.title}</h3><p>{item.excerpt}</p><em>{item.source} · {item.date ? formatDateTime(item.date) : "—"} · 수집 {formatDateTime(item.collectedAt)}</em></div>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`${item.id} 원본 열기`}><ExternalLink/></a> : <span/>}</article>) : <p className="none">이전 버전으로 저장되어 근거 원장이 없습니다. 재분석하면 원장이 생성됩니다.</p>}</div>
      <div className="missing"><small>MISSING EVIDENCE</small><ul>{view.report.missingEvidence.map((item) => <li key={item}>{item}</li>)}</ul></div>
      {view.validation && <p className="validation-log">SERVER VALIDATION · 제거된 근거 ID {view.validation.removedEvidenceIds.length}개{view.validation.removedEvidenceIds.length ? ` (${view.validation.removedEvidenceIds.join(", ")})` : ""} · 상태 하향 {view.validation.downgraded}건 · 근거 없는 타임라인 제외 {view.validation.droppedTimeline ?? 0}건</p>}
      <div className="next-actions"><Link className="button primary" href={trendPath(targetId, "dna")}><Atom/>Open LIVE DNA <ArrowRight/></Link>{trend.id !== targetId && <Link className="button" href={trendPath(targetId, "why")}>LIVE 트렌드 페이지</Link>}</div>
    </div>}
    <style jsx>{`.live-why{margin:20px 0 0;overflow:hidden;border-color:#d5e0de;background:linear-gradient(145deg,#e6e6e6,#e3e3e3)}.live-why>header{padding:24px;display:flex;justify-content:space-between;align-items:center;gap:25px;border-bottom:1px solid var(--border)}.head-actions{display:flex;flex-direction:column;align-items:flex-end;gap:10px}.live-why header>div>small{color:var(--mint);font-size:8px;letter-spacing:.14em}.live-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px var(--mint);margin-right:8px}.live-why h2{font-size:19px;margin:8px 0}.live-why header p{font-size:9px;color:var(--muted);margin:0;max-width:640px;line-height:1.6}.live-why .button :global(svg){width:13px}.controls{display:grid;grid-template-columns:1fr 1fr auto;gap:12px;padding:18px 24px;border-bottom:1px solid var(--border);background:#e7e7e7}.controls label,.controls legend{font-size:8px;color:#787878;letter-spacing:.1em}.controls input{display:block;width:100%;box-sizing:border-box;margin-top:7px;background:#e8e8e8;border:1px solid var(--border);color:var(--text);padding:10px}.controls input[readonly]{color:#4e4e4e}.controls fieldset{border:0;padding:0;margin:0;display:flex;align-items:flex-end}.controls fieldset button{height:35px;border:1px solid var(--border);background:#e8e8e8;color:#7c7c7c;font-size:9px;cursor:pointer}.controls fieldset button[aria-pressed=true]{color:var(--accent);border-color:var(--accent)}.request-preview{padding:10px 24px;display:flex;gap:7px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border)}.request-preview span,.request-preview small{font-size:8px;color:#828282}.request-preview b{font-size:8px;border:1px solid #dbdbdb;color:var(--mint);padding:4px 7px;border-radius:15px}.ig-toggle{display:flex;align-items:center;gap:5px;font-size:8px;color:#4e4e4e;margin-left:10px}.request-preview small{margin-left:auto}.storage-message{margin:12px 24px;font-size:9px;color:var(--mint)}.idle,.loading{min-height:125px;padding:25px;display:flex;align-items:center;justify-content:center;gap:15px}.idle :global(svg),.loading :global(svg){color:var(--mint)}.idle h3{font-size:12px;margin:0 0 7px}.idle p,.loading p{font-size:9px;color:var(--muted);margin:0}.signal{padding:22px;border-bottom:1px solid var(--border)}.signal-head{display:flex;justify-content:space-between}.signal-head small,.report small{font-size:8px;color:var(--mint);letter-spacing:.12em}.signal-head h3{font-size:14px;margin:7px 0}.signal-head time{font-size:8px;color:#888888}.legend{display:flex;gap:12px;flex-wrap:wrap;margin:10px 0}.legend span{font-size:8px;color:#686868}.legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}.method{font-size:8px;color:#777777;margin:0}.stats{width:100%;border-collapse:collapse;margin-top:14px;font-size:9px}.stats th{font-size:7px;color:#828282;letter-spacing:.1em;text-align:left;font-weight:500;padding:6px;border-bottom:1px solid var(--border)}.stats td{padding:7px 6px;border-bottom:1px solid #e0e4ea;color:#424242}.stats small{color:#868686;font-size:7px}.error{display:flex;gap:13px;padding:20px;margin:18px;border:1px solid #c9a59c;background:#e0e0e0;color:#964023}.error h3{font-size:12px;margin:0 0 6px}.error p,.error small{font-size:9px;margin:0;color:#845140}.report{padding:25px}.report-meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;gap:10px}.report-meta span{display:flex;align-items:center;gap:7px;color:var(--accent);font-size:8px}.report-meta span :global(svg){width:13px}.report-meta small{color:#767676!important;letter-spacing:0!important}.provenance em{font-style:normal}.provenance .ig-error{color:#952326}.provenance .ig-live,.provenance .ig-cached{color:var(--mint)}.origin{border-left:2px solid var(--accent);padding:15px 18px;background:#e2e2e2}.origin p{font-size:11px;line-height:1.7;color:#494949}.report-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.report-grid>div,.future-list,.live-timeline,.evidence-ledger{border:1px solid var(--border);padding:18px}.report-grid>div>small,.future-list>small,.live-timeline>small,.evidence-ledger>small{display:block;margin-bottom:12px}.report-grid article,.future-list article{padding:12px 0;border-top:1px solid var(--border);display:grid;gap:7px;justify-items:start}.report article h3{font-size:11px;margin:0}.report article p{font-size:9px;color:var(--muted);line-height:1.6;margin:0}.future-list,.live-timeline,.evidence-ledger{margin-top:10px}.live-timeline article{display:grid;grid-template-columns:100px 1fr auto;gap:12px;padding:10px 0;border-top:1px solid var(--border);align-items:center}.live-timeline time{font-size:9px;color:var(--accent)}.none{font-size:9px;color:#747474}.evidence-ledger article{display:grid;grid-template-columns:70px 1fr 20px;align-items:start;gap:12px;border-top:1px solid var(--border);padding:12px 0}.evidence-ledger article>b{font-size:10px;color:var(--accent)}.evidence-ledger article p{margin:4px 0}.evidence-ledger em{font-style:normal;font-size:7px;color:#868686}.evidence-ledger a{color:var(--accent)}.evidence-ledger a :global(svg){width:13px}.missing{margin-top:10px;padding:15px;background:#e8e8e8;border:1px solid #dedede}.missing small{color:#a17b28}.missing ul{font-size:8px;color:#727272;line-height:1.7;margin-bottom:0}.next-actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}@media(max-width:700px){.live-why>header{align-items:flex-start;flex-direction:column}.head-actions{align-items:flex-start;width:100%}.live-why .button{width:100%}.controls{grid-template-columns:1fr}.report-grid{grid-template-columns:1fr}.signal-head,.report-meta{display:block}.signal-head time{display:block;margin-top:6px}.live-timeline article,.evidence-ledger article{grid-template-columns:1fr}.request-preview small{margin-left:0;width:100%}.ig-toggle{margin-left:0}.stats{display:block;overflow-x:auto}}`}</style>
  </section>;
}
