"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, LoaderCircle, Play, RotateCcw } from "lucide-react";
import { getNowReports, saveNowReport } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import type { DataStatus, NowTrendItem, NowTrendReport } from "@/lib/types";
import { DataBadge, WinButtons, formatDateTime } from "./ui";

const precisionLabel: Record<NowTrendItem["levelPrecision"], string> = { exact: "", estimated: "≈", low: "≈?" };
const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

/** 계단형 픽셀 스파크라인. 각 키워드 자체 시계열의 모양만 보여주며 키워드 간 높이 비교용이 아니다. */
function PixelSpark({ series, color }: { series: NowTrendItem["series"]; color: string }) {
  const values = series.map((point) => point.value);
  const max = Math.max(...values, 1);
  const w = 120, h = 32, step = w / Math.max(values.length, 1);
  const ys = values.map((value) => Math.round(h - 2 - (value / max) * (h - 4)));
  const path = ys.reduce((d, y, i) => i === 0 ? `M0 ${y}` : `${d} H${Math.round(i * step)} V${y}`, "") + ` H${w}`;
  return <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden shapeRendering="crispEdges"><path d={path} fill="none" stroke={color} strokeWidth="2"/></svg>;
}

const changeText = (item: NowTrendItem) => item.changePct === null ? "—" : `${item.changePct > 0 ? "▲" : item.changePct < 0 ? "▼" : "■"} ${Math.abs(item.changePct)}%`;
const changeTone = (item: NowTrendItem) => (item.changePct ?? 0) > 15 ? "up" : (item.changePct ?? 0) < -15 ? "down" : "flat";

