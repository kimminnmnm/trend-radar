"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { applyNodeChanges, Background, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeChange } from "@xyflow/react";
import { ArrowRight, Eye, Info, Maximize2, Network, RotateCcw, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { buildVisualRelations, trendImages, VISUAL_EDGE_MIN, VISUAL_SCORE_WEIGHTS, type VisualRelation } from "@/lib/visual-map";
import type { VisualMedia } from "@/lib/visual-media";
import { MediaThumb } from "./media-thumb";
import { trends } from "@/lib/demo-data";
import { getCollisions, getLiveAnalyses, getRelationFeedback, saveRelationFeedback, updateLiveAnalysis } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { buildCultureGraph, edgeStyles, edgeTypeStrength, relationTypeLabels, type CultureEdge, type CultureRelation, type GraphEdgeType } from "@/lib/culture-graph";
import { collisionHref, CULTURE_CATEGORIES, demoNodeInfo, liveNodeInfo, relationPair, resolveRelationEvidence, scoreToPercent, searchMapNodes, UNCATEGORIZED, visibleRelations, withoutHiddenRelations, type MapNodeInfo } from "@/lib/culture-map-view";
import { RELATION_SCORE_WEIGHTS } from "@/lib/cultural-relationship-engine";
import { currentRelationRecords, currentVersion, versionsOf } from "@/lib/culture-pipeline";
import { readCultureLedger, syncCultureLedgerLocal } from "@/lib/culture-pipeline-client";
import { trendPath } from "@/lib/live-trend";
import { RELATION_RATING_CRITERIA, type CultureRelationFeedback, type LiveAnalysisSnapshot, type RelationRatingKey, type Trend } from "@/lib/types";
import { DataBadge, formatDateTime, PageHeader, StatusPill } from "./ui";
import { CultureCloudPanel } from "./culture-cloud-panel";

const LABEL_ALL_LIMIT = 6;
const NO_EVIDENCE_NOTICE = "이 관계는 AI가 제안한 문화적 연결 가설이며, 실제 확산 관계가 확인된 것은 아닙니다.";
const DIMENSION_KO: Record<string, string> = { Aesthetic: "미감", Emotion: "감정", Behavior: "행동", Object: "사물", Culture: "문화", Audience: "사람들" };

/* ---------- DEMO 그래프: 미리 작성한 탐색 예시. 점수·근거가 없고 DEMO로만 표시한다. ---------- */
const demoPositions: Record<string, { x: number; y: number }> = Object.fromEntries(trends.map((t, i) => [t.id, { x: [0, 230, 480, 650, 440, 170, -80, 720][i] ?? i * 120, y: [120, 0, 60, 230, 370, 350, 300, 20][i] ?? 0 }]));
const demoLinks: Array<{ source: string; target: string; label: string; semantic?: boolean }> = [
  { source: "heisei-retro", target: "digital-camera", label: "저해상도 · 기록" },
  { source: "heisei-retro", target: "character-custom", label: "꾸미기 · 개인화" },
  { source: "heisei-retro", target: "retro-game", label: "픽셀 미학", semantic: true },
  { source: "character-custom", target: "kidult", label: "수집 · 자기표현" },
  { source: "analog-log", target: "digital-camera", label: "기록 행동" },
  { source: "vocaloid", target: "character-custom", label: "팬 창작", semantic: true },
  { source: "balletcore", target: "analog-log", label: "루틴", semantic: true },
  { source: "kidult", target: "retro-game", label: "놀이 · 수집" },
];
const demoRelations: CultureRelation[] = demoLinks.map((link, index) => {
  const type: GraphEdgeType = link.semantic ? "Semantic Similarity" : "Shared Cultural Attribute";
  const edge: CultureEdge = { id: `demo:${index}`, source: link.source, target: link.target, type, relationType: relationTypeLabels[type].key, label: link.label, basis: `데모 예시 연결입니다. ‘${link.label}’이라는 키워드로 미리 작성한 탐색 예시이며, 실제 DNA와 근거로 계산한 관계가 아닙니다.`, evidenceIds: [], verificationStatus: "Creative Hypothesis", origin: "demo" };
  return { id: `demo-rel:${index}`, source: link.source, target: link.target, edges: [edge], primary: edge, score: null, scoreBreakdown: null, sharedAttributes: link.label.split(" · ").map((label) => ({ attributeId: `demo-${label}`, canonicalLabel: label, dimension: "DEMO" })), differentialAttributes: null, hasEvidence: false, aiHypothesisOnly: false };
});

/** 원형 배치. 위치는 보기 편의를 위한 것이며 유사도의 정량적 증거가 아니다. 필터가 바뀌어도 같은 노드는 같은 자리에 둔다. */
function circleLayout(ids: string[]) {
  // 노드 폭(156px)이 원주에 겹치지 않을 만큼만 벌린다. 너무 크면 fitView가 과하게 축소해 글자가 읽히지 않는다.
  const radius = Math.max(200, ids.length * 34);
  return Object.fromEntries(ids.map((id, index) => { const angle = (index / Math.max(ids.length, 1)) * Math.PI * 2 - Math.PI / 2; return [id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }]; }));
}

const mobileQuery = "(max-width: 850px)";
function subscribeMobile(callback: () => void) { const media = window.matchMedia(mobileQuery); media.addEventListener("change", callback); return () => media.removeEventListener("change", callback); }
const useIsMobile = () => useSyncExternalStore(subscribeMobile, () => window.matchMedia(mobileQuery).matches, () => false);

type Selection = { kind: "node" | "edge"; id: string } | null;
const VISUAL_EDGE = { stroke: "#c2337a", dash: "2 5", width: 2.6 };
const VISUAL_NOTICE = "Visual DNA(실제 썸네일을 AI 비전으로 관찰한 결과)의 색과 관찰 특징을 비교한 알고리즘 지표입니다. 시각적으로 닮았다는 뜻이며 문화적 관계·확산·인과를 뜻하지 않습니다.";

/** 원본 플랫폼 이미지를 노드 안에 작게 보여 준다(복제 없음). 불러오지 못하면 대체 그래픽. */
function NodeThumb({ media, name }: { media: VisualMedia | undefined; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!media?.thumbnailUrl || failed) return <span className="cm-thumb empty" role="img" aria-label={`${name} — 출처 확인된 이미지 없음`}>NO IMAGE</span>;
  // eslint-disable-next-line @next/next/no-img-element -- 외부 원본 URL을 그대로 표시한다
  return <img className="cm-thumb" src={media.thumbnailUrl} alt={`${name} 대표 이미지(${media.platform})`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} data-testid="node-thumb" />;
}

/** 두 트렌드의 실제 수집 이미지를 나란히 놓는다. 이미지 자체가 근거이며 AI 생성 이미지는 섞지 않는다. */
function ImageCompare({ sides }: { sides: Array<{ id: string; name: string; images: VisualMedia[] }> }) {
  return <div className="image-compare" data-testid="image-compare"><small>IMAGE COMPARISON · 실제 수집 이미지(REAL REFERENCE)</small><div className="ic-cols">{sides.map((side) => <div key={side.id} className="ic-col"><b>{side.name}</b>{side.images.length ? <div className="ic-grid">{side.images.slice(0, 2).map((media) => <a key={media.mediaId} href={media.sourceUrl} target="_blank" rel="noreferrer" title={media.title}><MediaThumb media={media} label={side.name} ratio="4 / 3" /></a>)}</div> : <MediaThumb media={null} label={side.name} ratio="4 / 3" />}</div>)}</div><p className="hint">원본 링크로 열립니다. 이미지는 각 플랫폼의 원본 URL을 그대로 표시하며 서버에 복제하지 않습니다.</p></div>;
}
type Focus = { id: string; nonce: number } | null;

/* ---------- React Flow 캔버스: 드래그한 위치를 보존하고, 검색·선택 시 해당 노드로 화면을 옮긴다. ---------- */
function Canvas({ nodes, edges, focus, onNode, onEdge, onPane, onReset, nodeColor, compact }: { compact: boolean; nodes: Node[]; edges: Edge[]; focus: Focus; onNode: (id: string) => void; onEdge: (id: string) => void; onPane: () => void; onReset: () => void; nodeColor: (id: string) => string }) {
  const nodeKey = nodes.map((node) => node.id).join("|");
  const [layout, setLayout] = useState<{ key: string; nodes: Node[] }>({ key: nodeKey, nodes });
  let current = layout.nodes;
  if (layout.key !== nodeKey) {
    // 표시 노드 집합이 바뀌면 기존 노드의 드래그 위치는 유지하고 새 노드만 기본 위치로 추가한다.
    current = nodes.map((node) => ({ ...node, position: layout.nodes.find((item) => item.id === node.id)?.position ?? node.position }));
    setLayout({ key: nodeKey, nodes: current });
  }
  const onNodesChange = useCallback((changes: NodeChange[]) => setLayout((state) => ({ ...state, nodes: applyNodeChanges(changes, state.nodes) })), []);
  const rendered = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return current.map((node) => { const next = byId.get(node.id); return next ? { ...node, data: next.data, style: next.style, className: next.className } : node; });
  }, [current, nodes]);
  const flow = useReactFlow();
  useEffect(() => {
    if (!focus) return;
    const timer = window.setTimeout(() => { void flow.fitView({ nodes: [{ id: focus.id }], duration: 450, maxZoom: 1.25, padding: 0.9 }); }, 40);
    return () => window.clearTimeout(timer);
  }, [focus, flow]);
  return <ReactFlow nodes={rendered} edges={edges} onNodesChange={onNodesChange} onNodeClick={(_, node) => onNode(node.id)} onEdgeClick={(_, edge) => onEdge(edge.id)} onPaneClick={onPane} fitView fitViewOptions={{ padding: 0.25 }} colorMode="light" minZoom={0.3} maxZoom={1.8} proOptions={{ hideAttribution: true }}>
    <Background color="#dadee5" gap={32} size={1} />
    <Controls showInteractive={false} />
    {!compact && <MiniMap nodeColor={(node) => nodeColor(node.id)} maskColor="rgba(234,234,234,.72)" style={{ width: 150, height: 100 }} pannable zoomable />}
    <Panel position="top-right" className="cm-view-tools">
      <button type="button" onClick={() => void flow.fitView({ duration: 350, padding: 0.25 })}><Maximize2 size={13} />Fit view</button>
      <button type="button" onClick={() => { onReset(); window.setTimeout(() => void flow.fitView({ duration: 350, padding: 0.25 }), 40); }}><RotateCcw size={13} />Reset view</button>
    </Panel>
  </ReactFlow>;
}

