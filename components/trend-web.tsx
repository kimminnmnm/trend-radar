"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, useNodesState, type Edge, type Node } from "@xyflow/react";
import { AlertTriangle, ArrowRightLeft, BookmarkPlus, GitMerge, LoaderCircle, Network, RotateCcw, Search, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { connectionContextOf, connectionRunId, phenomenonContextOf, phenomenonQuery, phenomenonTrendId, type ConnectionRun } from "@/lib/discovery";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import { buildTrendWebGraph, isTrendWebPayload, trendWebCategories, trendWebSavedItemId, trendWebSessionId, type TrendWebCategory, type TrendWebGraph, type TrendWebNode, type TrendWebSession, type TrendWebStatus } from "@/lib/trend-web";
import { getConnectionRuns, getDiscoveryReports, getLiveAnalyses, getSavedItems, getTrendWebSessions, saveConnectionRun, saveTrendWebSession } from "@/lib/storage";
import { saveItemEverywhere } from "@/lib/saved-items-cloud";
import { useStored } from "@/lib/use-stored";
import { ConnectionResults } from "./connection-results";
import { DataBadge, WinButtons } from "./ui";

const COLORS: Record<TrendWebCategory, string> = { MAIN: "#1f2fe0", PHENOMENON: "#ff4fa3", ENTITY: "#7b3fb5", BEHAVIOR: "#0a8f88", KEYWORD: "#d07a00" };
const STATUS: Record<TrendWebStatus, { label: string; dash?: string }> = { OBSERVED: { label: "OBSERVED" }, EMERGING: { label: "EMERGING", dash: "6 4" }, SUGGESTED: { label: "SUGGESTED", dash: "2 5" } };
const INITIAL_NODES = 16;

const layout = (nodes: TrendWebNode[]) => {
  const main = nodes.find((node) => node.category === "MAIN");
  const columns: Record<Exclude<TrendWebCategory, "MAIN">, number> = { PHENOMENON: -650, BEHAVIOR: -330, ENTITY: 330, KEYWORD: 650 };
  const result = new Map<string, { x: number; y: number }>();
  if (main) result.set(main.id, { x: 0, y: 0 });
  for (const category of ["PHENOMENON", "BEHAVIOR", "ENTITY", "KEYWORD"] as const) {
    const group = nodes.filter((node) => node.category === category);
    group.forEach((node, index) => result.set(node.id, { x: columns[category], y: (index - (group.length - 1) / 2) * 145 }));
  }
  return result;
};
const pairMatches = (run: ConnectionRun, a: string, b: string, days: number) => run.window.days === days && new Set([run.a.toLocaleLowerCase("ko-KR"), run.b.toLocaleLowerCase("ko-KR")]).size === 2 && [run.a, run.b].every((value) => [a, b].some((other) => other.localeCompare(value, "ko", { sensitivity: "base" }) === 0));

function TrendWebCanvas({ graph, selected, onSelect, filters, expanded }: { graph: TrendWebGraph; selected: string[]; onSelect: (id: string) => void; filters: { query: string; category: TrendWebCategory | "ALL"; evidence: TrendWebStatus | "ALL"; days: number }; expanded: Set<string> }) {
  const positions = useMemo(() => layout(graph.nodes), [graph.nodes]);
  const initialIds = useMemo(() => new Set([...graph.nodes.slice(0, INITIAL_NODES).map((node) => node.id), ...expanded, ...selected]), [graph.nodes, expanded, selected]);
  const cutoff = new Date(`${graph.window.to}T23:59:59Z`).getTime() - filters.days * 86_400_000;
  const visible = useMemo(() => graph.nodes.filter((node) => {
    if (!initialIds.has(node.id)) return false;
    if (filters.category !== "ALL" && node.category !== filters.category) return false;
    if (filters.evidence !== "ALL" && node.evidenceStatus !== filters.evidence) return false;
    if (filters.query && !`${node.keyword} ${node.aliases.join(" ")}`.toLocaleLowerCase("ko-KR").includes(filters.query.toLocaleLowerCase("ko-KR"))) return false;
    if (node.lastObserved && Date.parse(node.lastObserved) < cutoff) return false;
    return true;
  }), [graph.nodes, initialIds, filters, cutoff]);
  const ids = useMemo(() => new Set(visible.map((node) => node.id)), [visible]);
  const baseNodes = useMemo<Node[]>(() => visible.map((item) => ({
    id: item.id, position: positions.get(item.id) ?? { x: 0, y: 0 }, className: `tw-node tw-${item.evidenceStatus.toLowerCase()}${selected.includes(item.id) ? " tw-selected" : ""}`,
    data: { label: <span className="tw-label"><b>{item.keyword}</b><small>{item.category} · {STATUS[item.evidenceStatus].label}</small><em>근거 {item.independentSourceCount}곳 · {item.evidenceScore}</em></span> },
    style: { width: item.category === "MAIN" ? 190 : Math.max(150, Math.min(220, 130 + item.keyword.length * 4)), borderColor: COLORS[item.category], borderWidth: selected.includes(item.id) ? 4 : item.category === "MAIN" ? 3 : 2, borderStyle: item.evidenceStatus === "OBSERVED" ? "solid" : "dashed", background: item.category === "MAIN" ? "#eef1ff" : "#fff" },
  })), [visible, positions, selected]);
  const [rendered, setRendered, onNodesChange] = useNodesState(baseNodes);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setRendered((current) => baseNodes.map((node) => ({ ...node, position: current.find((item) => item.id === node.id)?.position ?? node.position }))));
    return () => cancelAnimationFrame(frame);
  }, [baseNodes, setRendered]);
  const edges = useMemo<Edge[]>(() => graph.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)).map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, type: "straight", label: edge.type.replaceAll("_", " "), interactionWidth: 24, style: { stroke: edge.status === "SUGGESTED" ? "#8b8e98" : "#526079", strokeWidth: 1 + edge.strength * 3, strokeDasharray: STATUS[edge.status].dash, opacity: .82 }, labelStyle: { fontSize: 9, fill: "#555d70", fontWeight: 700 }, labelBgStyle: { fill: "#fff", fillOpacity: .88 }, labelBgPadding: [4, 2] as [number, number] })), [graph.edges, ids]);
  return <div className="tw-canvas" data-testid="trend-web-canvas"><ReactFlow nodes={rendered} edges={edges} onNodesChange={onNodesChange} onNodeClick={(_, node) => onSelect(node.id)} fitView minZoom={.25} maxZoom={1.8} proOptions={{ hideAttribution: true }}>
    <Background gap={28} size={1} color="#cbd1dc"/><Controls showInteractive={false}/><MiniMap nodeColor={(node) => COLORS[(graph.nodes.find((item) => item.id === node.id)?.category ?? "KEYWORD")]} maskColor="rgba(230,235,244,.65)" pannable zoomable/>
  </ReactFlow></div>;
}