export function NowTrending() {
  const reports = useStored(getNowReports);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ report: NowTrendReport; cached: boolean } | null>(null);
  const [sort, setSort] = useState<"change" | "level">("change");
  const report = fresh?.report ?? reports?.[0] ?? null;
  const status: DataStatus = state === "loading" ? "LOADING" : state === "error" && !report ? "ERROR" : fresh ? (fresh.cached ? "CACHED" : "LIVE") : report ? "SAVED" : "NOT ANALYZED";
  const items = useMemo(() => !report ? [] : sort === "change" ? report.items : [...report.items].sort((a, b) => b.stats.mean - a.stats.mean), [report, sort]);
  const top = report?.items[0];

  const scan = async () => {
    setState("loading"); setError("");
    try {
      // 저장된 결과가 있는데 다시 누르면 사용자의 명시적 재스캔이므로 서버 캐시를 우회한다.
      const response = await fetch("/api/trends/now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: Boolean(report) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "2030 트렌드 스캔에 실패했습니다.");
      setFresh({ report: body.report, cached: body.cached });
      saveNowReport(body.report);
      setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "2030 트렌드 스캔에 실패했습니다."); setState("error"); }
  };

  return <section className="now panel" aria-label="2030 trend scoreboard" data-testid="now-2030">
    <div className="titlebar"><span>HISCORE.EXE — 2030 NOW</span><WinButtons/></div>
    <header className="now-head">
      <div><small className="blink">● NOW TRENDING · 2030</small><h2>2030 HIGH SCORE</h2><p>웹에서 찾은 2030 트렌드 후보를 NAVER <b>19–39세</b> 검색 관심도로 검증한 순위입니다. 순위 기준은 각 키워드의 최근 상승률입니다.</p></div>
      <div className="now-actions"><DataBadge status={status} detail={report && !fresh ? formatDateTime(report.generatedAt) : undefined}/><button className="button primary" onClick={scan} disabled={state === "loading"}>{state === "loading" ? <><LoaderCircle className="spin"/>SCANNING…</> : report ? <><RotateCcw/>RESCAN</> : <><Play/>PRESS START</>}</button><span className="cost">웹 검색 1회 + NAVER 최대 3회 · 결과 12시간 캐시</span></div>
    </header>
    {state === "error" && <div className="now-error"><AlertTriangle/><p>{error}{report ? " 아래는 이전에 저장된 결과입니다." : ""}</p></div>}
    {state === "loading" && !report && <div className="now-empty"><LoaderCircle className="spin"/><p>웹 출처를 검색하고 NAVER 19–39세 데이터로 검증하고 있습니다. (약 30초)</p></div>}
    {!report && state !== "loading" && <div className="now-empty"><p className="insert">INSERT COIN</p><p>아직 스캔한 결과가 없습니다. PRESS START를 누르면 실제 웹 출처와 NAVER 데이터로 순위를 만듭니다. 데모 순위를 대신 보여주지 않습니다.</p></div>}
    {report && top && <>
      <article className="champion">
        <div className="rank-one"><span>1UP</span><b>#01</b></div>
        <div className="champ-body"><small>{top.category} · 상승률 1위</small><h3>{top.keyword}</h3><p>{top.summary}</p>
          <div className="src">{top.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{domain(source.url)}<ExternalLink/></a>)}</div></div>
        <div className="champ-stat"><strong className={changeTone(top)}>{changeText(top)}</strong><span>최근 ⅓ {top.stats.recentAvg} vs 초기 ⅓ {top.stats.earlyAvg}</span><PixelSpark series={top.series} color="var(--accent)"/><Link className="button" href={trendPath(liveTrendId(top.keyword), "why")}>WHY 분석 ▶</Link></div>
      </article>
      <div className="board-tools"><div className="chip-select" role="group" aria-label="정렬"><button type="button" aria-pressed={sort === "change"} onClick={() => setSort("change")}>상승률 순</button><button type="button" aria-pressed={sort === "level"} onClick={() => setSort("level")}>관심도 수준 순</button></div><span>{sort === "level" ? "≈ 배치 간 환산 추정치 · ≈? 정밀도 낮음" : "상승률은 키워드 자체 시계열 비율이라 배치와 무관"}</span></div>
      <ol className="board">{items.map((item, index) => <li key={item.keyword}>
        <span className="rk">{String(index + 1).padStart(2, "0")}</span>
        <div className="kw"><b>{item.keyword}</b><small>{item.category}</small></div>
        <PixelSpark series={item.series} color={changeTone(item) === "up" ? "var(--accent)" : changeTone(item) === "down" ? "var(--pink)" : "var(--mint)"}/>
        <span className={`chg ${changeTone(item)}`}>{changeText(item)}</span>
        <span className="lvl" title="NAVER 19–39세 상대 지수(첫 배치 척도)">LV {precisionLabel[item.levelPrecision]}{Math.round(item.stats.mean)}</span>
        <span className="srcs">{item.sources.slice(0, 2).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{domain(source.url)}</a>)}</span>
        <Link className="go" href={trendPath(liveTrendId(item.keyword), "why")} aria-label={`${item.keyword} WHY 분석`}>▶</Link>
      </li>)}</ol>
      {report.insufficient.length > 0 && <p className="dropped">검색 데이터 부족으로 제외: {report.insufficient.map((item) => item.keyword).join(", ")}</p>}
      <details className="method"><summary>HOW THIS SCORE WORKS · 후보 {report.items.length + report.insufficient.length}개 · 웹 출처 {report.searchedSources}개 · 출처 미검증 제외 {report.droppedUnverified}개</summary><ul>{report.methodology.map((line) => <li key={line}>{line}</li>)}<li>대상: {report.audience.label} · 기간 {report.period.startDate}~{report.period.endDate} ({report.period.timeUnit}) · 앵커 {report.anchor ?? "—"} · {report.model} · {formatDateTime(report.generatedAt)}</li></ul></details>
    </>}
    <style jsx>{`.now{padding:0;overflow:hidden;margin-bottom:16px}.now-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:24px;border-bottom:2px solid var(--border);background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(36,36,36,.015) 3px 4px)}.now-head small{font-size:12px;color:var(--pink);letter-spacing:.12em}.now-head h2{font-family:var(--font-display);font-size:clamp(20px,2.6vw,30px);margin:12px 0 10px;color:var(--title)}.now-head p{font-size:13px;color:var(--muted);margin:0;max-width:620px;line-height:1.7}.now-head p b{color:var(--accent)}.now-actions{display:grid;justify-items:end;gap:8px;flex:0 0 auto}.now-actions .button :global(svg){width:14px}.cost{font-size:11px;color:#6d6d6d}.now-error{display:flex;gap:10px;align-items:center;margin:16px 24px 0;padding:12px;border:2px solid #d590a2;background:#edf2fa;color:#942348;font-size:12px}.now-error :global(svg){width:16px;flex:0 0 auto}.now-error p{margin:0}.now-empty{min-height:170px;display:grid;place-content:center;justify-items:center;text-align:center;gap:6px;padding:28px}.now-empty p{font-size:12px;color:var(--muted);max-width:520px;line-height:1.7;margin:0}.insert{font-family:var(--font-display);font-size:16px!important;color:var(--yellow)!important;animation:blink 1s steps(1) infinite}.champion{display:grid;grid-template-columns:120px 1fr 240px;gap:22px;align-items:center;padding:24px;border-bottom:2px dashed var(--border);background:linear-gradient(90deg,rgba(24,24,167,.08),transparent 60%)}.rank-one{display:grid;justify-items:center;gap:6px;border:1px solid var(--bevel-dk);background:var(--well);padding:14px 8px;box-shadow:var(--sink)}.rank-one span{font-size:12px;color:var(--pink);animation:blink 1.2s steps(1) infinite}.rank-one b{font-family:var(--font-display);font-size:28px;color:var(--title)}.champ-body small{font-size:12px;color:var(--mint)}.champ-body h3{font-family:var(--font-display);font-size:clamp(18px,2.6vw,30px);margin:10px 0;line-height:1.4}.champ-body p{font-size:13px;color:var(--muted);line-height:1.7;margin:0 0 10px}.src{display:flex;flex-wrap:wrap;gap:6px}.src a{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--accent);border:1px solid #d0d0e4;padding:3px 6px}.src a :global(svg){width:10px}.champ-stat{display:grid;gap:8px;justify-items:start}.champ-stat strong{font-family:var(--font-display);font-size:22px}.champ-stat span{font-size:12px;color:#606060}.up{color:var(--accent)}.down{color:var(--pink)}.flat{color:var(--mint)}.board-tools{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 24px;flex-wrap:wrap}.board-tools>span{font-size:11px;color:#6d6d6d}.board{list-style:none;margin:0;padding:0 24px 10px}.board li{display:grid;grid-template-columns:34px minmax(0,1.3fr) 120px 92px 64px minmax(0,1fr) 28px;gap:12px;align-items:center;padding:10px 0;border-top:1px dashed var(--border)}.board li:nth-child(-n+3) .rk{color:var(--yellow)}.rk{font-family:var(--font-display);font-size:13px;color:#6d6d6d}.kw b{display:block;font-size:13px}.kw small{font-size:11px;color:#6d6d6d}.chg{font-size:13px;text-align:right}.lvl{font-size:12px;color:#43507a;text-align:right}.srcs{display:flex;gap:6px;flex-wrap:wrap;min-width:0}.srcs a{font-size:11px;color:var(--mint);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}.go{font-size:13px;color:var(--accent);text-align:center;border:1px solid #d0d0e4;padding:3px 0}.go:hover{background:var(--accent);color:#edf2fa}.dropped{font-size:12px;color:#6d6d6d;padding:0 24px;margin:4px 0 12px}.method{margin:0 24px 22px;border:2px dashed var(--border);padding:10px 12px}.method summary{font-size:12px;color:var(--mint);cursor:pointer}.method ul{margin:10px 0 0;padding-left:16px;font-size:12px;color:#505050;line-height:1.8}.spark{display:block;image-rendering:pixelated}@media(max-width:900px){.champion{grid-template-columns:90px 1fr}.champ-stat{grid-column:1/-1}.board li{grid-template-columns:28px minmax(0,1fr) 84px 52px 24px}.board li :global(.spark),.board li .srcs{display:none}}@media(max-width:600px){.now-head{flex-direction:column;align-items:stretch}.now-actions{justify-items:start}.champion{grid-template-columns:1fr}.rank-one{justify-self:start;grid-auto-flow:column}}`}</style>
  </section>;
}