export function CultureMap() {
  return <ReactFlowProvider><CultureMapView /></ReactFlowProvider>;
}

function CultureMapView() {
  const snapshots = useStored(getLiveAnalyses);
  const collisions = useStored(getCollisions);
  const live = useMemo(() => (snapshots ?? []).filter((item) => item.whyReport), [snapshots]);
  const ledger = useStored(readCultureLedger);
  // 이전 버전에서 저장된 분석도 원장에 버전·관계를 채운다. 바뀐 것이 없으면 저장하지 않는다(네트워크 없음).
  useEffect(() => { if (snapshots) syncCultureLedgerLocal(snapshots); }, [snapshots]);
  const storedRelations = useMemo(() => ledger ? currentRelationRecords(ledger, live) : undefined, [ledger, live]);
  const graph = useMemo(() => buildCultureGraph(live, collisions ?? [], storedRelations), [live, collisions, storedRelations]);
  const [modeChoice, setModeChoice] = useState<"live" | "demo" | null>(null);
  const mode = modeChoice ?? (live.length ? "live" : "demo");
  const isMobile = useIsMobile();

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [minScore, setMinScore] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pick, setPick] = useState<string[]>([]);

  const nodesInfo = useMemo<MapNodeInfo[]>(() => mode === "live" ? live.map((item) => liveNodeInfo(item, graph.errors)) : trends.map(demoNodeInfo), [mode, live, graph.errors]);
  const storedFeedback = useStored(getRelationFeedback);
  const feedback = useMemo(() => storedFeedback ?? [], [storedFeedback]);
  const [showHidden, setShowHidden] = useState(false);
  const hiddenCount = mode === "live" ? graph.relations.length - withoutHiddenRelations(graph.relations, feedback, false).length : 0;
  const relations = useMemo(() => mode === "live" ? withoutHiddenRelations(graph.relations, feedback, showHidden) : demoRelations, [mode, graph.relations, feedback, showHidden]);
  const infoById = useMemo(() => new Map(nodesInfo.map((node) => [node.id, node])), [nodesInfo]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of nodesInfo) counts.set(node.category, (counts.get(node.category) ?? 0) + 1);
    return counts;
  }, [nodesInfo]);
  const categoryOptions = useMemo(() => [...CULTURE_CATEGORIES, ...(categoryCounts.has(UNCATEGORIZED) ? [UNCATEGORIZED] : [])], [categoryCounts]);
  const visibleNodes = useMemo(() => nodesInfo.filter((node) => !categories.length || categories.includes(node.category)), [nodesInfo, categories]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const shownRelations = useMemo(() => visibleRelations(relations, visibleIds, minScore / 100), [relations, visibleIds, minScore]);
  // V4 Visual Mode: 저장된 Visual DNA로만 계산하는 별도 레이어. 문화 관계 데이터·점수는 건드리지 않는다.
  const [lensChoice, setLens] = useState<"culture" | "visual">("culture");
  const [overlay, setOverlay] = useState(false);
  const visualOn = mode === "live" && lensChoice === "visual";
  const visual = useMemo(() => buildVisualRelations(live), [live]);
  const imagesById = useMemo(() => new Map(live.map((item) => [item.trendId, trendImages(item, 4)])), [live]);
  const shownVisual = useMemo(() => visual.relations.filter((relation) => visibleIds.has(relation.source) && visibleIds.has(relation.target) && relation.score >= minScore / 100), [visual.relations, visibleIds, minScore]);
  const activeLinks: Array<{ id: string; source: string; target: string }> = visualOn ? shownVisual : shownRelations;
  const matches = useMemo(() => searchMapNodes(nodesInfo, query), [nodesInfo, query]);
  const matchIds = useMemo(() => new Set(matches.map((node) => node.id)), [matches]);

  const explicitNodeId = selection?.kind === "node" && visibleIds.has(selection.id) ? selection.id : null;
  const panelNode = (explicitNodeId ? infoById.get(explicitNodeId) : visibleNodes[0]) ?? null;
  const selectedRelation = selection?.kind === "edge" && (!visualOn || overlay) ? shownRelations.find((relation) => relation.id === selection.id) ?? null : null;
  const selectedVisual: VisualRelation | null = selection?.kind === "edge" && visualOn ? shownVisual.find((relation) => relation.id === selection.id) ?? null : null;
  const neighborIds = useMemo(() => {
    if (!explicitNodeId) return null;
    const ids = new Set([explicitNodeId]);
    for (const relation of activeLinks) if (relation.source === explicitNodeId || relation.target === explicitNodeId) { ids.add(relation.source); ids.add(relation.target); }
    return ids;
  }, [explicitNodeId, activeLinks]);

  const positions = useMemo(() => mode === "live" ? circleLayout(nodesInfo.map((node) => node.id)) : demoPositions, [mode, nodesInfo]);
  const accentOf = useCallback((id: string) => {
    const node = infoById.get(id);
    if (!node) return "#777777";
    if (node.status === "DEMO") return trends.find((trend) => trend.id === id)?.accent ?? "#c27c0e";
    return node.status === "ERROR" ? "#c0392b" : node.hasDna ? "#1f50c8" : "#868686";
  }, [infoById]);

  const flowNodes = useMemo<Node[]>(() => visibleNodes.map((node) => {
    const accent = accentOf(node.id);
    const dimmed = (query.trim() && !matchIds.has(node.id)) || (neighborIds && !neighborIds.has(node.id));
    const classes = ["cm-node", `cm-${node.status.toLowerCase().replace(/\s+/g, "-")}`, matchIds.has(node.id) ? "cm-match" : "", dimmed ? "cm-dim" : "", explicitNodeId === node.id ? "cm-selected" : ""].filter(Boolean).join(" ");
    const sub = node.status === "DEMO" ? "DEMO" : node.status === "ERROR" ? "ERROR · 변환 실패" : node.hasDna ? `DNA · ${node.category}` : "DNA 미분석";
    if (visualOn) {
      const record = live.find((item) => item.trendId === node.id)?.visualDna;
      const palette = record?.result.palette.slice(0, 5) ?? [];
      return { id: node.id, position: positions[node.id] ?? { x: 0, y: 0 }, className: `${classes} cm-visual${record ? "" : " cm-no-vdna"}`, data: { label: <span className="cm-node-label"><NodeThumb media={imagesById.get(node.id)?.[0]} name={node.name} /><b>{node.name}</b>{palette.length ? <span className="cm-palette" aria-label={`관찰 팔레트 ${palette.map((color) => color.hex).join(", ")}`}>{palette.map((color) => <i key={color.hex} style={{ background: color.hex }} />)}</span> : null}<small>{record ? `Visual DNA · 이미지 ${record.media.length}` : "Visual DNA 미분석"}</small></span> }, style: { borderColor: record ? VISUAL_EDGE.stroke : "#9a9aa6", width: 172 } };
    }
    return { id: node.id, position: positions[node.id] ?? { x: 0, y: 0 }, className: classes, data: { label: <span className="cm-node-label"><b>{node.name}</b><small>{sub}</small></span> }, style: { borderColor: accent, width: 156 } };
  }), [visibleNodes, accentOf, query, matchIds, neighborIds, explicitNodeId, positions, visualOn, live, imagesById]);

  const visualEdges = useMemo<Edge[]>(() => shownVisual.map((relation) => {
    const selected = selectedVisual?.id === relation.id;
    const dimmed = (explicitNodeId && relation.source !== explicitNodeId && relation.target !== explicitNodeId) || (selectedVisual && !selected);
    return { id: relation.id, source: relation.source, target: relation.target, type: "straight", label: `시각 유사 · ${scoreToPercent(relation.score)}`, interactionWidth: 26, className: `cm-edge cm-edge-visual${selected ? " cm-edge-selected" : ""}`, ariaLabel: `${infoById.get(relation.source)?.name ?? relation.source} ↔ ${infoById.get(relation.target)?.name ?? relation.target}: 시각 유사`, style: { stroke: VISUAL_EDGE.stroke, strokeDasharray: VISUAL_EDGE.dash, strokeWidth: selected ? VISUAL_EDGE.width + 1.8 : VISUAL_EDGE.width, opacity: dimmed ? 0.16 : 0.95 }, labelStyle: { fill: "#7a1d4c", fontSize: 11, fontWeight: 700 }, labelBgStyle: { fill: "#fff5fa", fillOpacity: dimmed ? 0.3 : 0.95 }, labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 6 };
  }), [shownVisual, selectedVisual, explicitNodeId, infoById]);

  const cultureEdges = useMemo<Edge[]>(() => shownRelations.map((relation) => {
    const style = edgeStyles[relation.primary.type];
    const selected = selectedRelation?.id === relation.id;
    const dimmed = (explicitNodeId && relation.source !== explicitNodeId && relation.target !== explicitNodeId) || (selectedRelation && !selected);
    const typeLabel = relationTypeLabels[relation.primary.type].ko;
    const label = `${typeLabel}${relation.score !== null ? ` · ${scoreToPercent(relation.score)}` : ""}${relation.edges.length > 1 ? ` +${relation.edges.length - 1}` : ""}`;
    // 관계가 많으면 라벨이 겹친다. 이때는 선택한 노드·선에 닿은 관계만 라벨을 보여 주고, 나머지는 선 모양과 범례로 구분한다.
    const showLabel = mode === "demo" || shownRelations.length <= LABEL_ALL_LIMIT || selected || (explicitNodeId !== null && (relation.source === explicitNodeId || relation.target === explicitNodeId));
    return { id: relation.id, source: relation.source, target: relation.target, type: "straight", label: showLabel ? label : undefined, animated: style.animated, interactionWidth: 26, className: `cm-edge cm-edge-${relation.primary.relationType}${selected ? " cm-edge-selected" : ""}`, ariaLabel: `${infoById.get(relation.source)?.name ?? relation.source} ↔ ${infoById.get(relation.target)?.name ?? relation.target}: ${typeLabel}`, style: { stroke: style.stroke, strokeDasharray: style.dash, strokeWidth: selected ? style.width + 1.8 : style.width, opacity: dimmed ? 0.16 : style.opacity }, labelStyle: { fill: "#2e3140", fontSize: 11, fontWeight: 600 }, labelBgStyle: { fill: "#f7f8fc", fillOpacity: dimmed ? 0.3 : 0.92 }, labelBgPadding: [5, 3] as [number, number], labelBgBorderRadius: 6 };
  }), [shownRelations, selectedRelation, explicitNodeId, infoById, mode]);
  // Visual Mode에서는 시각 유사 선만 그린다. 문화 관계는 사용자가 겹쳐 보기를 켰을 때만 흐리게 함께 그린다.
  const flowEdges = useMemo<Edge[]>(() => !visualOn ? cultureEdges : overlay ? [...cultureEdges.map((edge) => ({ ...edge, label: undefined, style: { ...edge.style, opacity: 0.28 } })), ...visualEdges] : visualEdges, [visualOn, overlay, cultureEdges, visualEdges]);

  const typeCounts = useMemo(() => shownRelations.reduce((acc, relation) => ({ ...acc, [relation.primary.type]: (acc[relation.primary.type] ?? 0) + 1 }), {} as Partial<Record<GraphEdgeType, number>>), [shownRelations]);
  const nameOf = (id: string) => infoById.get(id)?.name ?? id;
  const snapshotOf = (id: string): LiveAnalysisSnapshot | undefined => live.find((item) => item.trendId === id);
  const demoOf = (id: string): Trend | undefined => trends.find((item) => item.id === id);

  const selectNode = useCallback((id: string) => { setSelection({ kind: "node", id }); setSheetOpen(true); }, []);
  const selectEdge = useCallback((id: string) => { setSelection({ kind: "edge", id }); setSheetOpen(true); }, []);
  const clearSelection = useCallback(() => { setSelection(null); setSheetOpen(false); }, []);
  const resetFilters = useCallback(() => { setQuery(""); setCategories([]); setMinScore(0); setSelection(null); setSheetOpen(false); setSearchOpen(false); }, []);
  const switchMode = (next: "live" | "demo") => { setModeChoice(next); resetFilters(); setPick([]); };
  const chooseResult = (node: MapNodeInfo) => {
    if (!visibleIds.has(node.id)) setCategories([]);
    selectNode(node.id);
    setFocus({ id: node.id, nonce: Date.now() });
    setSearchOpen(false);
  };
  const toggleCategory = (value: string) => setCategories((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  const togglePick = (id: string) => setPick((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 2 ? [current[1], id] : [...current, id]);
  const setCategory = (id: string, value: string) => updateLiveAnalysis(id, value === UNCATEGORIZED ? { category: undefined, categorySource: undefined } : { category: value as Trend["category"], categorySource: "user" });
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setSheetOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);
  const feedbackFor = (relation: CultureRelation) => feedback.find((item) => item.pair === relationPair(relation));
  const writeFeedback = (relation: CultureRelation, patch: Partial<Pick<CultureRelationFeedback, "hidden" | "ratings">>) => {
    const previous = feedbackFor(relation);
    saveRelationFeedback({ pair: relationPair(relation), hidden: patch.hidden ?? previous?.hidden ?? false, ratings: { ...previous?.ratings, ...patch.ratings }, updatedAt: new Date().toISOString(), context: { names: [nameOf(relation.source), nameOf(relation.target)], types: relation.edges.map((edge) => edge.relationType), score: relation.score } });
  };
  const exportFeedback = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), criteria: RELATION_RATING_CRITERIA, scale: "1=전혀 아니다 · 5=매우 그렇다", feedback }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "culture-relation-feedback.json"; link.click();
    URL.revokeObjectURL(url);
  };
  const hiddenMatches = matches.filter((node) => !visibleIds.has(node.id)).length;
  const scoreDisabled = mode === "demo";

  /* ---------- 상세 패널: 노드 ---------- */
  const nodePanel = (() => {
    if (!panelNode) return null;
    const relatedAll = relations.filter((relation) => relation.source === panelNode.id || relation.target === panelNode.id);
    const connections = <div className="connections" data-testid="node-connections"><small>관련 트렌드 · {relatedAll.length}</small>{relatedAll.length ? relatedAll.map((relation) => {
      const shown = shownRelations.some((item) => item.id === relation.id);
      return <button type="button" key={relation.id} disabled={!shown} onClick={() => selectEdge(relation.id)} title={shown ? undefined : "필터로 숨겨진 관계"}><i style={{ background: edgeStyles[relation.primary.type].stroke }} />{nameOf(relation.source === panelNode.id ? relation.target : relation.source)}<em>{relationTypeLabels[relation.primary.type].ko}{relation.score !== null ? ` · ${scoreToPercent(relation.score)}` : ""}{shown ? "" : " · 숨김"}</em></button>;
    }) : <p>{panelNode.status === "DEMO" ? "연결된 데모 트렌드가 없습니다." : panelNode.hasDna ? "다른 트렌드와 설명 가능한 연결(공통 속성·교차 언급·의미 유사)이 아직 없습니다." : "DNA 분석 후 연결을 계산합니다."}</p>}</div>;

    if (panelNode.status === "DEMO") {
      const trend = demoOf(panelNode.id)!;
      return <>
        <header><div><small>SELECTED NODE · DEMO</small><h2 data-testid="selected-culture-node">{trend.name}</h2></div><Network /></header>
        <div className="demo-note"><DataBadge status="DEMO" /><p>미리 작성된 예시 트렌드입니다. 실제 분석 결과가 아닙니다.</p></div>
        <dl className="node-meta"><dt>카테고리</dt><dd>{trend.category}</dd><dt>영문</dt><dd>{trend.en}</dd><dt>상태</dt><dd>DEMO · 근거 없음</dd></dl>
        <p className="node-summary">{trend.summary}</p>
        <div className="attributes"><small>주요 속성 (DEMO)</small>{trend.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        <StatusPill status={trend.status} />
        {connections}
        <div className="panel-actions"><Link href={`/trends/${trend.id}/why`} className="button">TREND WHY 보기</Link><Link href={`/trends/${trend.id}/dna`} className="button">Inspect DNA <ArrowRight size={14} /></Link><Link href="/collision" className="button primary">Collision 데모 보기 <ArrowRight size={14} /></Link></div>
      </>;
    }

    const snapshot = snapshotOf(panelNode.id)!;
    const metadata = graph.metadata.get(panelNode.id);
    const picked = pick.includes(panelNode.id);
    const count = (kind: string) => snapshot.evidence?.filter((item) => item.kind === kind).length ?? 0;
    const history = ledger ? versionsOf(ledger, snapshot.trendId) : [];
    const latest = ledger ? currentVersion(ledger, snapshot) : null;
    const versionLabel = latest ? `v${latest.version} · 최신${latest.cloud ? " · Supabase 저장됨" : " · 브라우저 원장"}` : history.length ? "DNA 재분석 필요 · 이전 버전 보존" : snapshot.dna ? "원장 기록 중" : "—";
    const older = history.filter((item) => item.version !== latest?.version);
    return <>
      <header><div><small>SELECTED NODE · LIVE</small><h2 data-testid="selected-culture-node">{snapshot.trendName}</h2></div><Network /></header>
      <DataBadge status={panelNode.status} detail={panelNode.status === "ERROR" ? "DNA 메타데이터 변환 실패 · 관계 계산 제외" : panelNode.hasDna ? "브라우저에 저장된 LIVE 분석" : "WHY만 완료 · DNA 미분석"} />
      <dl className="node-meta">
        <dt>카테고리</dt><dd><select aria-label={`${snapshot.trendName} 카테고리`} value={panelNode.category} onChange={(event) => setCategory(panelNode.id, event.target.value)}>{[...CULTURE_CATEGORIES, UNCATEGORIZED].map((item) => <option key={item} value={item}>{item}</option>)}</select>{panelNode.categoryUserSet && <em className="user-set">사용자 지정</em>}</dd>
        <dt>WHY 분석</dt><dd>{formatDateTime(snapshot.analyzedAt)}</dd>
        <dt>DNA 분석</dt><dd>{snapshot.dna ? formatDateTime(snapshot.dnaGeneratedAt) : "미분석"}</dd>
        <dt>분석 버전</dt><dd data-testid="node-version">{versionLabel}</dd>
        <dt>데이터 출처</dt><dd>NAVER {count("naver_series")} · Instagram {count("instagram_media")} · YouTube {count("youtube_video")} · Web {count("web_source")}</dd>
        <dt>키워드</dt><dd>{snapshot.keywords.join(", ")}</dd>
      </dl>
      {snapshot.dna ? <div className="dna-summary" data-testid="node-dna-summary"><small>TREND DNA 요약</small><p className="pattern">{snapshot.dna.dominantPattern.title}</p><p>{snapshot.dna.dominantPattern.explanation}</p><StatusPill status={snapshot.dna.dominantPattern.status} /></div> : <p className="node-summary">{snapshot.summary}</p>}
      {metadata && <div className="dimensions" data-testid="node-dimensions"><small>주요 문화적 속성 · 6 DIMENSIONS</small>{metadata.dimensions.map((dimension) => <div key={dimension.dimension} className="dimension-row"><b>{dimension.dimension}<em>{DIMENSION_KO[dimension.dimension]}</em></b><span>{dimension.attributes.length ? dimension.attributes.slice(0, 3).map((attribute) => <i key={attribute.attributeId} className={attribute.basis === "AI Hypothesis" ? "hyp" : "grounded"} title={`${attribute.verificationStatus} · ${attribute.basis}`}>{attribute.displayLabel}{attribute.basis === "AI Hypothesis" && <sup>가설</sup>}</i>) : <i className="empty">속성 없음</i>}</span></div>)}<p className="legend-note"><i className="grounded" />근거 연결 <i className="hyp" />AI 가설(근거 없음)</p></div>}
      {visualOn && (() => {
        const record = snapshot.visualDna;
        const images = imagesById.get(snapshot.trendId) ?? [];
        const links = shownVisual.filter((relation) => relation.source === snapshot.trendId || relation.target === snapshot.trendId);
        return <div className="node-visual" data-testid="node-visual"><small><Eye size={12} /> VISUAL · 실제 수집 이미지 {images.length}</small>
          {images.length ? <div className="ic-grid">{images.map((media) => <a key={media.mediaId} href={media.sourceUrl} target="_blank" rel="noreferrer" title={media.title}><MediaThumb media={media} label={snapshot.trendName} ratio="4 / 3" /></a>)}</div> : <MediaThumb media={null} label={snapshot.trendName} ratio="16 / 9" />}
          {record ? <>
            <div className="vd-palette" data-testid="node-visual-palette">{record.result.palette.map((color) => <span key={color.hex}><i style={{ background: color.hex }} />{color.name}<code>{color.hex}</code></span>)}</div>
            <p className="hint">Visual DNA {formatDateTime(record.analyzedAt)} · 이미지 {record.media.length}장 관찰 · 시각 유사 연결 {links.length}</p>
          </> : <p className="hint" data-testid="node-visual-missing">Visual DNA가 아직 없어 시각 유사 연결을 계산하지 않습니다. TREND DNA 화면에서 직접 분석할 수 있습니다(자동 호출 없음).</p>}
          {links.map((relation) => <button type="button" key={relation.id} className="vlink" onClick={() => selectEdge(relation.id)}><i />{nameOf(relation.source === snapshot.trendId ? relation.target : relation.source)}<em>시각 유사 · {scoreToPercent(relation.score)}</em></button>)}
        </div>;
      })()}
      {older.length > 0 && <div className="versions" data-testid="node-versions"><small>이전 분석 버전 · 보존됨</small>{older.map((item) => <p key={item.version}><b>v{item.version}</b> DNA {formatDateTime(item.analyzedAt)} · {item.metadata.dominantPattern.title}</p>)}<p className="hint">관계와 지도는 최신 버전으로만 계산합니다.</p></div>}
      {connections}
      <div className="panel-actions">
        <Link href={trendPath(snapshot.trendId, "why")} className="button">TREND WHY 보기</Link>
        <Link href={trendPath(snapshot.trendId, "dna")} className={`button${snapshot.dna ? "" : " primary"}`}>{snapshot.dna ? "TREND DNA 보기" : "DNA 분해하기"} <ArrowRight size={14} /></Link>
        <button type="button" className={`button${picked ? "" : " primary"}`} disabled={!panelNode.canCollide} onClick={() => togglePick(panelNode.id)} data-testid="pick-collision">{picked ? "Collision 선택 해제" : "Collision 비교에 추가"}</button>
        {!panelNode.canCollide && <p className="hint">DNA와 근거 원장이 있는 LIVE 트렌드만 Collision 분석에 쓸 수 있습니다.</p>}
      </div>
    </>;
  })();

  /* ---------- 상세 패널: 관계 ---------- */
  const relationPanel = (() => {
    if (!selectedRelation) return null;
    const relation = selectedRelation;
    const evidence = mode === "live" ? resolveRelationEvidence(relation, live) : [];
    const primaryLabel = relationTypeLabels[relation.primary.type];
    const source = infoById.get(relation.source), target = infoById.get(relation.target);
    const bothCollide = Boolean(source?.canCollide && target?.canCollide);
    const aiFlag = relation.aiHypothesisOnly ? "예 · AI가 제안한 가설만 있음" : relation.hasEvidence ? "아니오 · 저장된 데이터 근거와 연결됨" : mode === "demo" ? "DEMO · 근거 없음" : "아니오 · 임베딩 의미 유사도만 있음(근거 없음)";
    const ordered = [...relation.edges].sort((a, b) => edgeTypeStrength.indexOf(a.type) - edgeTypeStrength.indexOf(b.type));
    return <>
      <header><div><small>SELECTED EDGE · RELATION</small><h2 data-testid="relation-title">{nameOf(relation.source)} ↔ {nameOf(relation.target)}</h2></div><Network /></header>
      <DataBadge status={mode === "demo" ? "DEMO" : "SAVED"} detail={mode === "demo" ? "미리 작성된 예시 관계" : relation.aiHypothesisOnly ? "저장된 Collision의 AI 가설" : relation.stored ? `관계 원장 · ${nameOf(relation.source)} v${relation.stored.sourceVersion} ↔ ${nameOf(relation.target)} v${relation.stored.targetVersion} · 계산 ${formatDateTime(relation.stored.computedAt)}${relation.stored.cloudSavedAt ? " · Supabase 저장됨" : ""}` : `저장된 LIVE 분석으로 계산 · ${formatDateTime(relation.analyzedAt)}`} />
      <div className="rel-block"><small>RELATIONSHIP TYPE · 관계 유형</small><div className="edge-type" data-testid="relation-type" style={{ borderColor: edgeStyles[relation.primary.type].stroke, color: edgeStyles[relation.primary.type].stroke }}>{primaryLabel.ko} · {relation.primary.type} <code>{primaryLabel.key}</code></div></div>
      <div className="rel-block score-block"><small>RELATIONSHIP SCORE · 관계 점수</small>
        {relation.score === null ? <p className="score-none" data-testid="relation-score">점수 없음 · {mode === "demo" ? "DEMO 관계" : "AI 가설은 정량 점수를 매기지 않습니다"}</p> : <>
          <p className="score-value" data-testid="relation-score"><b>{scoreToPercent(relation.score)}</b><span>/ 100</span></p>
          {relation.scoreBreakdown && <ul className="breakdown">{([["attribute", "공통 속성 일치(Jaccard)", relation.scoreBreakdown.attribute], ["semantic", "DNA 임베딩 의미 유사", relation.scoreBreakdown.semantic], ["observed", "수집 자료 교차 언급", relation.scoreBreakdown.observed]] as const).map(([key, label, value]) => <li key={key}><span>{label} <em>×{RELATION_SCORE_WEIGHTS[key]}</em></span><i><b style={{ width: `${Math.round((value ?? 0) * 100)}%` }} /></i><output>{value === null ? "—" : scoreToPercent(value)}</output></li>)}</ul>}
        </>}
        <p className="score-note">알고리즘 기반 유사성 지표입니다. 트렌드가 실제로 연결되거나 함께 유행할 확률이 아닙니다.</p>
      </div>
      <dl className="node-meta relation-meta"><dt>검증 상태</dt><dd>{relation.primary.verificationStatus && <StatusPill status={relation.primary.verificationStatus} />}</dd><dt>AI 가설 여부</dt><dd data-testid="relation-ai-flag">{aiFlag}</dd></dl>
      {relation.sharedAttributes.length > 0 && <div className="attributes" data-testid="relation-shared"><small>SHARED ATTRIBUTES · 공통 문화적 특징</small>{relation.sharedAttributes.map((item) => <span key={item.attributeId}>{item.dimension === "DEMO" ? "" : `${item.dimension} · `}{item.canonicalLabel}</span>)}</div>}
      {relation.differentialAttributes && (relation.differentialAttributes.source.length > 0 || relation.differentialAttributes.target.length > 0) && <div className="differential"><small>DIFFERENCES · 서로 다른 특징</small><div><b>{nameOf(relation.source)}에만</b>{relation.differentialAttributes.source.slice(0, 4).map((item) => <span key={item.attributeId}>{item.canonicalLabel}</span>)}</div><div><b>{nameOf(relation.target)}에만</b>{relation.differentialAttributes.target.slice(0, 4).map((item) => <span key={item.attributeId}>{item.canonicalLabel}</span>)}</div></div>}
      <div className="explanation" data-testid="relation-explanation"><small>EXPLANATION · 왜 연결됐나</small>{ordered.map((edge) => <article key={edge.id} className={`signal signal-${edge.relationType}`}><header><span style={{ color: edgeStyles[edge.type].stroke }}>{relationTypeLabels[edge.type].ko}</span>{edge.score !== undefined && <em>{scoreToPercent(edge.score)}</em>}{edge.verificationStatus && <StatusPill status={edge.verificationStatus} />}</header><p>{edge.basis}</p></article>)}</div>
      <div className="relation-evidence" data-testid="relation-evidence"><small>EVIDENCE · 근거 {evidence.length}</small>
        {evidence.length ? evidence.map(({ qualifiedId, trendName, item }) => item ? <a key={qualifiedId} href={item.url || undefined} target="_blank" rel="noreferrer" data-evidence-id={qualifiedId}><b>{qualifiedId}</b><span>{item.title}</span><em>{item.source}{item.date ? ` · ${item.date}` : ""}{trendName ? ` · ${trendName} 분석` : ""}</em></a> : <div key={qualifiedId} className="missing"><b>{qualifiedId}</b><span>저장된 근거 원장에서 찾을 수 없는 ID입니다.</span></div>)
          : <p className="no-evidence" data-testid="relation-no-evidence">{NO_EVIDENCE_NOTICE}</p>}
      </div>
      {mode === "live" && <ImageCompare sides={[relation.source, relation.target].map((id) => ({ id, name: nameOf(id), images: imagesById.get(id) ?? [] }))} />}
      <p className="map-caveat">관계 점수와 화면 배치는 확산 확률이나 인과관계를 의미하지 않습니다. 가까이 놓였다고 더 비슷한 것이 아닙니다.</p>
      <div className="panel-actions">
        {mode === "live" && <div className="evaluation" data-testid="relation-evaluation"><small>RELATION REVIEW · 이 연결 평가</small>{RELATION_RATING_CRITERIA.map((criterion) => <div className="rating-row" key={criterion.key}><span>{criterion.label}</span><div role="radiogroup" aria-label={criterion.label}>{([1, 2, 3, 4, 5] as const).map((value) => <button type="button" role="radio" key={value} aria-checked={feedbackFor(relation)?.ratings[criterion.key as RelationRatingKey] === value} aria-label={`${criterion.label} ${value}점`} onClick={() => writeFeedback(relation, { ratings: { [criterion.key]: value } })}>{value}</button>)}</div></div>)}<p className="hint">1 = 전혀 아니다 · 5 = 매우 그렇다. 평가는 이 브라우저에만 저장되며 관계 계산에는 쓰지 않습니다.</p><button type="button" className="button" data-testid="hide-relation" onClick={() => writeFeedback(relation, { hidden: !feedbackFor(relation)?.hidden })}>{feedbackFor(relation)?.hidden ? "이 연결 다시 표시" : "부적절한 연결 · 지도에서 숨기기"}</button></div>}
        {mode === "live" && <button type="button" className="button primary" disabled={!bothCollide} onClick={() => setPick([relation.source, relation.target])} data-testid="pick-relation">이 두 트렌드로 Collision 준비</button>}
        {mode === "live" && !bothCollide && <p className="hint">두 트렌드 모두 DNA가 있어야 Collision 분석을 할 수 있습니다.</p>}
        <button type="button" className="button" onClick={() => setSelection({ kind: "node", id: relation.source })}>Back to node</button>
      </div>
    </>;
  })();

  /* ---------- 상세 패널: 시각 유사(V4) ---------- */
  const visualPanel = (() => {
    if (!selectedVisual) return null;
    const relation = selectedVisual;
    const source = infoById.get(relation.source), target = infoById.get(relation.target);
    const bothCollide = Boolean(source?.canCollide && target?.canCollide);
    const cultural = relations.find((item) => relationPair(item) === relationPair(relation));
    const paletteOf = (id: string) => live.find((item) => item.trendId === id)?.visualDna?.result.palette ?? [];
    return <>
      <header><div><small>SELECTED EDGE · VISUAL SIMILARITY</small><h2 data-testid="visual-title">{nameOf(relation.source)} ↔ {nameOf(relation.target)}</h2></div><Eye /></header>
      <DataBadge status="SAVED" detail={`저장된 Visual DNA 비교(AI 비전 관찰) · ${nameOf(relation.source)} ${formatDateTime(relation.analyzedAt.source)} ↔ ${nameOf(relation.target)} ${formatDateTime(relation.analyzedAt.target)}`} />
      <div className="rel-block score-block"><small>VISUAL SIMILARITY · 시각 유사 지표</small>
        <p className="score-value" data-testid="visual-score"><b>{scoreToPercent(relation.score)}</b><span>/ 100</span></p>
        <ul className="breakdown">{([["palette", "관찰 팔레트 색 거리(ΔE)", relation.breakdown.palette], ["features", "같은 차원의 관찰 특징 일치", relation.breakdown.features]] as const).map(([key, label, value]) => <li key={key}><span>{label} <em>×{VISUAL_SCORE_WEIGHTS[key]}</em></span><i><b style={{ width: `${Math.round((value ?? 0) * 100)}%`, background: "linear-gradient(90deg,#f08cbf,#c2337a)" }} /></i><output>{value === null ? "—" : scoreToPercent(value)}</output></li>)}</ul>
        <p className="score-note">{VISUAL_NOTICE} 표시 기준 {scoreToPercent(VISUAL_EDGE_MIN)} 이상(실측 분포로 보정하지 않은 기준값).</p>
      </div>
      <ImageCompare sides={[relation.source, relation.target].map((id) => ({ id, name: nameOf(id), images: imagesById.get(id) ?? [] }))} />
      <div className="palette-compare" data-testid="palette-compare"><small>PALETTE · 관찰된 색</small>{[relation.source, relation.target].map((id) => <div key={id}><b>{nameOf(id)}</b><span>{paletteOf(id).map((color) => <i key={color.hex} title={`${color.name} ${color.hex}`} style={{ background: color.hex }} />)}</span></div>)}
        {relation.closeColors.length > 0 && <p>가까운 색: {relation.closeColors.map((pair) => `${pair.source.name}(${pair.source.hex}) ≈ ${pair.target.name}(${pair.target.hex}) ΔE ${pair.deltaE}`).join(" · ")}</p>}</div>
      <div className="attributes" data-testid="visual-shared"><small>SHARED VISUAL FEATURES · 공통 관찰 특징 {relation.sharedFeatures.length}</small>{relation.sharedFeatures.length ? relation.sharedFeatures.map((item) => <span key={`${item.source.label}|${item.target.label}`} title={`${item.source.description} / ${item.target.description}`}>{item.dimension} · {item.source.label === item.target.label ? item.source.label : `${item.source.label} ≈ ${item.target.label}`}</span>) : <p className="hint">이름이 비슷한 관찰 특징이 없습니다. 색만 가깝습니다.</p>}</div>
      {(relation.onlySource.length > 0 || relation.onlyTarget.length > 0) && <div className="differential"><small>DIFFERENCES · 한쪽에서만 관찰</small><div><b>{nameOf(relation.source)}에만</b>{relation.onlySource.slice(0, 4).map((item) => <span key={item.label}>{item.label}</span>)}</div><div><b>{nameOf(relation.target)}에만</b>{relation.onlyTarget.slice(0, 4).map((item) => <span key={item.label}>{item.label}</span>)}</div></div>}
      <dl className="node-meta relation-meta"><dt>문화 관계</dt><dd data-testid="visual-culture-link">{cultural ? `있음 · ${relationTypeLabels[cultural.primary.type].ko}${cultural.score !== null ? ` ${scoreToPercent(cultural.score)}` : ""} (별도 계산)` : "없음 · 시각적으로만 닮음"}</dd></dl>
      <p className="map-caveat">시각 유사 점수는 문화 관계 점수와 따로 계산하며 서로 영향을 주지 않습니다.</p>
      <div className="panel-actions">
        {cultural && <button type="button" className="button" onClick={() => { setOverlay(true); setSelection({ kind: "edge", id: cultural.id }); }}>문화 관계 보기</button>}
        <button type="button" className="button primary" disabled={!bothCollide} onClick={() => setPick([relation.source, relation.target])} data-testid="pick-visual">이 두 트렌드로 Collision 준비</button>
        <button type="button" className="button" onClick={() => setSelection({ kind: "node", id: relation.source })}>Back to node</button>
      </div>
    </>;
  })();

  const panelBody: ReactNode = visualPanel ?? relationPanel ?? nodePanel;
  const aside = <aside className={`detail-panel${isMobile ? " sheet" : ""}${sheetOpen ? " open" : ""}`} aria-label="Culture Map 상세 정보" data-testid="map-detail" aria-hidden={isMobile && !sheetOpen ? true : undefined}>
    {isMobile && <button type="button" className="sheet-close" aria-label="상세 닫기" onClick={() => setSheetOpen(false)}><X size={18} /></button>}
    {panelBody}
  </aside>;

  const tray = mode === "live" && pick.length > 0 && <div className="collision-tray panel" data-testid="collision-tray"><Sparkles size={16} /><div><small>CULTURE COLLISION 선택 · {pick.length}/2</small><p>{pick.map((id) => <span key={id}>{nameOf(id)}<button type="button" aria-label={`${nameOf(id)} 선택 해제`} onClick={() => togglePick(id)}><X size={12} /></button></span>)}</p></div>{pick.length === 2 ? <Link className="button primary" href={collisionHref(pick)} data-testid="explore-collision">Explore Collision <ArrowRight size={14} /></Link> : <button type="button" className="button" disabled data-testid="explore-collision">트렌드 1개 더 선택</button>}</div>;

  const empty = mode === "live" && live.length === 0;
  return <div className="page map-page"><PageHeader eyebrow="04 / CULTURE MAP" title="See what culture shares." description="저장된 LIVE 분석이 노드가 되고, 연결선을 누르면 왜 연결됐는지(공통 속성·의미 유사·관찰된 연결·AI 가설)와 근거를 확인할 수 있습니다. 관계 점수는 확률이 아닙니다." />
    <div className="mode-row"><div className="chip-select"><button type="button" aria-pressed={mode === "live"} onClick={() => switchMode("live")}>LIVE GRAPH · {live.length}</button><button type="button" aria-pressed={mode === "demo"} onClick={() => switchMode("demo")}>DEMO GRAPH</button></div><DataBadge status={mode === "demo" ? "DEMO" : live.length ? "SAVED" : "NOT ANALYZED"} detail={mode === "demo" ? "예시 관계 · 실제 분석 아님" : live.length ? "브라우저에 저장된 LIVE 분석으로 계산" : undefined} /></div>
    {mode === "live" && live.length > 0 && <div className="lens-row" data-testid="lens-row"><div className="chip-select" role="group" aria-label="지도 보기 방식"><button type="button" aria-pressed={!visualOn} onClick={() => { setLens("culture"); setSelection(null); }} data-testid="lens-culture"><Network size={13} />CULTURE</button><button type="button" aria-pressed={visualOn} onClick={() => { setLens("visual"); setSelection(null); }} data-testid="lens-visual"><Eye size={13} />VISUAL MODE</button></div>{visualOn && <label className="overlay-toggle"><input type="checkbox" checked={overlay} onChange={(event) => setOverlay(event.target.checked)} data-testid="visual-overlay" />문화 관계 겹쳐 보기</label>}{visualOn && <span className="lens-note" data-testid="visual-status">Visual DNA {visual.analyzed.length}/{live.length}{visual.analyzed.length < 2 ? " · 시각 유사 연결은 2개 이상 트렌드에 Visual DNA가 있어야 계산됩니다" : ""}</span>}</div>}

    {mode === "live" && <CultureCloudPanel />}
    <section className="map-tools panel" aria-label="Culture Map 검색과 필터">
      <div className="map-search-wrap">
        <label className="map-search"><Search size={14} /><span className="sr-only">트렌드 검색</span><input aria-label="트렌드 노드 검색" type="search" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Enter" && matches[0]) { event.preventDefault(); chooseResult(matches[0]); } if (event.key === "Escape") setSearchOpen(false); }} placeholder="트렌드·키워드·DNA 속성 검색" /></label>
        {searchOpen && query.trim() && <div className="search-results" data-testid="map-search-results">{matches.length ? <><small>검색 결과 {matches.length}개{hiddenMatches ? ` · 필터에 가려진 ${hiddenMatches}개 포함` : ""}</small>{matches.slice(0, 8).map((node) => <button type="button" key={node.id} onClick={() => chooseResult(node)}><b>{node.name}</b><em>{node.category} · {node.status === "DEMO" ? "DEMO" : node.hasDna ? "DNA" : "DNA 미분석"}{visibleIds.has(node.id) ? "" : " · 필터로 숨김"}</em></button>)}</> : <p data-testid="map-search-empty">“{query.trim()}”와 일치하는 트렌드가 없습니다. 이름·키워드·DNA 속성으로 검색합니다.</p>}</div>}
      </div>
      <button type="button" className="filter-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal size={14} />필터{categories.length || minScore ? ` · ${categories.length + (minScore ? 1 : 0)}` : ""}</button>
      <div className={`filter-body${filtersOpen ? " open" : ""}`}>
        <div className="category-filter" role="group" aria-label="카테고리 필터"><button type="button" aria-pressed={!categories.length} onClick={() => setCategories([])}>ALL</button>{categoryOptions.map((item) => <button type="button" key={item} aria-pressed={categories.includes(item)} disabled={!categoryCounts.get(item)} onClick={() => toggleCategory(item)}>{item} <b>{categoryCounts.get(item) ?? 0}</b></button>)}</div>
        <label className={`score-filter${scoreDisabled ? " disabled" : ""}`}><span>최소 관계 점수 · RELATIONSHIP SCORE</span><input aria-label="최소 관계 점수" type="range" min="0" max="100" step="5" value={minScore} disabled={scoreDisabled} onChange={(event) => setMinScore(Number(event.target.value))} /><output data-testid="score-threshold">{scoreDisabled ? "—" : `${minScore} 이상`}</output><em>{scoreDisabled ? "DEMO 관계에는 점수가 없습니다" : minScore ? "점수 없는 AI 가설 연결은 숨겨집니다" : "알고리즘 기반 유사성 지표 · 확률 아님"}</em></label>
      </div>
      <div className="tool-end"><span className="counts" data-testid="map-counts">노드 {visibleNodes.length}/{nodesInfo.length} · 관계 {shownRelations.length}/{relations.length}{visualOn ? ` · 시각 유사 ${shownVisual.length}/${visual.relations.length}` : ""}</span>{hiddenCount > 0 && <button type="button" className="filter-reset" data-testid="hidden-relations" aria-pressed={showHidden} onClick={() => setShowHidden((value) => !value)}>숨긴 관계 {hiddenCount}개 · {showHidden ? "다시 숨기기" : "보기"}</button>}{mode === "live" && feedback.length > 0 && <button type="button" className="filter-reset" data-testid="export-feedback" onClick={exportFeedback}>평가 내보내기 (JSON)</button>}<button type="button" className="filter-reset" onClick={resetFilters}><RotateCcw size={13} />필터 초기화</button></div>
    </section>

    {visualOn ? <div className="map-legend" data-testid="map-legend"><span><svg width="30" height="8" aria-hidden><line x1="1" y1="4" x2="29" y2="4" stroke={VISUAL_EDGE.stroke} strokeWidth={VISUAL_EDGE.width} strokeDasharray={VISUAL_EDGE.dash} /></svg>시각 유사<em>분홍 점선</em><b>{shownVisual.length}</b></span>{overlay && <span><svg width="30" height="8" aria-hidden><line x1="1" y1="4" x2="29" y2="4" stroke="#1f50c8" strokeWidth={2} opacity={0.35} /></svg>문화 관계(흐리게)<b>{shownRelations.length}</b></span>}<small><Info size={12} /> {VISUAL_NOTICE}</small></div> : <div className="map-legend" data-testid="map-legend">{(Object.keys(relationTypeLabels) as GraphEdgeType[]).map((type) => <span key={type}><svg width="30" height="8" aria-hidden><line x1="1" y1="4" x2="29" y2="4" stroke={edgeStyles[type].stroke} strokeWidth={edgeStyles[type].width} strokeDasharray={edgeStyles[type].dash} opacity={edgeStyles[type].opacity} /></svg>{relationTypeLabels[type].ko}<em>{relationTypeLabels[type].line}</em><b>{typeCounts[type] ?? 0}</b></span>)}<small><Info size={12} /> {mode === "demo" ? "모든 연결은 데모 예시입니다." : `의미 유사 표시 기준 cos ≥ ${graph.semantic.threshold}${graph.semantic.calibrated ? ` (트렌드 ${graph.semantic.pairs}쌍 분포로 보정: 평균 ${graph.semantic.mean} + 표준편차 ${graph.semantic.std})` : " (하한값)"} · 배치 좌표는 유사도의 증거가 아닙니다.`}</small></div>}

    {tray}

    {empty ? <div className="state-box panel" data-testid="map-empty"><DataBadge status="NOT ANALYZED" /><h3>아직 LIVE 분석된 트렌드가 없습니다.</h3><p>Discover나 TREND WHY에서 키워드를 LIVE 분석하면 노드가 추가됩니다. 연결을 만들려면 2개 이상의 트렌드에 DNA 분석이 필요합니다.</p><Link className="button primary" href="/discover">Analyze a keyword</Link></div>
      : visibleNodes.length === 0 ? <div className="state-box panel" data-testid="map-filter-empty"><DataBadge status="NOT AVAILABLE" /><h3>필터와 일치하는 트렌드가 없습니다.</h3><p>카테고리 또는 최소 관계 점수를 조정하세요.</p><button className="button" onClick={resetFilters}>필터 초기화</button></div>
        : <div className="map-shell">
          <div className="flow-wrap panel"><Canvas key={mode} compact={isMobile} nodes={flowNodes} edges={flowEdges} focus={focus} onNode={selectNode} onEdge={selectEdge} onPane={clearSelection} onReset={resetFilters} nodeColor={accentOf} />{isMobile && !sheetOpen && <p className="tap-hint">노드나 연결선을 누르면 상세 정보가 열립니다.</p>}</div>
          {isMobile ? (typeof document !== "undefined" ? createPortal(aside, document.body) : null) : aside}
        </div>}

    <style jsx global>{`
      .map-page .sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
      .map-page .mode-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px}
      .map-page .map-tools{display:grid;grid-template-columns:minmax(220px,1fr) auto minmax(0,2fr) auto;gap:12px;align-items:center;padding:12px;margin-bottom:12px;position:relative;z-index:5}
      .map-page .map-search-wrap{position:relative}
      .map-page .map-search{display:flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:8px;padding:0 10px;background:#fff}
      .map-page .map-search svg{color:var(--accent);flex:0 0 auto}
      .map-page .map-search input{width:100%;border:0;background:transparent;color:var(--text);padding:10px 0;font-size:13px;outline:0;min-height:38px}
      .map-page .search-results{position:absolute;left:0;right:0;top:calc(100% + 6px);background:#fff;border:1px solid var(--border);border-radius:10px;box-shadow:0 12px 28px rgba(10,60,130,.18);padding:6px;display:grid;gap:2px;max-height:320px;overflow:auto;z-index:20}
      .map-page .search-results small{font-size:11px;color:var(--muted);padding:4px 8px}
      .map-page .search-results button{display:flex;justify-content:space-between;align-items:center;gap:10px;border:0;background:transparent;text-align:left;padding:9px 10px;border-radius:7px;cursor:pointer;min-height:40px;font-size:13px;color:var(--text)}
      .map-page .search-results button:hover,.map-page .search-results button:focus-visible{background:#eef1ff}
      .map-page .search-results em{font-style:normal;font-size:11px;color:var(--muted)}
      .map-page .search-results p{margin:0;padding:10px;font-size:12px;color:var(--muted);line-height:1.6}
      .map-page .filter-toggle{display:none}
      .map-page .filter-body{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(200px,1fr);gap:12px;align-items:center}
      .map-page .category-filter{display:flex;gap:5px;flex-wrap:wrap}
      .map-page .category-filter button,.map-page .filter-reset,.map-page .filter-toggle{white-space:nowrap;border:1px solid var(--border);background:#fff;color:#3a3d4a;border-radius:20px;padding:6px 10px;font-size:12px;cursor:pointer;min-height:32px;display:inline-flex;align-items:center;gap:5px}
      .map-page .category-filter button b{font-weight:600;color:var(--muted);font-size:11px}
      .map-page .category-filter button[aria-pressed=true]{border-color:var(--accent);color:var(--accent);background:#eef1ff;font-weight:700}
      .map-page .category-filter button:disabled{opacity:.45;cursor:not-allowed}
      .map-page .score-filter{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center}
      .map-page .score-filter span{grid-column:1/-1;font-size:11px;letter-spacing:.06em;color:#4b5d78;font-weight:700}
      .map-page .score-filter input{accent-color:var(--accent);width:100%}
      .map-page .score-filter output{font-size:12px;color:var(--accent);font-variant-numeric:tabular-nums;font-weight:700}
      .map-page .score-filter em{grid-column:1/-1;font-style:normal;font-size:11px;color:var(--muted)}
      .map-page .score-filter.disabled{opacity:.6}
      .map-page .tool-end{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
      .map-page .counts{font-size:11px;color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums}
      .map-page .map-legend{display:flex;gap:16px;align-items:center;margin-bottom:12px;color:#2e3140;font-size:12px;flex-wrap:wrap;padding:8px 14px;background:rgba(255,255,255,.82);border-radius:10px}
      .map-page .map-legend span{display:flex;align-items:center;gap:6px}
      .map-page .map-legend span em{font-style:normal;color:var(--muted);font-size:11px}
      .map-page .map-legend b{color:#262626;font-weight:600}
      .map-page .map-legend small{display:flex;gap:6px;align-items:center;margin-left:auto;color:#5d6170;font-size:11px}
      .map-page .collision-tray{display:flex;align-items:center;gap:14px;padding:10px 14px;margin-bottom:12px}
      .map-page .collision-tray svg{color:var(--accent);flex:0 0 auto}
      .map-page .collision-tray>div{flex:1;min-width:0}
      .map-page .collision-tray small{font-size:11px;letter-spacing:.08em;color:var(--accent);font-weight:700}
      .map-page .collision-tray p{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 0}
      .map-page .collision-tray p span{display:inline-flex;align-items:center;gap:4px;font-size:12px;border:1px solid var(--border);border-radius:20px;padding:3px 4px 3px 10px;background:#fff}
      .map-page .collision-tray p button{border:0;background:transparent;cursor:pointer;display:grid;place-items:center;width:24px;height:24px;border-radius:50%;color:var(--muted)}
      .map-page .map-shell{height:680px;display:grid;grid-template-columns:minmax(0,1fr) 380px;gap:12px}
      .map-page .flow-wrap{height:100%;overflow:hidden;position:relative;background:#f7f8fc}
      .map-page .tap-hint{position:absolute;left:10px;right:10px;bottom:10px;margin:0;text-align:center;font-size:12px;color:#3a3d4a;background:rgba(255,255,255,.92);border:1px solid var(--border);border-radius:20px;padding:6px 10px;pointer-events:none}
      .detail-panel{padding:22px;display:flex;flex-direction:column;gap:2px;background:#f8fcff;border:1px solid var(--border);border-radius:14px;box-shadow:var(--drop);overflow-y:auto;min-width:0}
      .detail-panel .data-badge{white-space:normal;flex-wrap:wrap;max-width:100%;height:auto;align-self:flex-start;row-gap:2px}
      .detail-panel>header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
      .detail-panel>header svg{color:var(--accent);flex:0 0 auto}
      .detail-panel small{color:#5d6170;font-size:11px;letter-spacing:.1em;font-weight:700}
      .detail-panel h2{font-size:20px;font-weight:700;margin:6px 0 8px;color:#14161f;word-break:keep-all}
      .detail-panel.sheet{position:fixed;left:0;right:0;bottom:0;z-index:80;max-height:min(72vh,620px);border-radius:18px 18px 0 0;padding:22px 16px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -10px 30px rgba(10,60,130,.25);transform:translateY(105%);visibility:hidden;transition:transform .22s ease,visibility .22s}
      .detail-panel.sheet.open{transform:none;visibility:visible}
      .detail-panel.sheet::before{content:"";position:absolute;top:8px;left:50%;width:42px;height:4px;margin-left:-21px;border-radius:4px;background:#c9cde0}
      .detail-panel .sheet-close{position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:50%;border:1px solid var(--border);background:#fff;display:grid;place-items:center;cursor:pointer;color:#3a3d4a;z-index:1}
      .detail-panel.sheet .sheet-close+header{padding-right:46px}
      .detail-panel .node-meta{display:grid;grid-template-columns:78px minmax(0,1fr);gap:7px 10px;font-size:12px;margin:10px 0}
      .detail-panel .node-meta dt{color:#5d6170}
      .detail-panel .node-meta dd{margin:0;color:#2e3140;word-break:break-all;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .detail-panel .node-meta select{border:1px solid var(--border);border-radius:6px;padding:4px 6px;font-size:12px;background:#fff;min-height:30px}
      .detail-panel .user-set{font-style:normal;font-size:11px;color:#9e6a0e;border:1px solid #e3c48a;border-radius:10px;padding:1px 6px}
      .detail-panel .relation-meta{padding:10px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
      .detail-panel .node-summary{color:var(--muted);font-size:13px;line-height:1.7;margin:6px 0}
      .detail-panel .dna-summary{display:grid;gap:4px;justify-items:start;margin:10px 0;padding:12px;border-radius:10px;background:#fff;border:1px solid var(--line)}
      .detail-panel .dna-summary p{margin:0;font-size:12px;color:var(--muted);line-height:1.6}
      .detail-panel .dna-summary .pattern{font-size:14px;font-weight:700;color:#14161f}
      .detail-panel .dimensions{display:grid;gap:6px;margin:10px 0}
      .detail-panel .dimension-row{display:grid;grid-template-columns:88px minmax(0,1fr);gap:8px;align-items:start;font-size:12px}
      .detail-panel .dimension-row b{font-weight:700;color:#2e3140;display:grid}
      .detail-panel .dimension-row b em{font-style:normal;font-weight:400;font-size:11px;color:var(--muted)}
      .detail-panel .dimension-row span{display:flex;flex-wrap:wrap;gap:4px}
      .detail-panel .dimension-row i,.detail-panel .legend-note i{font-style:normal;font-size:11px;padding:3px 7px;border-radius:12px;border:1px solid}
      .detail-panel .dimension-row i.grounded{border-color:#8fb6ea;background:#eef5ff;color:#1f50c8}
      .detail-panel .dimension-row i.hyp{border-color:#e3c48a;border-style:dashed;background:#fffaf0;color:#8a5a08}
      .detail-panel .dimension-row i.empty{border-color:var(--line);color:var(--muted)}
      .detail-panel .dimension-row sup{font-size:9px;margin-left:2px}
      .detail-panel .legend-note{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);margin:2px 0 0}
      .detail-panel .legend-note i{width:10px;height:10px;padding:0;display:inline-block}
      .detail-panel .legend-note i.grounded{border-color:#8fb6ea;background:#eef5ff}
      .detail-panel .legend-note i.hyp{border-color:#e3c48a;border-style:dashed;background:#fffaf0}
      .detail-panel .attributes{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}
      .detail-panel .attributes small{width:100%;margin-bottom:2px}
      .detail-panel .attributes span{font-size:12px;padding:5px 9px;border:1px solid var(--border);border-radius:20px;background:#fff}
      .detail-panel .demo-note{display:flex;gap:10px;align-items:center;margin:6px 0;padding:10px;border-left:3px solid #e08a1e;background:#fff7ec;border-radius:6px}
      .detail-panel .demo-note p{margin:0;font-size:12px;color:#6b5330}
      .detail-panel .rel-block{margin:10px 0 4px;display:grid;gap:6px}
      .detail-panel .edge-type{justify-self:start;font-size:12px;font-weight:700;border:1px solid;padding:5px 9px;border-radius:6px;background:#fff;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
      .detail-panel .edge-type code{font-size:11px;color:var(--muted);font-weight:400}
      .detail-panel .score-value{display:flex;align-items:baseline;gap:6px;margin:0}
      .detail-panel .score-value b{font-size:32px;color:#14161f;font-variant-numeric:tabular-nums}
      .detail-panel .score-value span{font-size:13px;color:var(--muted)}
      .detail-panel .score-none{margin:0;font-size:13px;color:#6b5330}
      .detail-panel .breakdown{list-style:none;margin:0;padding:0;display:grid;gap:5px}
      .detail-panel .breakdown li{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(60px,1fr) 30px;gap:8px;align-items:center;font-size:11px;color:#3a3d4a}
      .detail-panel .breakdown em{font-style:normal;color:var(--muted)}
      .detail-panel .breakdown i{display:block;height:6px;border-radius:4px;background:#e2ecf8;overflow:hidden}
      .detail-panel .breakdown i b{display:block;height:100%;background:linear-gradient(90deg,#4f9df0,#1f50c8)}
      .detail-panel .breakdown output{text-align:right;font-variant-numeric:tabular-nums}
      .detail-panel .score-note{margin:2px 0 0;font-size:11px;color:var(--muted);line-height:1.5}
      .detail-panel .differential{display:grid;gap:6px;margin:6px 0 10px}
      .detail-panel .differential>div{display:flex;flex-wrap:wrap;gap:4px;align-items:center;font-size:11px}
      .detail-panel .differential b{font-size:11px;color:#2e3140;margin-right:4px}
      .detail-panel .differential span{border:1px dashed var(--border);border-radius:12px;padding:2px 7px;color:#3a3d4a}
      .detail-panel .explanation{display:grid;gap:8px;margin:8px 0}
      .detail-panel .signal{border:1px solid var(--line);border-radius:10px;padding:10px;background:#fff}
      .detail-panel .signal header{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12px;font-weight:700}
      .detail-panel .signal header em{font-style:normal;color:var(--muted);font-weight:600}
      .detail-panel .signal p{margin:6px 0 0;font-size:12px;line-height:1.65;color:#33445e}
      .detail-panel .signal-creative_hypothesis{border-style:dashed;background:#fffaf0}
      .detail-panel .relation-evidence{display:grid;gap:6px;margin:10px 0}
      .detail-panel .relation-evidence>a,.detail-panel .relation-evidence>div{display:grid;gap:3px;border:1px solid var(--border);border-radius:8px;padding:9px;color:inherit;background:#fff;text-decoration:none}
      .detail-panel .relation-evidence>a:hover{border-color:var(--accent)}
      .detail-panel .relation-evidence b{font-size:11px;color:var(--accent)}
      .detail-panel .relation-evidence span{font-size:12px;line-height:1.45}
      .detail-panel .relation-evidence em{font-style:normal;font-size:11px;color:var(--muted)}
      .detail-panel .relation-evidence .missing b{color:#c0392b}
      .detail-panel .no-evidence{margin:0;padding:10px;border:1px dashed #e3c48a;background:#fffaf0;border-radius:8px;font-size:12px;line-height:1.6;color:#6b5330}
      .detail-panel .map-caveat{padding:9px 10px;border-left:3px solid #c27c0e;background:#fff7ec;font-size:11px;line-height:1.6;color:#6b5330;margin:8px 0;border-radius:4px}
      .detail-panel .versions{display:grid;gap:4px;margin:8px 0;padding:10px;border:1px dashed var(--border);border-radius:8px;background:#fff}
      .detail-panel .versions p{margin:0;font-size:12px;color:#3a3d4a;line-height:1.5}
      .detail-panel .versions b{color:#14161f;margin-right:4px}
      .detail-panel .evaluation{display:grid;gap:6px;margin:10px 0;padding:12px;border:1px solid var(--line);border-radius:10px;background:#fff}
      .detail-panel .rating-row{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:#2e3140;flex-wrap:wrap}
      .detail-panel .rating-row>div{display:flex;gap:3px}
      .detail-panel .rating-row button{width:30px;height:30px;border-radius:50%;border:1px solid var(--border);background:#f6faff;color:#3a3d4a;font-size:12px;font-weight:700;cursor:pointer}
      .detail-panel .rating-row button[aria-checked=true]{background:var(--accent);border-color:var(--accent);color:#fff}
      .detail-panel .connections{border-top:1px solid var(--line);margin:12px 0 4px;padding-top:12px;display:grid;gap:6px}
      .detail-panel .connections p{font-size:12px;color:var(--muted);margin:2px 0;line-height:1.6}
      .detail-panel .connections button{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--border);color:var(--text);font-size:13px;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;min-height:40px}
      .detail-panel .connections button:disabled{opacity:.55;cursor:not-allowed}
      .detail-panel .connections button i{width:8px;height:8px;border-radius:50%;flex:0 0 auto}
      .detail-panel .connections em{margin-left:auto;font-style:normal;font-size:11px;color:#5d6170}
      .detail-panel .panel-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
      .detail-panel .hint{width:100%;margin:2px 0 0;font-size:11px;color:var(--muted);line-height:1.5}
      .map-page .react-flow__node.cm-node{background:#fff;border:1.5px solid;border-radius:14px !important;padding:9px 12px;color:#1d2c44;box-shadow:0 3px 10px rgba(10,60,130,.12);transition:opacity .15s,box-shadow .15s;cursor:pointer}
      .map-page .react-flow__node.cm-node:hover{box-shadow:0 0 0 3px rgba(79,157,240,.25),0 6px 16px rgba(10,60,130,.18)}
      .map-page .react-flow__node.cm-not-analyzed{border-style:dashed;background:#f7f9fc}
      .map-page .react-flow__node.cm-error{border-style:dashed;background:#fff3f1}
      .map-page .react-flow__node.cm-demo{background:repeating-linear-gradient(135deg,#fff,#fff 8px,#fff6ea 8px,#fff6ea 16px);border-style:dashed}
      .map-page .react-flow__node.cm-match{box-shadow:0 0 0 4px rgba(255,196,0,.55),0 6px 16px rgba(10,60,130,.18)}
      .map-page .react-flow__node.cm-selected{box-shadow:0 0 0 4px rgba(31,80,200,.35),0 6px 16px rgba(10,60,130,.2)}
      .map-page .react-flow__node.cm-dim{opacity:.3}
      .map-page .cm-node-label{display:grid;gap:2px;text-align:center}
      .map-page .cm-node-label b{font-size:13px;font-weight:700}
      .map-page .cm-node-label small{font-size:11px;color:#5d6170;font-weight:400}
      .map-page .lens-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:-6px 0 14px}
      .map-page .lens-row .chip-select button{display:inline-flex;align-items:center;gap:5px}
      .map-page .overlay-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#3a3d4a;min-height:32px;cursor:pointer}
      .map-page .lens-note{font-size:11px;color:var(--muted);min-width:0}
      .map-page .react-flow__node.cm-visual{padding:6px 6px 8px}
      .map-page .react-flow__node.cm-no-vdna{border-style:dashed}
      .map-page .cm-thumb{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;border:1px solid var(--line);background:#eef1ff;margin-bottom:4px}
      .map-page .cm-thumb.empty{display:grid;place-items:center;font-size:10px;letter-spacing:.08em;color:#6b6f80;background:repeating-linear-gradient(0deg,rgba(47,69,255,.06) 0 1px,transparent 1px 8px),#f7f8fc}
      .map-page .cm-palette{display:flex;justify-content:center;gap:3px;margin:2px 0}
      .map-page .cm-palette i{width:12px;height:12px;border-radius:3px;border:1px solid rgba(0,0,0,.15)}
      .detail-panel .image-compare,.detail-panel .node-visual,.detail-panel .palette-compare{display:grid;gap:6px;margin:10px 0}
      .detail-panel .ic-cols{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .detail-panel .ic-col{display:grid;gap:4px;min-width:0;align-content:start}
      .detail-panel .ic-col b{font-size:12px;color:#2e3140}
      .detail-panel .ic-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px}
      .detail-panel .ic-col .ic-grid{grid-template-columns:1fr}
      .detail-panel .ic-grid a{display:block;min-width:0}
      .detail-panel .vd-palette{display:flex;flex-wrap:wrap;gap:4px}
      .detail-panel .vd-palette span{display:inline-flex;align-items:center;gap:4px;font-size:11px;border:1px solid var(--border);border-radius:12px;padding:2px 7px 2px 3px;background:#fff}
      .detail-panel .vd-palette i,.detail-panel .palette-compare i{width:14px;height:14px;border-radius:50%;border:1px solid rgba(0,0,0,.15);display:inline-block}
      .detail-panel .vd-palette code{font-size:10px;color:var(--muted)}
      .detail-panel .palette-compare>div{display:flex;align-items:center;gap:8px;font-size:12px}
      .detail-panel .palette-compare>div b{min-width:84px;font-weight:600}
      .detail-panel .palette-compare>div span{display:flex;gap:3px;flex-wrap:wrap}
      .detail-panel .palette-compare p{margin:0;font-size:11px;color:#3a3d4a;line-height:1.6}
      .detail-panel .vlink{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--border);font-size:13px;padding:8px 10px;border-radius:8px;cursor:pointer;text-align:left;min-height:40px;color:var(--text)}
      .detail-panel .vlink i{width:14px;border-top:2px dotted #c2337a}
      .detail-panel .vlink em{margin-left:auto;font-style:normal;font-size:11px;color:#7a1d4c}
      .map-page .react-flow__edge.cm-edge:hover .react-flow__edge-path{filter:drop-shadow(0 0 3px rgba(31,80,200,.55))}
      .map-page .react-flow__edge.cm-edge{cursor:pointer}
      .map-page .cm-view-tools{display:flex;gap:6px}
      .map-page .cm-view-tools button{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border);background:linear-gradient(180deg,#fff,#f4f5f9);color:#2f4a12;border-radius:16px;padding:6px 10px;font-size:12px;font-weight:700;cursor:pointer;min-height:32px;box-shadow:0 2px 5px rgba(10,80,160,.15)}
      @media(max-width:1100px){.map-page .map-tools{grid-template-columns:minmax(0,1fr) auto}.map-page .filter-body{grid-column:1/-1}.map-page .tool-end{grid-column:1/-1;flex-direction:row;justify-content:space-between;align-items:center}.map-page .map-shell{grid-template-columns:minmax(0,1fr) 340px}}
      @media(max-width:850px){
        .map-page .map-tools{grid-template-columns:minmax(0,1fr) auto}
        .map-page .filter-toggle{display:inline-flex;min-height:40px}
        .map-page .filter-body{display:none;grid-template-columns:1fr}
        .map-page .filter-body.open{display:grid}
        .map-page .category-filter button,.map-page .filter-reset{min-height:40px}
        .map-page .map-shell{height:auto;grid-template-columns:1fr}
        .map-page .flow-wrap{height:min(62vh,520px)}
        .map-page .map-legend small{margin-left:0;width:100%}
        .map-page .cm-view-tools button{min-height:40px}
        .detail-panel .rating-row button{width:40px;height:40px}
      }
      @media(max-width:520px){.map-page .mode-row{flex-direction:column;align-items:flex-start}.map-page .map-tools{padding:10px}.map-page .map-legend{gap:10px}.map-page .collision-tray{flex-wrap:wrap}.map-page .collision-tray>a,.map-page .collision-tray>button{width:100%}}
    `}</style>
  </div>;
}
