"use client";

import Link from "next/link";
import { apiFetch } from "@/lib/api-fetch";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, LoaderCircle, Play, Plus, RotateCcw, X } from "lucide-react";
import { getIgDismissed, getIgPulseReports, getIgQuotaAudit, getIgTrackedTags, saveIgDismissed, saveIgPulseReport, saveIgTrackedTags } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import { boardItems, BOARD_WINDOW_HOURS, comparePulse, MIN_COMPARE_GAP_HOURS, nextTrackList, type PulseComparison } from "@/lib/ig-pulse-view";
import type { DataStatus, IgPulseItem, IgPulseReport } from "@/lib/types";
import { DataBadge, WinButtons, formatDateTime } from "./ui";

const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const originLabel: Record<IgPulseItem["origin"], string> = { tracked: "추적", manual: "직접", discovered: "발견" };
const rate = (value: number | null) => value === null ? "—" : value >= 10 ? String(Math.round(value)) : value.toFixed(1);
/** 이전 스캔에서 가져온 행이 최신 스캔보다 몇 시간 전에 측정됐는지 */
const ageHours = (item: IgPulseItem, latest: IgPulseReport) => Math.floor((new Date(latest.generatedAt).getTime() - new Date(item.collectedAt).getTime()) / 36e5);
const cleanTag = (value: string) => value.replace(/^#/, "").replace(/\s+/g, "");
const validTag = (value: string) => value.length > 0 && value.length <= 60 && /^[\p{L}\p{N}_]+$/u.test(value);
type QuotaStatus = { source: "meta_api"; checkedAt: string; limit: number; used: number; remaining: number; recent: Array<{ tag: string; hashtagId: string }>; searchTimesAvailable: false };

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
  const dismissedStored = useStored(getIgDismissed);
  const quotaAuditStored = useStored(getIgQuotaAudit);
  const quotaAudit = useMemo(() => quotaAuditStored ?? [], [quotaAuditStored]);
  const dismissed = useMemo(() => dismissedStored ?? [], [dismissedStored]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<{ report: IgPulseReport; cached: boolean } | null>(null);
  const [discover, setDiscover] = useState(false);
  const [allowNew, setAllowNew] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [quotaError, setQuotaError] = useState("");
  const [draft, setDraft] = useState("");
  const report = fresh?.report ?? reports?.[0] ?? null;
  // 방금 받은 결과가 저장소 갱신보다 먼저 렌더될 수 있어 함께 합친다.
  const all = useMemo(() => fresh && !(reports ?? []).some((saved) => saved.generatedAt === fresh.report.generatedAt) ? [fresh.report, ...(reports ?? [])] : reports ?? [], [fresh, reports]);
  useEffect(() => {
    const controller = new AbortController();
    void apiFetch("/api/meta/quota", { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "한도 확인 실패");
      setQuotaStatus(body as QuotaStatus);
    }).catch((reason) => { if (reason instanceof Error && reason.name !== "AbortError") setQuotaError(reason.message); });
    return () => controller.abort();
  }, []);
  const measured = useMemo(() => new Set([
    ...(reports ?? []).flatMap((saved) => saved.items.filter((item) => item.found).map((item) => item.tag.toLocaleLowerCase())),
    ...(quotaStatus?.recent.map((item) => item.tag.toLocaleLowerCase()) ?? []),
  ]), [reports, quotaStatus]);
  const rows = useMemo(() => all.length ? boardItems(all, dismissed).map((item) => ({ item, comparison: comparePulse(item, all) })) : [], [all, dismissed]);
  // 오르는 순: 전일 대비 비교가 가능한 태그만, 변화율 높은 순
  const rising = useMemo(() => rows.flatMap((row) => row.comparison.kind === "change" ? [{ ...row, change: row.comparison }] : []).sort((a, b) => b.change.changePct - a.change.changePct), [rows]);
  // 아직 기준선뿐인 태그가 처음 비교 가능해지는 시각(각 태그 첫 측정 + 20시간)
  const nextCompareAt = useMemo(() => {
    const firstSeen = new Map<string, number>();
    all.forEach((saved) => saved.items.forEach((item) => { const k = item.tag.toLocaleLowerCase(); const t = new Date(item.collectedAt).getTime(); if (t < (firstSeen.get(k) ?? Infinity)) firstSeen.set(k, t); }));
    const times = rows.filter((row) => row.comparison.kind === "baseline").map((row) => (firstSeen.get(row.item.tag.toLocaleLowerCase()) ?? Infinity) + MIN_COMPARE_GAP_HOURS * 36e5).filter(Number.isFinite);
    return times.length ? new Date(Math.min(...times)) : null;
  }, [all, rows]);
  const notFound = report?.items.filter((item) => !item.found) ?? [];
  const status: DataStatus = state === "loading" ? "LOADING" : state === "error" && !report ? "ERROR" : fresh ? (fresh.cached ? "CACHED" : "LIVE") : report ? "SAVED" : "NOT ANALYZED";
  const quota = quotaStatus ? { limit: quotaStatus.limit, usedAfter: quotaStatus.used, reserve: report?.quota.reserve ?? 6, source: "meta_api" as const, checkedAt: quotaStatus.checkedAt, recent: quotaStatus.recent } : report?.quota;
  const pendingTags = tracked.filter((tag) => !measured.has(tag.toLocaleLowerCase()));
  const expectedNew = allowNew ? Math.min(4, pendingTags.length + (discover ? 4 : 0)) : 0;
  const auditByTag = useMemo(() => new Map(quotaAudit.map((item) => [item.tag.toLocaleLowerCase(), item])), [quotaAudit]);
  const quotaRows = (quota?.recent ?? []).map((item) => ({ ...item, audit: auditByTag.get(item.tag.toLocaleLowerCase()) }));
  const nextRelease = quotaRows.map((item) => item.audit?.releaseAt).filter((value): value is string => Boolean(value)).sort()[0] ?? null;

  const addTag = (event: React.FormEvent) => {
    event.preventDefault();
    const tag = cleanTag(draft);
    if (!validTag(tag)) { setError("해시태그는 # 없이 문자, 숫자, 밑줄만 입력하세요."); setState("error"); return; }
    saveIgTrackedTags([tag, ...tracked]);
    saveIgDismissed(dismissed.filter((entry) => entry.tag.toLocaleLowerCase() !== tag.toLocaleLowerCase()));
    setDraft(""); setError(""); setState("idle");
  };

  // 추적에서 빼면 지금까지의 측정도 보드에서 숨긴다.
  const removeTag = (tag: string) => {
    saveIgTrackedTags(tracked.filter((item) => item !== tag));
    saveIgDismissed([{ tag, at: new Date().toISOString() }, ...dismissed.filter((entry) => entry.tag.toLocaleLowerCase() !== tag.toLocaleLowerCase())]);
  };

  const scan = async () => {
    setState("loading"); setError("");
    // Meta 최근 조회 목록에 있는 태그는 저장된 ID로 갱신하고, 신규 태그는 명시적 승인 때만 보낸다.
    const track = tracked.filter((tag) => measured.has(tag.toLocaleLowerCase()));
    const add = tracked.filter((tag) => !measured.has(tag.toLocaleLowerCase())).slice(0, 3);
    try {
      const response = await apiFetch("/api/trends/instagram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: Boolean(report), discover, allowNew, track, add }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || "Instagram 해시태그 스캔에 실패했습니다.");
      const next: IgPulseReport = body.report;
      setFresh({ report: next, cached: body.cached });
      saveIgPulseReport(next);
      saveIgTrackedTags(nextTrackList(tracked, next));
      setQuotaStatus((current) => current ? { ...current, checkedAt: next.quota.checkedAt ?? current.checkedAt, used: next.quota.usedAfter, remaining: Math.max(0, next.quota.limit - next.quota.usedAfter), recent: next.quota.recent ?? current.recent } : current);
      setAllowNew(false); setDiscover(false);
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
        <label className="toggle approval"><input type="checkbox" checked={allowNew} onChange={(event) => { setAllowNew(event.target.checked); if (!event.target.checked) setDiscover(false); }}/>신규 해시태그 검색 승인</label>
        <label className="toggle"><input type="checkbox" checked={discover} disabled={!allowNew} onChange={(event) => setDiscover(event.target.checked)}/>승인 범위에서 웹 후보도 찾기</label>
        <span className="cost">기본: 기존 ID 갱신만 · {allowNew ? `예상 신규 사용 최대 ${expectedNew}개` : "신규 사용 0개"}{discover ? " · 웹 검색 1회" : ""}</span>
      </div>
    </header>

    <div className="track">
      <span className="track-label">추적 중 {tracked.length}/10</span>
      {tracked.map((tag) => <span key={tag} className={`chip ${measured.has(tag.toLocaleLowerCase()) ? "" : "pending"}`} title={measured.has(tag.toLocaleLowerCase()) ? "기존 hashtag ID로 갱신합니다. 주간 한도를 쓰지 않습니다" : "신규 검색 승인을 켜야 조회합니다(한도 최대 1개 사용)"}>#{tag}<button type="button" aria-label={`${tag} 추적 해제`} onClick={() => removeTag(tag)}><X/></button></span>)}
      <form onSubmit={addTag} className="add"><input aria-label="추적할 해시태그" placeholder="#치이카와" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={61}/><button className="button" type="submit" disabled={!draft.trim() || tracked.length >= 10}><Plus/>추가</button></form>
      {quota && <span className="quota" title={`Meta 7일 고유 해시태그 한도. ${quota.reserve}개는 수동 검색용 예비`}>주간 한도 <span className="progress-seg" aria-hidden><i style={{ width: `${Math.min(100, (quota.usedAfter / quota.limit) * 100)}%` }}/></span>{quota.usedAfter}/{quota.limit} · 남음 {Math.max(0, quota.limit-quota.usedAfter)} · {quota.source==="meta_api"?"Meta API 실측":"저장 기록 추정"}</span>}
    </div>

    {quota && <details className="quota-audit"><summary>최근 7일 고유 해시태그 {quota.usedAfter}개 · 호출 기록과 슬롯 반환 시각</summary><div className="quota-summary"><b>신규 검색 예상 사용: {expectedNew}개</b><span>{nextRelease ? `앱에서 기록한 다음 반환 예정: ${formatDateTime(nextRelease)}` : "Meta API는 검색 시각을 제공하지 않아 기존 사용분의 정확한 반환 시각은 알 수 없습니다."}</span>{quotaError&&<em>{quotaError}</em>}</div><ol>{quotaRows.map((item)=><li key={item.hashtagId}><span>#{item.tag}</span><small>{item.audit?`${formatDateTime(item.audit.searchedAt)} 검색 · ${formatDateTime(item.audit.releaseAt)} 반환 예정 · ${item.audit.source==="pulse"?"Overview 스캔":"수동 검색"}`:"Meta 목록 실측 · 검색 시각 미제공"}</small></li>)}</ol></details>}

    {state === "error" && <div className="pulse-error"><AlertTriangle/><p>{error}{report ? " 아래는 이전에 저장된 결과입니다." : ""}</p></div>}
    {state === "loading" && !report && <div className="pulse-empty"><LoaderCircle className="spin"/><p>해시태그 후보를 찾고 Instagram 최근 게시물을 넘겨받아 세고 있습니다. (약 1–2분)</p></div>}
    {!report && state !== "loading" && <div className="pulse-empty"><p className="insert">NO SIGNAL</p><p>아직 측정한 해시태그가 없습니다. 추적할 태그를 추가하면 기존 검색 태그는 바로 갱신하고, 신규 태그는 별도 승인을 켠 경우에만 검색합니다.</p><Link href="/discover">NAVER DataLab 기반 트렌드 보기</Link></div>}

    {report && <>
      <div className="boards">
        <section className="col" aria-label="전일 대비 오르는 해시태그">
          <header className="col-head"><b>▲ 오르는 순</b><span>전일 대비 · {MIN_COMPARE_GAP_HOURS}시간 이상 간격의 같은 방식 측정끼리 비교</span></header>
          {rising.length ? <ol className="board rising">{rising.map(({ item, comparison, change }, index) => <li key={item.tag}>
            <span className="rk">{String(index + 1).padStart(2, "0")}</span>
            <div className="kw"><b>#{item.tag}</b><small>{rate(change.previous.perHour)}/h → {rate(item.perHour)}/h · {Math.round((new Date(item.collectedAt).getTime() - new Date(change.previous.collectedAt).getTime()) / 36e5)}시간 간격</small></div>
            <ChangeCell comparison={comparison}/>
            <Link className="go" href={trendPath(liveTrendId(item.keyword ?? item.tag), "why")} aria-label={`${item.keyword ?? item.tag} WHY 분석`}>▶</Link>
          </li>)}</ol> : <div className="col-empty" data-testid="rising-empty"><p>아직 비교할 측정이 없습니다.</p><p>같은 태그를 {MIN_COMPARE_GAP_HOURS}시간 이상 지나 다시 재면 여기에 오르는 순서대로 표시됩니다.{nextCompareAt && <> <b>{formatDateTime(nextCompareAt.toISOString())} 이후 RESCAN하면 비교됩니다.</b></>}</p></div>}
          {rising.length > 0 && rows.length > rising.length && <p className="col-note">기준선만 있는 태그 {rows.length - rising.length}개는 다음 측정부터 비교됩니다.</p>}
        </section>
        <section className="col" aria-label="많이 올라오는 해시태그">
          <header className="col-head"><b>● 많이 올라오는 순</b><span>시간당 게시물 수 · 최근 {BOARD_WINDOW_HOURS}시간 스캔 합산</span></header>
          {rows.length ? <ol className="board activity">{rows.map(({ item }, index) => <li key={item.tag}>
            <span className="rk">{String(index + 1).padStart(2, "0")}</span>
            <div className="kw"><b>#{item.tag}</b><small>{originLabel[item.origin]}{item.category ? ` · ${item.category}` : ""}{item.keyword && item.keyword.replace(/\s+/g, "") !== item.tag ? ` · ${item.keyword}` : ""}{report && ageHours(item, report) >= 1 && <em> · {ageHours(item, report)}시간 전 측정</em>}</small>
              <span className="links">{item.samplePosts[0] && <a href={item.samplePosts[0].permalink} target="_blank" rel="noreferrer" title="가장 최근 게시물">최근 게시물<ExternalLink/></a>}{item.sources.slice(0, 1).map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer" title={item.summary}>{domain(source.url)}</a>)}</span></div>
            <span className="rate" title={item.rateBasis === "24h-full" ? "24시간 평균" : `최근 ${item.spanHours ?? "?"}시간 표본 기준`}><b>{rate(item.perHour)}</b>/h{item.rateBasis === "recent-sample" && <i>*</i>}</span>
            <VolumeCell item={item}/>
            <Link className="go" href={trendPath(liveTrendId(item.keyword ?? item.tag), "why")} aria-label={`${item.keyword ?? item.tag} WHY 분석`}>▶</Link>
          </li>)}</ol> : <p className="col-empty">측정된 해시태그가 없습니다.</p>}
        </section>
      </div>
      {notFound.length > 0 && <p className="dropped">Instagram에 해시태그가 없음: {notFound.map((item) => `#${item.tag}`).join(", ")}</p>}
      {report.deferred.length > 0 && <p className="dropped">보류(다음 스캔): {report.deferred.map((item) => `#${item.tag}`).join(", ")} — {report.deferred[0].reason}</p>}
      {report.failed.length > 0 && <p className="dropped">측정 실패: {report.failed.map((item) => `#${item.tag}`).join(", ")} · 기존 저장 결과와 NAVER DataLab 분석은 계속 사용할 수 있습니다.</p>}
      <details className="method"><summary>HOW THIS IS MEASURED · 측정 {report.items.length}개 · 웹 출처 {report.searchedSources}개 · 출처 미검증 제외 {report.droppedUnverified}개</summary><ul>{report.methodology.map((line) => <li key={line}>{line}</li>)}<li>* 표시: 게시물이 많아 최근 일부만 받은 태그의 표본 속도 · {report.model ?? "웹 검색 없음"} · {formatDateTime(report.generatedAt)}</li></ul></details>
    </>}
    <style jsx>{`.pulse{padding:0;overflow:hidden;margin-bottom:28px}.pulse-head{display:flex;justify-content:space-between;gap:24px;align-items:flex-end;padding:22px 24px;border-bottom:1px solid var(--line)}.pulse-head small{font-size:12px;color:var(--pink);letter-spacing:.1em}.pulse-head h2{font-family:var(--font-display);font-size:clamp(20px,2.6vw,30px);margin:10px 0;color:var(--title)}.pulse-head p{font-size:13px;color:var(--muted);margin:0;max-width:640px;line-height:1.7}.pulse-head p b{color:var(--text)}.pulse-actions{display:grid;justify-items:end;gap:8px;flex:0 0 auto}.pulse-actions .button :global(svg){width:14px}.toggle{display:flex;gap:6px;align-items:center;font-size:12px}.toggle:has(input:disabled){opacity:.55}.approval{color:var(--yellow);font-weight:700}.cost{font-size:11px;color:var(--muted)}.track{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:14px 24px;border-bottom:1px solid var(--line);background:rgba(226,243,255,.55)}.track-label{font-size:13px;font-weight:700;color:var(--title);margin-right:4px}.chip{display:inline-flex;align-items:center;gap:6px;height:32px;font-size:13px;font-weight:600;padding:0 6px 0 13px;border:1px solid #8fc4ee;border-radius:999px;background:linear-gradient(180deg,#fff 0%,#e2f2ff 100%);box-shadow:inset 0 1px 0 #fff,0 1px 3px rgba(20,90,170,.15)}.chip.pending{border-style:dashed;color:var(--muted);background:#fff}.chip button{border:0;background:rgba(20,90,170,.1);width:20px;height:20px;border-radius:50%;padding:0;cursor:pointer;display:grid;place-items:center;color:#1d5fae}.chip button:hover{background:#e0533a;color:#fff}.chip button :global(svg){width:12px;height:12px}.add{display:flex;gap:6px;margin-left:auto;align-items:center}.add input{width:170px;height:32px;padding:0 14px;font-size:13px;border-radius:999px}.add .button{height:32px;min-height:32px;padding:0 15px;font-size:13px}.add .button :global(svg){width:14px}.quota{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);width:100%;justify-content:flex-end}.quota .progress-seg{display:inline-block;width:140px;height:14px;padding:2px}.quota-audit{margin:10px 24px 16px;padding:12px;border:1px dashed var(--border);background:rgba(255,255,255,.72)}.quota-audit summary{font-size:12px;color:var(--title);cursor:pointer}.quota-summary{display:flex;gap:12px;flex-wrap:wrap;margin:12px 0;font-size:11px;color:var(--muted)}.quota-summary b{color:var(--yellow)}.quota-summary em{font-style:normal;color:var(--pink)}.quota-audit ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px 20px;margin:0;padding-left:22px}.quota-audit li{font-size:11px}.quota-audit li span{font-weight:700}.quota-audit li small{display:block;color:var(--muted);margin-top:2px}.pulse-error{display:flex;gap:10px;align-items:center;margin:14px 24px 0;padding:10px 12px;border:1px solid #7f9db9;background:#fff4f4;color:var(--pink);font-size:12px}.pulse-error :global(svg){width:16px;flex:0 0 auto}.pulse-error p{margin:0}.pulse-empty{min-height:150px;display:grid;place-content:center;justify-items:center;text-align:center;gap:6px;padding:26px}.pulse-empty p{font-size:12px;color:var(--muted);max-width:540px;line-height:1.7;margin:0}.pulse-empty a{font-size:12px;color:var(--blue);text-decoration:underline}.insert{font-family:var(--font-display);font-size:16px!important;color:var(--title)!important;animation:blink 1s steps(1) infinite}.boards{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid var(--line)}.col{min-width:0;padding:0 0 8px}.col+.col{border-left:1px solid var(--line)}.col-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:14px 20px 8px}.col-head b{font-size:13px;color:var(--title)}.col-head span{font-size:11px;color:var(--muted)}.col-empty{margin:6px 20px 12px;padding:16px;border:1px dashed var(--border);background:#fafafa;font-size:12px;color:var(--muted);line-height:1.7}.col-empty p{margin:0}.col-empty b{color:var(--text);font-weight:400}.col-note{font-size:11px;color:var(--muted);padding:0 20px;margin:6px 0 0}.board{list-style:none;margin:0;padding:0 20px}.board li{display:grid;gap:10px;align-items:center;padding:9px 0;border-top:1px dashed var(--border)}.rising li{grid-template-columns:28px minmax(0,1fr) 84px 26px}.activity li{grid-template-columns:28px minmax(0,1fr) 66px 78px 26px}.rising :global(.chg){font-size:15px}.board li:nth-child(-n+3) .rk{color:var(--pink)}.rk{font-family:var(--font-display);font-size:13px;color:var(--muted)}.kw{min-width:0}.kw b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.kw small{font-size:11px;color:var(--muted)}.kw small em{font-style:normal;color:var(--yellow)}.rate{font-size:12px;color:var(--muted);text-align:right}.rate b{font-family:var(--font-display);font-size:18px;color:var(--title);margin-right:2px}.rate i{color:var(--pink);font-style:normal}.board :global(.vol){font-size:12px;text-align:right}.board :global(.chg){font-size:13px;text-align:right}.board :global(.chg.base){font-size:12px;color:var(--muted)}.board :global(.chg.up){color:var(--accent)}.board :global(.chg.down){color:var(--pink)}.board :global(.chg.flat){color:var(--blue)}.links{display:flex;gap:8px;flex-wrap:wrap;min-width:0;margin-top:3px}.links a{display:inline-flex;align-items:center;gap:3px;font-size:11px;color:var(--blue);text-decoration:underline;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px}.links a :global(svg){width:9px}.pulse :global(.go){font-size:13px;color:#000;text-align:center;border:1.5px solid var(--ink);border-radius:6px;background:#fff;padding:3px 0;box-shadow:2px 2px 0 var(--ink)}.pulse :global(.go:hover){background:#5cf28c;color:#14161f}.dropped{font-size:12px;color:var(--muted);padding:0 24px;margin:4px 0 10px}.method{margin:4px 24px 22px;border:1px dashed var(--border);padding:10px 12px}.method summary{font-size:12px;color:var(--title);cursor:pointer}.method ul{margin:10px 0 0;padding-left:16px;font-size:12px;color:#404040;line-height:1.8}@media(max-width:1100px){.boards{grid-template-columns:1fr}.col+.col{border-left:0;border-top:1px solid var(--line)}}@media(max-width:600px){.activity li{grid-template-columns:24px minmax(0,1fr) 60px 24px}.activity li :global(.vol){display:none}.rising li{grid-template-columns:24px minmax(0,1fr) 70px 24px}.board{padding:0 14px}.col-head{padding:12px 14px 6px}.col-empty{margin:6px 14px 10px}.quota-audit ol{grid-template-columns:1fr}}@media(max-width:600px){.pulse-head{flex-direction:column;align-items:stretch}.pulse-actions{justify-items:start}.add{margin-left:0;width:100%}.add input{flex:1}.quota{justify-content:flex-start}}`}</style>
  </section>;
}
