"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { buildCultureGraph, type RelationTypeKey } from "@/lib/culture-graph";
import { trendPath } from "@/lib/live-trend";
import type { DiscoveryReport } from "@/lib/discovery";
import type { LiveAnalysisSnapshot, SavedCollision } from "@/lib/types";
import { formatDateTime } from "./ui";
import { useInView } from "./motion";

/** NAVER 응답에 저장된 시계열(분석 요청 하나 안에서 최댓값 100인 상대 지수). */
type NaverSeries = { title: string; keywords?: string[]; data: Array<{ period: string; ratio: number }> };
const naverSeriesOf = (snapshot: LiveAnalysisSnapshot): NaverSeries | null => {
  const signal = snapshot.naverSignal as { series?: NaverSeries[] } | undefined;
  const series = signal?.series ?? [];
  const own = series.find((item) => item.title === snapshot.trendName || item.keywords?.includes(snapshot.trendName)) ?? series[0];
  return own && own.data?.length > 1 ? own : null;
};

const EDGE_STYLE: Record<RelationTypeKey, { stroke: string; dash?: string; label: string }> = {
  observed_connection: { stroke: "#111111", label: "관찰된 연결" },
  shared_attribute: { stroke: "#303cff", label: "공통 속성" },
  semantic_similarity: { stroke: "#303cff", dash: "2 4", label: "의미 유사" },
  creative_hypothesis: { stroke: "#753bff", dash: "7 5", label: "창작 가설" },
};
const W = 420, H = 300, CX = W / 2, CY = H / 2;

/**
 * Editorial Web 히어로의 SIGNAL VISUALIZER.
 * - 노드: 저장된 LIVE 분석(최근 8개). 크기 = 근거 수, 라임 = DNA 완료. 관계선: Culture Map 관계(근거·Collision이 있는 것만). 관계가 없으면 선을 그리지 않는다.
 * - 파형: 선택한 트렌드의 저장된 NAVER 상대 관심도 시계열만. 없으면 그리지 않는다.
 * - 데이터를 다시 받지 않는다(유료 호출 없음). 움직임은 선택 전환에만 쓰고, 실시간 변화처럼 보이게 하지 않는다.
 */
