"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, LoaderCircle, Play, Plus, RotateCcw, X } from "lucide-react";
import { getIgPulseReports, getIgTrackedTags, saveIgPulseReport, saveIgTrackedTags } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import { comparePulse, MIN_COMPARE_GAP_HOURS, nextTrackList, type PulseComparison } from "@/lib/ig-pulse-view";
import type { DataStatus, IgPulseItem, IgPulseReport } from "@/lib/types";
import { DataBadge, WinButtons, formatDateTime } from "./ui";

const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const originLabel: Record<IgPulseItem["origin"], string> = { tracked: "추적", manual: "직접", discovered: "발견" };
const rate = (value: number | null) => value === null ? "—" : value >= 10 ? String(Math.round(value)) : value.toFixed(1);
const cleanTag = (value: string) => value.replace(/^#/, "").replace(/\s+/g, "");
const validTag = (value: string) => value.length > 0 && value.length <= 60 && /^[\p{L}\p{N}_]+$/u.test(value);

function ChangeCell({ comparison }: { comparison: PulseComparison }) {
  if (comparison.kind === "baseline") return <span className="chg base" title={`같은 태그를 ${MIN_COMPARE_GAP_HOURS}시간 이상 뒤에 다시 측정하면 전일 대비 변화가 표시됩니다.`}>기준선</span>;
  if (comparison.kind === "basis-mismatch") return <span className="chg base" title="이전 측정과 측정 방식(24시간 전체/최근 표본)이 달라 비교하지 않습니다.">비교 불가</span>;
  const pct = comparison.changePct;
  const tone = pct > 15 ? "up" : pct < -15 ? "down" : "flat";
  const text = !Number.isFinite(pct) ? "▲ NEW" : `${pct > 0 ? "▲" : pct < 0 ? "▼" : "■"} ${Math.abs(pct)}%`;
  return <span className={`chg ${tone}`} title={`이전 측정 ${formatDateTime(comparison.previous.collectedAt)} · 시간당 ${rate(comparison.previous.perHour)}개`}>{text}</span>;
}

function VolumeCell({ item }: { item: IgPulseItem }) {
  if (item.complete) return <span className="vol" title="최근 24시간 게시물을 끝까지 받아 센 정확한 값">24h {item.posts24h}개</span>;
  return <span className="vol" title={`게시물이 많아 최근 ${item.spanHours ?? "?"}시간 분량 ${item.sampled}개만 받았습니다. 24시간 전체는 이보다 많습니다.`}>24h {item.sampled}+개</span>;
}

/** Instagram 해시태그 최근 게시 속도 보드. 전체 게시물 수는 API가 제공하지 않으므로 표시하지 않는다. */
export function IgPulse() {
  const reports = useStored(getIgPulseReports);
  const tracked = useStored(getIgTrackedTags) ?? [];
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ report: IgPulseReport; cached: boolean } | null>(null);
  const [discover, setDiscover] = useState(true);
  const [draft, setDraft] = useState("");
  const [sort, setSort] = useState<"auto" | "rate" | "change">("auto");
  const report = fresh?.report ?? reports?.[0] ?? null;
  const history = useMemo(() => (reports ?? []).filter((saved) => saved.generatedAt !== report?.generatedAt), [reports, report]);
  const measured = useMemo(() => new Set((reports ?? []).flatMap((saved) => saved.items.filter((item) => item.found).map((item) => item.tag.toLocaleLowerCase()))), [reports]);
  const rows = useMemo(() => {
    if (!report) return [];
    const withChange = report.items.filter((item) => item.found).map((item) => ({ item, comparison: comparePulse(item, history) }));
    const hasChange = withChange.some((row) => row.comparison.kind === "change");
    const mode = sort === "auto" ? (hasChange ? "change" : "rate") : sort;
    const changeOf = (row: typeof withChange[number]) => row.comparison.kind === "change" ? row.comparison.changePct : -Infinity;
    return mode === "change" ? [...withChange].sort((a, b) => changeOf(b) - changeOf(a)) : withChange;
  }, [report, history, sort]);
  const activeSort = sort === "auto" ? (rows.some((row) => row.comparison.kind === "change") ? "change" : "rate") : sort;
  const notFound = report?.items.filter((item) => !item.found) ?? [];
  const status: DataStatus = state === "loading" ? "LOADING" : state === "error" && !report ? "ERROR" : fresh ? (fresh.cached ? "CACHED" : "LIVE") : report ? "SAVED" : "NOT ANALYZED";
  const quota = report?.quota;

  const addTag = (event: React.FormEvent) => {
    event.preventDefault();
    const tag = cleanTag(draft);
    if (!validTag(tag)) { setError("해시태그는 # 없이 문자, 숫자, 밑줄만 입력하세요."); setState("error"); return; }
    saveIgTrackedTags([tag, ...tracked]);
    setDraft(""); setError(""); setState("idle");
  };

  const scan = async () => {
    setState("loading"); setError("");
    // 이미 측정한 태그는 주간 한도를 쓰지 않는 재측정, 처음 보는 태그는 새 조회(최대 3개)
    const track = tracked.filter((tag) => measured.has(tag.toLocaleLowerCase()));
    const add = tracked.filter((tag) => !measured.has(tag.toLocaleLowerCase())).slice(0, 3);
    try {
      const response = await fetch("/api/trends/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: Boolean(report), discover, track, add }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Instagram 해시태그 스캔에 실패했습니다.");
      const next: IgPulseReport = body.report;
      setFresh({ report: next, cached: body.cached });
      saveIgPulseReport(next);
      saveIgTrackedTags(nextTrackList(tracked, next));
      setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Instagram 해시태그 스캔에 실패했습니다."); setState("error"); }
  };

  return <section className="pulse panel" aria-label="Instagram hashtag pulse" data-testid="ig-pulse">
    <div className="titlebar"><span>INSTA.EXE — HASHTAG PULSE</span><WinButtons/></div>
    <header className="pulse-head">
      <div><small className="blink">● LIVE INSTAGRAM · 최근 24시간</small><h2>지금 뜨는 해시태그</h2><p>Instagram 해시태그의 <b>최근 게시 속도</b>를 직접 측정합니다. 같은 태그를 다음 날 다시 재면 <b>전일 대비 상승률</b>이 표시됩니다. 전체 게시물 수는 API가 제공하지 않아 표시하지 않습니다.</p></div>
      <div className="pulse-actions">
        <DataBadge status={status} detail={report && !fresh ? formatDateTime(report.generatedAt) : undefined}/>
        <button className="button primary" onClick={scan} disabled={state === "loading"}>{state === "loading" ? <><LoaderCircle className="spin"/>MEASURING…</> : report ? <><RotateCcw/>RESCAN</> : <><Play/>START</>}</button>
        <label className="toggle"><input type="checkbox" checked={discover} onChange={(event) => setDiscover(event.target.checked)}/>웹 검색으로 새 후보 찾기</label>
        <span className="cost">{discover ? "웹 검색 1회 + " : ""}태그당 Meta 호출 최대 7회 · 6시간 캐시</span>
      </div>
    </header>

    <div className="track">
      <span className="track-label">추적 중 {tracked.length}/10</span>
      {tracked.map((tag) => <span key={tag} className={`chip ${measured.has(tag.toLocaleLowerCase()) ? "" : "pending"}`} title={measured.has(tag.toLocaleLowerCase()) ? "재측정은 주간 한도를 쓰지 않습니다" : "다음 스캔에서 처음 조회합니다(주간 한도 1개 사용)"}>#{tag}<button type="button" aria-label={`${tag} 추적 해제`} onClick={() => saveIgTrackedTags(tracked.filter((item) => item !== tag))}><X/></button></span>)}
      <form onSubmit={addTag} className="add"><input aria-label="추적할 해시태그" placeholder="#치이카와" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={61}/><button className="button" type="submit" disabled={!draft.trim() || tracked.length >= 10}><Plus/>추가</button></form>
      {quota && <span className="quota" title={`Meta 7일 고유 해시태그 한도. ${quota.reserve}개는 수동 검색용 예비`}>주간 한도 <span className="progress-seg" aria-hidden><i style={{ width: `${Math.min(100, (quota.usedAfter / quota.limit) * 100)}%` }}/></span>{quota.usedAfter}/{quota.limit}</span>}
    </div>

    {state === "error" && <div className="pulse-error"><AlertTriangle/><p>{error}{report ? " 아래는 이전에 저장된 결과입니다." : ""}</p></div>}
    {state === "loading" && !report && <div className="pulse-empty"><LoaderCircle className="spin"/><p>해시태그 후보를 찾고 Instagram 최근 게시물을 넘겨받아 세고 있습니다. (약 1–2분)</p></div>}
    {!report && state !== "loading" && <div className="pulse-empty"><p className="insert">NO SIGNAL</p><p>아직 측정한 해시태그가 없습니다. START를 누르면 웹에서 화제인 대상을 찾아 실제 Instagram 게시 속도를 잽니다. 직접 추적할 태그를 먼저 추가해도 됩니다.</p></div>}

    {report && <>
      <div className="board-tools"><div className="chip-select" role="group" aria-label="정렬"><button type="button" aria-pressed={activeSort === "change"} onClick={() => setSort("change")}>전일 대비 순</button><button type="button" aria-pressed={activeSort === "rate"} onClick={() => setSort("rate")}>활동량 순</button></div><span>{activeSort === "change" ? `${MIN_COMPARE_GAP_HOURS}시간 이상 간격의 같은 방식 측정끼리 비교` : "시간당 게시물 수 · 첫 측정은 '기준선'"}</span></div>
      {rows.length ? <ol className="board">{rows.map(({ item, comparison }, index) => <li key={item.tag}>
        <span className="rk">{String(index + 1).padStart(2, "0")}</span>
        <div className="kw"><b>#{item.tag}</b><small>{originLabel[item.origin]}{item.category ? ` · ${item.category}` : ""}{item.keyword && item.keyword.replace(/\s+/g, "") !== item.tag ? ` · ${item.keyword}` : ""}</small></div>
        <span className="rate" title={item.rateBasis === "24h-full" ? "24시간 평균" : `최근 ${item.spanHours ?? "?"}시간 표본 기준`}><b>{rate(item.perHour)}</b>/h{item.rateBasis === "recent-sample" && <i>*</i>}</span>
        <VolumeCell item={item}/>
        <ChangeCell comparison={comparison}/>
        <span className="links">{item.samplePosts[0] && <a href={item.samplePosts[0].permalink} target="_blank" rel="noreferrer" title="가장 최근 게시물">최근 게시물<ExternalLink/></a>}{item.sources.slice(0, 1).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={item.summary}>{domain(source.url)}</a>)}</span>
        <Link className="go" href={trendPath(liveTrendId(item.keyword ?? item.tag), "why")} aria-label={`${item.keyword ?? item.tag} WHY 분석`}>▶</Link>
      </li>)}</ol> : <p className="dropped">측정된 해시태그가 없습니다.</p>}
      {notFound.length > 0 && <p className="dropped">Instagram에 해시태그가 없음: {notFound.map((item) => `#${item.tag}`).join(", ")}</p>}
      {report.deferred.length > 0 && <p className="dropped">보류(다음 스캔): {report.deferred.map((item) => `#${item.tag}`).join(", ")} — {report.deferred[0].reason}</p>}
      {report.failed.length > 0 && <p className="dropped">측정 실패: {report.failed.map((item) => `#${item.tag}`).join(", ")}</p>}
      <details className="method"><summary>HOW THIS IS MEASURED · 측정 {report.items.length}개 · 웹 출처 {report.searchedSources}개 · 출처 미검증 제외 {report.droppedUnverified}개</summary><ul>{report.methodology.map((line) => <li key={line}>{line}</li>)}<li>* 표시: 게시물이 많아 최근 일부만 받은 태그의 표본 속도 · {report.model ?? "웹 검색 없음"} · {formatDateTime(report.generatedAt)}</li></ul></details>
    </>}
    <style jsx>{`.pulse{padding:0;overflow:hidden;margin-bottom:28px}.pulse-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:22px 24px;border-bottom:1px solid var(--line)}.pulse-head small{font-size:10px;color:var(--pink);letter-spacing:.1em}.pulse-head h2{font-family:var(--font-display);font-size:clamp(20px,2.6vw,30px);margin:10px 0;color:var(--title)}.pulse-head p{font-size:12px;color:var(--muted);margin:0;max-width:640px;line-height:1.7}.pulse-head p b{color:var(--text)}.pulse-actions{display:grid;justify-items:end;gap:8px;flex:0 0 auto}.pulse-actions .button :global(svg){width:14px}.toggle{display:flex;gap:6px;align-items:center;font-size:11px}.cost{font-size:9px;color:var(--muted)}.track{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:12px 24px;border-bottom:1px solid var(--line);background:#f6f6f6}.track-label{font-size:10px;color:var(--muted);margin-right:4px}.chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;padding:2px 2px 2px 7px;border:1px solid #000;background:#fff}.chip.pending{border-style:dashed;color:var(--muted)}.chip button{border:0;background:none;padding:0 2px;cursor:pointer;display:grid}.chip button :global(svg){width:11px;height:11px}.add{display:flex;gap:4px;margin-left:auto}.add input{width:130px;padding:4px 7px;font-size:12px;box-shadow:inset 1px 1px 0 var(--bevel-lo)}.add .button{min-height:26px;padding:0 9px;font-size:11px}.add .button :global(svg){width:12px}.quota{display:flex;align-items:center;gap:6px;font-size:10px;color:var(--muted);width:100%;justify-content:flex-end}.quota .progress-seg{display:inline-block;width:120px;height:12px;padding:1px}.pulse-error{display:flex;gap:10px;align-items:center;margin:14px 24px 0;padding:10px 12px;border:1px solid #000;background:#fff4f4;color:var(--pink);font-size:11px}.pulse-error :global(svg){width:16px;flex:0 0 auto}.pulse-error p{margin:0}.pulse-empty{min-height:150px;display:grid;place-content:center;justify-items:center;text-align:center;gap:6px;padding:26px}.pulse-empty p{font-size:11px;color:var(--muted);max-width:540px;line-height:1.7;margin:0}.insert{font-family:var(--font-display);font-size:16px!important;color:var(--title)!important;animation:blink 1s steps(1) infinite}.board-tools{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 24px;flex-wrap:wrap}.board-tools>span{font-size:9px;color:var(--muted)}.board{list-style:none;margin:0;padding:0 24px 10px}.board li{display:grid;grid-template-columns:34px minmax(0,1.4fr) 84px 92px 84px minmax(0,1fr) 28px;gap:12px;align-items:center;padding:10px 0;border-top:1px dashed var(--border)}.board li:nth-child(-n+3) .rk{color:var(--pink)}.rk{font-family:var(--font-display);font-size:13px;color:var(--muted)}.kw{min-width:0}.kw b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kw small{font-size:9px;color:var(--muted)}.rate{font-size:10px;color:var(--muted);text-align:right}.rate b{font-family:var(--font-display);font-size:18px;color:var(--title);margin-right:2px}.rate i{color:var(--pink);font-style:normal}.board :global(.vol){font-size:10px;text-align:right}.board :global(.chg){font-size:12px;text-align:right}.board :global(.chg.base){font-size:10px;color:var(--muted)}.board :global(.chg.up){color:var(--accent)}.board :global(.chg.down){color:var(--pink)}.board :global(.chg.flat){color:var(--blue)}.links{display:flex;gap:8px;flex-wrap:wrap;min-width:0}.links a{display:inline-flex;align-items:center;gap:3px;font-size:9px;color:var(--blue);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}.links a :global(svg){width:9px}.go{font-size:12px;color:#000;text-align:center;border:1px solid #000;background:var(--raised);padding:3px 0;box-shadow:inset -1px -1px 0 var(--bevel-lo),inset 1px 1px 0 #fff}.go:hover{background:var(--select);color:#fff}.dropped{font-size:10px;color:var(--muted);padding:0 24px;margin:4px 0 10px}.method{margin:4px 24px 22px;border:1px dashed var(--border);padding:10px 12px}.method summary{font-size:10px;color:var(--title);cursor:pointer}.method ul{margin:10px 0 0;padding-left:16px;font-size:10px;color:#404040;line-height:1.8}@media(max-width:900px){.board li{grid-template-columns:28px minmax(0,1fr) 70px 72px 24px}.board li :global(.vol),.board li .links{display:none}}@media(max-width:600px){.pulse-head{flex-direction:column;align-items:stretch}.pulse-actions{justify-items:start}.add{margin-left:0;width:100%}.add input{flex:1}.quota{justify-content:flex-start}}`}</style>
  </section>;
}