/** 연결 유형별 제작 버튼 이름. 근거가 1곳이거나 없는 관계를 "관측된" 콘텐츠로 부르지 않는다. */
const createLabel: Record<ConnectionRun["connections"][number]["type"], string> = { "OBSERVED CONNECTION": "CREATE OBSERVED CONTENT", "EMERGING SIGNAL": "CREATE CONTENT · EMERGING SIGNAL", "CREATIVE HYPOTHESIS": "CREATE CONCEPT · HYPOTHESIS (근거 없음)" };

export function TrendWeb() { return <ReactFlowProvider><TrendWebView/></ReactFlowProvider>; }

function TrendWebView() {
  const storedReports = useStored(getDiscoveryReports);
  const storedSessions = useStored(getTrendWebSessions);
  const storedSavedItems = useStored(getSavedItems);
  const storedRuns = useStored(getConnectionRuns);
  const storedSnapshots = useStored(getLiveAnalyses);
  const reports = useMemo(() => storedReports ?? [], [storedReports]);
  const sessions = useMemo(() => storedSessions ?? [], [storedSessions]);
  const savedItems = useMemo(() => storedSavedItems ?? [], [storedSavedItems]);
  const runs = useMemo(() => storedRuns ?? [], [storedRuns]);
  const snapshots = useMemo(() => storedSnapshots ?? [], [storedSnapshots]);
  const cloudSessions = useMemo(() => savedItems.flatMap((item) => isTrendWebPayload(item.payload) ? [item.payload.session] : []), [savedItems]);
  const available = useMemo(() => {
    const byId = new Map<string, TrendWebGraph>();
    for (const report of reports) byId.set(report.id, buildTrendWebGraph(report));
    for (const session of [...cloudSessions, ...sessions]) if (!byId.has(session.graph.reportId)) byId.set(session.graph.reportId, session.graph);
    return [...byId.values()].sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
  }, [reports, sessions, cloudSessions]);
  const [requestedSessionId] = useState(() => typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("trendWeb"));
  const [reportId, setReportId] = useState<string | null>(null);
  const requestedSession = [...sessions, ...cloudSessions].find((item) => item.id === requestedSessionId);
  // 세션 ID는 trend-web-{보고서 ID}다. 아직 저장된 세션이 없는 분석도 주소만으로 다시 연다(새로고침 복원).
  const requestedReportId = requestedSession?.graph.reportId ?? (requestedSessionId?.startsWith("trend-web-") ? requestedSessionId.slice("trend-web-".length) : null);
  const graph = available.find((item) => item.reportId === reportId) ?? available.find((item) => item.reportId === requestedReportId) ?? available[0] ?? null;
  const restored = graph ? [...sessions, ...cloudSessions].find((item) => item.graph.reportId === graph.reportId) : undefined;
  const [mode, setMode] = useState<"explore" | "select">("explore");
  const [selected, setSelected] = useState<string[]>(restored?.selectedNodeIds ?? []);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<TrendWebCategory | "ALL">("ALL");
  const [evidence, setEvidence] = useState<TrendWebStatus | "ALL">("ALL");
  const [period, setPeriod] = useState(90);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(restored?.selectedConnectionId ?? null);
  const [hydratedReportId, setHydratedReportId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const run = runs.find((item) => item.id === runId) ?? null;
  const detail = graph?.nodes.find((node) => node.id === detailId) ?? null;
  const detailReport = graph ? reports.find((item) => item.id === graph.reportId) : undefined;
  const detailSignal = detail?.sourceSignalId ? detailReport?.signals.find((item) => item.signalId === detail.sourceSignalId) : undefined;
  const detailContext = detailReport && detailSignal ? phenomenonContextOf(detailReport.id, detailReport, detailSignal) : null;
  const picked = graph ? selected.map((id) => graph.nodes.find((node) => node.id === id)).filter((item): item is TrendWebNode => Boolean(item)) : [];
  const filterCutoff = graph ? new Date(`${graph.window.to}T23:59:59Z`).getTime() - period * 86_400_000 : 0;
  const visibleSelected = picked.filter((node) => {
    if (category !== "ALL" && node.category !== category) return false;
    if (evidence !== "ALL" && node.evidenceStatus !== evidence) return false;
    if (query && !`${node.keyword} ${node.aliases.join(" ")}`.toLocaleLowerCase("ko-KR").includes(query.toLocaleLowerCase("ko-KR"))) return false;
    if (node.lastObserved && Date.parse(node.lastObserved) < filterCutoff) return false;
    return true;
  }).length;

  useEffect(() => {
    if (!graph || hydratedReportId === graph.reportId) return;
    const frame = requestAnimationFrame(() => {
      setSelected(restored?.selectedNodeIds ?? []);
      setConnectionId(restored?.selectedConnectionId ?? null);
      // 페이지 이동·새로고침 복원: 두 노드를 고른 세션이면 선택 모드로 열고, 그 두 노드의 저장된 연결 분석 결과를 다시 붙인다(새로 호출하지 않음).
      const pair = (restored?.selectedNodeIds ?? []).map((id) => graph.nodes.find((node) => node.id === id)?.keyword).filter((keyword): keyword is string => Boolean(keyword));
      const savedRun = pair.length === 2 ? runs.find((item) => pairMatches(item, pair[0], pair[1], graph.window.days)) : undefined;
      if (pair.length === 2) setMode("select");
      setRunId(savedRun?.id ?? null);
      setDetailId(restored?.selectedPhenomenonId ? graph.nodes.find((node) => node.sourceSignalId === restored.selectedPhenomenonId)?.id ?? null : null);
      setHydratedReportId(graph.reportId);
    });
    return () => cancelAnimationFrame(frame);
  }, [graph, restored, hydratedReportId, runs]);

  const persistSession = (nextSelected = selected, nextConnection = connectionId) => {
    if (!graph) return null;
    const selectedPhenomenonId = detail?.sourceSignalId ?? restored?.selectedPhenomenonId;
    const session: TrendWebSession = { id: trendWebSessionId(graph.reportId), graph, selectedNodeIds: [...new Set(nextSelected)].slice(0, 2), ...(nextConnection ? { selectedConnectionId: nextConnection } : {}), ...(selectedPhenomenonId ? { selectedPhenomenonId } : {}), updatedAt: new Date().toISOString() };
    saveTrendWebSession(session);
    return session;
  };
  const onNode = (id: string) => {
    setDetailId(id);
    if (mode === "explore") return;
    const next = selected.includes(id) ? selected.filter((item) => item !== id) : selected.length < 2 ? [...selected, id] : [selected[1], id];
    setSelected(next); setConnectionId(null); persistSession(next, null);
  };
  const analyze = async () => {
    if (!graph || picked.length !== 2 || state === "loading") return;
    const cached = runs.find((item) => pairMatches(item, picked[0].keyword, picked[1].keyword, graph.window.days));
    if (cached) { setRunId(cached.id); setConnectionId(cached.connections[0]?.connectionId ?? null); return; }
    if (!window.confirm(`${picked[0].keyword} × ${picked[1].keyword}의 실제 연결을 검색할까요?\n저장 캐시가 없어 /api/discover/connections가 실행됩니다(OpenAI 비용 가중치 4, YouTube 최대 2회). Instagram 신규 해시태그 검색은 하지 않습니다.`)) return;
    setState("loading"); setError("");
    try {
      const response = await apiFetch("/api/discover/connections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ a: picked[0].keyword, b: picked[1].keyword, days: graph.window.days, context: `TREND WEB · ${graph.mainKeyword}`, force: false }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || "연결 분석에 실패했습니다.");
      const generatedAt = new Date().toISOString();
      const next: ConnectionRun = { id: connectionRunId(picked[0].keyword, picked[1].keyword, graph.window.days, generatedAt), a: body.a ?? picked[0].keyword, b: body.b ?? picked[1].keyword, window: body.window, termsA: body.termsA ?? [picked[0].keyword], termsB: body.termsB ?? [picked[1].keyword], connections: body.connections ?? [], ledger: body.ledger ?? [], limitations: body.limitations ?? [], generatedAt };
      saveConnectionRun(next); setRunId(next.id); setConnectionId(next.connections[0]?.connectionId ?? null); setState("idle");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "연결 분석에 실패했습니다."); setState("error"); }
  };
  const saveWorkspace = async () => {
    const session = persistSession(); if (!session) return;
    const result = await saveItemEverywhere({ id: trendWebSavedItemId(session.id), type: "insight", mode: "live", title: `${session.graph.mainKeyword} — TREND WEB`, subtitle: `키워드 ${session.graph.nodes.length}개 · 연결 ${session.graph.edges.length}개 · 선택 ${session.selectedNodeIds.length}/2`, createdAt: session.graph.generatedAt, updatedAt: session.updatedAt, payload: { kind: "trend-web", session } });
    setSaveMessage(result.message);
  };
  const reset = () => { setQuery(""); setCategory("ALL"); setEvidence("ALL"); setPeriod(90); setExpanded(new Set()); setDetailId(null); };
  const matchedTrendIds = picked.map((node) => snapshots.find((snapshot) => [snapshot.trendName, ...snapshot.keywords].some((term) => term.localeCompare(node.keyword, "ko", { sensitivity: "base" }) === 0))?.trendId).filter((id): id is string => Boolean(id));
  // 아직 WHY 분석이 없는 선택 키워드(Creative Collision을 열려면 먼저 분석해야 함).
  const missingWhy = picked.filter((node) => !snapshots.some((snapshot) => snapshot.whyReport && [snapshot.trendName, ...snapshot.keywords].some((term) => term.localeCompare(node.keyword, "ko", { sensitivity: "base" }) === 0))).map((node) => node.keyword);
  const selectedConnection = run?.connections.find((item) => item.connectionId === connectionId) ?? run?.connections[0] ?? null;
  const creativeHref = matchedTrendIds.length === 2 && selectedConnection ? `/collision?mode=creative&trend=${matchedTrendIds.map(encodeURIComponent).join("&trend=")}&connection=${encodeURIComponent(selectedConnection.connectionId)}&title=${encodeURIComponent(selectedConnection.title)}&subject=${encodeURIComponent(selectedConnection.subject)}&action=${encodeURIComponent(selectedConnection.action)}&object=${encodeURIComponent(selectedConnection.object)}&direction=${encodeURIComponent(selectedConnection.direction)}&context=${encodeURIComponent(selectedConnection.context)}&evidence=${encodeURIComponent(selectedConnection.evidenceIds.join(","))}&status=${encodeURIComponent(selectedConnection.type)}` : null;

  return <section className="tw panel" data-testid="trend-web"><div className="titlebar"><span>TREND WEB.EXE — EXPLORE CONNECTED SIGNALS</span><WinButtons/></div>
    <header><div><small>● TREND WEB</small><h2>Explore Connected Signals</h2><p>저장된 Discovery 근거에서 확인된 키워드·현상·행동을 네트워크로 보여 줍니다. 노드 크기와 선 굵기는 <b>근거 신뢰도</b>이며 인기도 순위가 아닙니다.</p></div>{graph && <DataBadge status="SAVED" detail={`${graph.window.from}~${graph.window.to}`}/>}</header>
    {!graph ? <div className="empty"><Network/><h3>저장된 세부 현상 결과가 없습니다.</h3><p>위 WHAT&apos;S HAPPENING NOW?에서 키워드를 검색하면, 유료 호출 없이 그 저장 결과로 TREND WEB을 만듭니다.</p></div> : <>
      <div className="toolbar">
        <select aria-label="Trend Web report" value={graph.reportId} onChange={(event) => { setReportId(event.target.value); setHydratedReportId(null); if (window.location.pathname === "/trend-web") window.history.replaceState(null, "", `/trend-web?trendWeb=${encodeURIComponent(trendWebSessionId(event.target.value))}`); }}>{available.map((item) => <option value={item.reportId} key={item.reportId}>{item.mainKeyword} · {item.window.days}일 · {item.nodes.length} nodes</option>)}</select>
        <div className="modes" role="radiogroup" aria-label="Trend Web mode"><button role="radio" aria-checked={mode === "explore"} onClick={() => setMode("explore")}>EXPLORE MODE</button><button role="radio" aria-checked={mode === "select"} onClick={() => setMode("select")}>SELECT TWO MODE</button></div>
        <label className="search"><Search size={13}/><input aria-label="Search nodes" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search nodes"/></label>
        <select aria-label="Category filter" value={category} onChange={(event) => setCategory(event.target.value as TrendWebCategory | "ALL")}><option value="ALL">ALL CATEGORIES</option>{trendWebCategories.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label="Period filter" value={period} onChange={(event) => setPeriod(Number(event.target.value))}><option value={7}>7 DAYS</option><option value={30}>30 DAYS</option><option value={90}>90 DAYS</option></select>
        <select aria-label="Evidence filter" value={evidence} onChange={(event) => setEvidence(event.target.value as TrendWebStatus | "ALL")}><option value="ALL">ALL EVIDENCE</option><option>OBSERVED</option><option>EMERGING</option><option>SUGGESTED</option></select>
        <button className="mini" onClick={reset}><RotateCcw size={12}/>RESET</button>
      </div>
      <p className="method">{graph.methodology}</p>
      <TrendWebCanvas graph={graph} selected={selected} onSelect={onNode} filters={{ query, category, evidence, days: period }} expanded={expanded}/>
      <div className="node-picker" data-testid="trend-web-node-picker" aria-label="Trend Web node picker"><small>{mode === "select" ? "SELECT A NODE" : "OPEN NODE DETAILS"}</small>{graph.nodes.slice(0, INITIAL_NODES).map((node) => <button type="button" key={node.id} aria-pressed={selected.includes(node.id)} onClick={() => onNode(node.id)}>{node.keyword}<span>{node.category}</span></button>)}</div>
      {mode === "select" && <div className="selection" data-testid="trend-web-selection"><small>SELECTED TRENDS</small><b>A: {picked[0]?.keyword ?? "—"}</b><b>B: {picked[1]?.keyword ?? "—"}</b><button className="mini" disabled={picked.length !== 2} onClick={() => { const next = [selected[1], selected[0]].filter(Boolean); setSelected(next); persistSession(next); }}><ArrowRightLeft size={12}/>SWAP</button><button className="mini" disabled={!selected.length} onClick={() => { setSelected([]); setConnectionId(null); persistSession([], null); }}>CLEAR</button><button className="button primary" disabled={picked.length !== 2 || state === "loading"} onClick={() => void analyze()}>{state === "loading" ? <><LoaderCircle className="spin"/>ANALYZING</> : <><GitMerge size={13}/>ANALYZE CONNECTION</>}</button>{visibleSelected < selected.length && <span>필터로 선택 노드 {selected.length - visibleSelected}개가 숨겨졌지만 선택은 유지됩니다.</span>}</div>}
      {detail && <aside className="detail" data-testid="trend-web-detail"><div><small>{detail.category} · {detail.evidenceStatus}</small><h3>{detail.keyword}</h3><p>{detail.relatedPhenomena.join(" · ") || "연결된 세부 현상 없음"}</p></div><dl><div><dt>근거</dt><dd>{detail.independentSourceCount}개 독립 출처 · {detail.sourceCount}건</dd></div><div><dt>플랫폼</dt><dd>{detail.platforms.join(" · ") || "확인되지 않음"}</dd></div><div><dt>관측 기간</dt><dd>{detail.firstObserved ? `${detail.firstObserved} ~ ${detail.lastObserved}` : "확인되지 않음"}</dd></div><div><dt>점수</dt><dd>{detail.evidenceScore}/100 · 인기도 아님</dd></div></dl><div className="detail-actions"><button className="button" onClick={() => { const neighbors = graph.edges.flatMap((edge) => edge.source === detail.id ? [edge.target] : edge.target === detail.id ? [edge.source] : []); setExpanded(new Set([...expanded, detail.id, ...neighbors])); }}>EXPAND CONNECTIONS</button>{detailContext && <><Link className="button" href={`${trendPath(phenomenonTrendId(detailContext), "why")}?${phenomenonQuery(detailContext)}`}>EXPLORE WHY</Link><Link className="button" href={`/studio?${phenomenonQuery(detailContext)}`}>CREATE CONTENT</Link></>}<button className="button" onClick={() => void saveWorkspace()}><BookmarkPlus size={13}/>SAVE</button></div></aside>}
      {state === "error" && <p className="error"><AlertTriangle size={14}/>{error}</p>}
      {run && <div className="connections"><ConnectionResults run={run} savedIds={new Set(savedItems.map((item) => item.id))} selectedConnectionId={selectedConnection?.connectionId ?? null} onSelectConnection={(connection) => { setConnectionId(connection.connectionId); persistSession(selected, connection.connectionId); }}/>{selectedConnection && <div className="next" data-testid="trend-web-next"><Link className="button primary" href={`/studio?${phenomenonQuery(connectionContextOf(run, selectedConnection))}`} data-testid="trend-web-create">{createLabel[selectedConnection.type]}</Link>{creativeHref ? <Link className="button" href={creativeHref}><Sparkles size={13}/>CREATIVE COLLISION</Link> : <span data-testid="trend-web-collision-locked">Creative Collision은 두 키워드 모두 저장된 WHY 분석이 있어야 열립니다. 먼저 분석할 키워드: {missingWhy.map((keyword, index) => <span key={keyword}>{index > 0 ? " · " : ""}<Link href={trendPath(liveTrendId(keyword), "why")}>{keyword} WHY 분석</Link></span>)}</span>}</div>}</div>}
      <div className="footer"><button className="button" onClick={() => void saveWorkspace()}><BookmarkPlus size={13}/>SAVE TREND WEB</button>{saveMessage && <span>{saveMessage}</span>}<span>노드 {graph.nodes.length} · 연결 {graph.edges.length} · 최대 36개</span></div>
    </>}
    <style jsx>{`
      .tw{padding:0;overflow:hidden;margin-bottom:16px}.tw header{display:flex;justify-content:space-between;gap:20px;padding:22px 24px;border-bottom:1.5px solid var(--ink)}.tw header small{color:var(--pink);font-weight:800;letter-spacing:.12em}.tw h2{font-family:var(--font-display);margin:8px 0;font-size:24px}.tw header p{margin:0;max-width:760px;font-size:12.5px;line-height:1.65;color:var(--muted)}.tw header p b{color:var(--ink)}
      .empty{padding:32px;display:grid;justify-items:center;text-align:center;gap:8px}.empty h3,.empty p{margin:0}.empty p{font-size:12px;color:var(--muted)}.toolbar{padding:12px 16px;display:flex;gap:6px;align-items:center;flex-wrap:wrap;border-bottom:1px solid var(--border);background:#edf3fa}.toolbar select,.toolbar input{height:32px;border:1.5px solid var(--ink);background:#fff;font-size:11px;padding:4px 7px}.modes{display:flex}.modes button,.mini{height:32px;border:1.5px solid var(--ink);background:#fff;font-size:10.5px;font-weight:800;padding:4px 8px;cursor:pointer}.modes button+button{border-left:0}.modes button[aria-checked=true]{background:#1f2fe0;color:#fff}.search{display:flex;align-items:center;gap:4px;background:#fff;border:1.5px solid var(--ink);padding-left:7px}.search input{border:0!important;outline:0}.mini{display:inline-flex;align-items:center;gap:4px}.method{margin:0;padding:7px 16px;background:#fff7d6;border-bottom:1px solid #d7bd62;font-size:10.5px;color:#68500a}
      .node-picker{display:flex;align-items:center;gap:5px;overflow-x:auto;padding:8px 16px;border-top:1px solid var(--ink);background:#e8edf5}.node-picker small{flex:0 0 auto;font-size:9px;font-weight:900;margin-right:3px}.node-picker button{flex:0 0 auto;display:flex;gap:5px;align-items:center;border:1.5px solid var(--ink);background:#fff;padding:5px 7px;font-size:10px;font-weight:800;cursor:pointer}.node-picker button[aria-pressed=true]{background:#f6ff3a;box-shadow:2px 2px 0 var(--ink)}.node-picker span{font-size:7.5px;color:var(--muted)}.selection{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 16px;border-top:2px solid var(--ink);border-bottom:1px solid var(--border);background:#f6ff3a}.selection small{font-weight:900}.selection b{font-size:12px;padding:3px 7px;background:#fff;border:1px solid var(--ink)}.selection span{font-size:11px;color:#6b5200}.detail{display:grid;grid-template-columns:minmax(220px,1fr) minmax(300px,1.3fr);gap:14px;padding:14px 16px;border-bottom:1px solid var(--border);background:#fff}.detail small{font-size:10px;color:var(--accent);font-weight:800}.detail h3{margin:4px 0;font-size:17px}.detail p{margin:0;font-size:12px;color:var(--muted)}.detail dl{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:0;font-size:11px}.detail dl div{display:flex;gap:5px}.detail dt{color:var(--muted)}.detail dd{margin:0}.detail-actions{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap}.connections{padding:16px;border-top:2px solid var(--ink)}.next{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}.next span{font-size:11px;color:var(--muted)}.error{margin:10px 16px;padding:10px;display:flex;gap:6px;background:#fff0f2;color:#9a1837;border:1px solid #d991a1}.footer{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--border);font-size:11px;color:var(--muted)}
      @media(max-width:760px){.tw header{flex-direction:column}.toolbar>*{max-width:100%}.detail{grid-template-columns:1fr}.detail dl{grid-template-columns:1fr}.tw-canvas{height:520px!important}.selection .button{width:100%}}
    `}</style>
    <style jsx global>{`.tw-canvas{height:620px;background:#f7fbff}.tw-canvas .react-flow__node{border-radius:5px;box-shadow:3px 3px 0 rgba(20,22,31,.2);font-family:inherit}.tw-canvas .tw-label{display:grid;gap:3px;padding:9px;text-align:left}.tw-canvas .tw-label b{font-size:12px;color:#14161f;overflow-wrap:anywhere}.tw-canvas .tw-label small{font-size:8.5px;font-weight:800;color:#61697b}.tw-canvas .tw-label em{font-size:8.5px;font-style:normal;color:#7a8190}.tw-canvas .tw-selected{box-shadow:0 0 0 4px #f6ff3a,4px 4px 0 #14161f!important}.tw-canvas .react-flow__controls{border:1.5px solid #14161f}.tw-canvas .react-flow__controls button{border-bottom:1px solid #14161f}.tw-canvas .react-flow__edge-text{letter-spacing:.03em}`}</style>
  </section>;
}