export function SignalVisualizer({ live, collisions, discoveries }: { live: LiveAnalysisSnapshot[]; collisions: SavedCollision[]; discoveries: DiscoveryReport[] }) {
  const nodes = useMemo(() => live.slice(0, 8), [live]);
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  // 화면 밖에서는 은은한 움직임을 멈춘다(class is-visible이 없으면 CSS가 animation-play-state: paused).
  const [rootRef, visible] = useInView<HTMLDivElement>({ once: false, rootMargin: "0px" });
  const relations = useMemo(() => {
    const ids = new Set(nodes.map((item) => item.trendId));
    return buildCultureGraph(nodes.filter((item) => item.whyReport), collisions).relations.filter((relation) => ids.has(relation.source) && ids.has(relation.target));
  }, [nodes, collisions]);
  const maxEvidence = Math.max(1, ...nodes.map((item) => item.evidence?.length ?? 0));
  const position = (index: number) => {
    if (nodes.length === 1) return { x: CX, y: CY };
    // 두 개면 좌우, 세 개 이상이면 타원 둘레에 고르게(위에서 시작). 위치는 의미가 없고 겹치지 않게만 둔다.
    const angle = (nodes.length === 2 ? Math.PI : -Math.PI / 2) + (index / nodes.length) * Math.PI * 2;
    const rx = nodes.length <= 2 ? 110 : 150, ry = nodes.length <= 2 ? 0 : 100;
    return { x: CX + Math.cos(angle) * rx, y: CY + Math.sin(angle) * ry };
  };
  const at = new Map(nodes.map((item, index) => [item.trendId, position(index)]));
  const focus = nodes.find((item) => item.trendId === selected) ?? null;
  const linked = new Set(relations.filter((relation) => relation.source === (hover ?? selected) || relation.target === (hover ?? selected)).flatMap((relation) => [relation.source, relation.target]));
  const series = focus ? naverSeriesOf(focus) : null;
  const phenomena = focus ? discoveries.filter((report) => [focus.trendName, ...focus.keywords].some((key) => key.trim().toLocaleLowerCase("ko-KR") === report.keyword.trim().toLocaleLowerCase("ko-KR"))).flatMap((report) => report.signals).slice(0, 3) : [];
  const usedTypes = [...new Set(relations.map((relation) => relation.primary.relationType))];

  if (!nodes.length) return <div className="sv sv-empty" data-testid="signal-visualizer-empty">
    <b>SIGNAL VISUALIZER</b>
    <p>아직 분석한 트렌드가 없어 그릴 신호가 없습니다. 키워드를 분석하면 트렌드가 노드로, 근거가 있는 관계만 선으로 나타납니다.</p>
    <Link className="button" href="/discover">첫 키워드 분석하기</Link>
  </div>;

  return <div className={`sv ${visible ? "is-visible" : ""} ${selected ? "has-selection" : ""}`} ref={rootRef} data-testid="signal-visualizer">
    <div className="sv-head"><b>SIGNAL NETWORK</b><span>저장된 분석 {nodes.length}개 · 근거 있는 관계 {relations.length}개</span>{selected && <button type="button" className="sv-reset" onClick={() => setSelected(null)} data-testid="sv-reset"><RotateCcw size={13}/>전체 보기</button>}</div>
    <svg className="sv-net" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="분석한 트렌드 관계 네트워크">
      {/* 은은한 움직임은 선과 노드를 함께 담은 이 층 전체에만 준다 — 선 끝과 노드 중심이 어긋나지 않는다. */}
      <g className="sv-layer">
      {relations.map((relation, edgeIndex) => {
        const a = at.get(relation.source)!, b = at.get(relation.target)!;
        const style = EDGE_STYLE[relation.primary.relationType];
        const active = linked.has(relation.source) && linked.has(relation.target) && (hover ?? selected) !== null;
        return <line key={relation.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={style.stroke} strokeDasharray={style.dash} strokeWidth={active ? 3 : 1.5} opacity={(hover ?? selected) && !active ? .25 : 1} className={`sv-edge ${style.dash ? "dashed" : "solid"}`} pathLength={style.dash ? undefined : 1} style={{ "--i": edgeIndex } as React.CSSProperties} data-relation={relation.primary.relationType}><title>{`${style.label} · ${relation.primary.label}`}</title></line>;
      })}
      {nodes.map((item, nodeIndex) => {
        const p = at.get(item.trendId)!;
        const r = 11 + 13 * Math.sqrt((item.evidence?.length ?? 0) / maxEvidence);
        const isSel = selected === item.trendId, dim = (hover ?? selected) !== null && !isSel && hover !== item.trendId && !linked.has(item.trendId);
        return <g key={item.trendId} className={`sv-node ${isSel ? "on" : ""}`} style={{ "--i": nodeIndex } as React.CSSProperties} transform={`translate(${p.x} ${p.y})`} opacity={dim ? .35 : 1} tabIndex={0} role="button" aria-pressed={isSel} aria-label={`${item.trendName} · 근거 ${item.evidence?.length ?? 0}개${item.dna ? " · DNA 완료" : ""}`}
          onMouseEnter={() => setHover(item.trendId)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(item.trendId)} onBlur={() => setHover(null)}
          onClick={() => setSelected(isSel ? null : item.trendId)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(isSel ? null : item.trendId); } }} data-testid="sv-node">
          <g className="sv-breathe"><circle r={r} fill={item.dna ? "#dfff32" : "#ffffff"} stroke="#111111" strokeWidth={isSel ? 4 : 2}/></g>
          {isSel && <circle r={r + 7} fill="none" stroke="#303cff" strokeWidth={2} className="sv-ring"/>}
          <text y={r + 16} textAnchor="middle">{item.trendName}</text>
        </g>;
      })}
      </g>
    </svg>
    <ul className="sv-legend" aria-label="범례">
      <li><i className="dot dna"/>DNA 완료</li><li><i className="dot"/>WHY만</li><li><i className="size"/>크기 = 근거 수</li>
      {usedTypes.map((type) => <li key={type}><i className="ln" style={{ borderTopColor: EDGE_STYLE[type].stroke, borderTopStyle: EDGE_STYLE[type].dash ? "dashed" : "solid" }}/>{EDGE_STYLE[type].label}</li>)}
      {!relations.length && <li className="none">근거 있는 관계 없음 — 선을 그리지 않음</li>}
    </ul>
    {/* 키보드·모바일: 노드와 같은 선택을 목록으로도 제공한다. */}
    <div className="sv-chips" role="group" aria-label="트렌드 선택">{nodes.map((item) => <button type="button" key={item.trendId} aria-pressed={selected === item.trendId} onClick={() => setSelected(selected === item.trendId ? null : item.trendId)} data-testid="sv-chip">{item.trendName}</button>)}</div>

    <div className="sv-detail" data-testid="sv-snapshot" aria-live="polite">
      {focus ? <>
        <div className="sv-snap-head"><small>TREND SNAPSHOT</small><b>{focus.trendName}</b><span>마지막 분석 {formatDateTime(focus.analyzedAt)} · 근거 {focus.evidence?.length ?? 0}개{focus.dna ? " · DNA 완료" : ""}</span></div>
        {series ? <SignalWave key={focus.trendId} series={series}/> : <p className="sv-note" data-testid="sv-wave-missing">저장된 NAVER 시계열이 없어 파형을 그리지 않습니다.</p>}
        <div className="sv-phen"><small>RELATED PHENOMENA</small>{phenomena.length ? <ul>{phenomena.map((signal) => <li key={signal.signalId}><b>{signal.title}</b><em>{signal.verificationStatus}</em></li>)}</ul> : <p className="sv-note">이 키워드로 찾은 세부 현상이 아직 없습니다.</p>}</div>
        <div className="sv-links"><Link className="button" href={trendPath(focus.trendId, "why")}>WHY</Link><Link className="button" href={trendPath(focus.trendId, "dna")}>DNA</Link><Link className="button primary" href={`/studio?trend=${encodeURIComponent(focus.trendId)}`}>CREATE</Link></div>
      </> : <p className="sv-note">노드나 아래 이름을 누르면 그 트렌드의 최근 분석, 근거 수, NAVER 상대 관심도 흐름, 관련 현상이 보입니다.</p>}
    </div>
  </div>;
}

/** 선택한 트렌드의 저장된 NAVER 상대 관심도(그 분석 요청 안에서 최댓값 = 100). 실제 검색량이 아니며, 다른 트렌드와 높이를 비교하지 않는다. */
function SignalWave({ series }: { series: NaverSeries }) {
  const w = 360, h = 90, pad = 4;
  const values = series.data.map((point) => point.ratio);
  const max = Math.max(...values, 1);
  const pts = series.data.map((point, index) => ({ ...point, x: pad + (index / (series.data.length - 1)) * (w - pad * 2), y: h - pad - (point.ratio / max) * (h - pad * 2) }));
  const path = pts.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover === null ? pts[pts.length - 1] : pts[hover];
  return <figure className="sv-wave" data-testid="sv-wave">
    <figcaption><small>NAVER 상대 관심도 · 실제 검색량 아님</small><span>{shown.period} · <b>{Math.round(shown.ratio * 10) / 10}</b></span></figcaption>
    <div className="sv-plot"><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`${series.title} 상대 관심도 ${series.data[0].period}부터 ${series.data[series.data.length - 1].period}까지 ${series.data.length}개 측정점`} onMouseLeave={() => setHover(null)}>
      <path d={`${path} L${pts[pts.length - 1].x} ${h} L${pts[0].x} ${h} Z`} className="area"/>
      <path d={path} className="line" pathLength={1}/>
      {pts.map((point, index) => <rect key={point.period} x={point.x - (w / pts.length) / 2} y={0} width={w / pts.length} height={h} fill="transparent" onMouseEnter={() => setHover(index)}/>)}

    </svg>
    <i className="sv-pt" aria-hidden style={{ left: `${(shown.x / w) * 100}%`, top: `${(shown.y / h) * 100}%` }}/></div>
    <p className="sv-range"><span>{series.data[0].period}</span><span>측정점 {series.data.length}개 · 그 분석 요청 안 최댓값 = 100</span><span>{series.data[series.data.length - 1].period}</span></p>
  </figure>;
}
