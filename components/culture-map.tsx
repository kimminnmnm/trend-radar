"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { Background, Controls, Edge, MiniMap, Node, ReactFlow, useEdgesState, useNodesState } from "@xyflow/react";
import { ArrowRight, Info, Network } from "lucide-react";
import { trends } from "@/lib/demo-data";
import { getCollisions, getLiveAnalyses } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { buildCultureEdges, edgeStyles, SEMANTIC_THRESHOLD, type CultureEdge, type GraphEdgeType } from "@/lib/culture-graph";
import { trendPath } from "@/lib/live-trend";
import type { LiveAnalysisSnapshot } from "@/lib/types";
import { DataBadge, formatDateTime, PageHeader, StatusPill } from "./ui";

const positions=[[0,120],[230,0],[480,60],[650,230],[440,370],[170,350],[-80,300],[720,20]];
const demoNodes:Node[]=trends.map((t,i)=>({id:t.id,position:{x:positions[i][0],y:positions[i][1]},data:{label:t.name},style:{background:"#e2e2e2",border:`1px solid ${t.accent}`,color:"#242424",borderRadius:40,fontSize:11,padding:"11px 16px",width:150,boxShadow:`0 0 22px ${t.accent}18`}}));
const demoEdges:Edge[]=[
  {id:"1",source:"heisei-retro",target:"digital-camera",label:"저해상도 · 기록",animated:true,style:{stroke:"#1818a7"},labelStyle:{fill:"#6f6f6f",fontSize:8}},
  {id:"2",source:"heisei-retro",target:"character-custom",label:"꾸미기 · 개인화",style:{stroke:"#1818a8"},labelStyle:{fill:"#6f6f6f",fontSize:8}},
  {id:"3",source:"heisei-retro",target:"retro-game",label:"픽셀 미학",style:{stroke:"#868686",strokeDasharray:"4 4"}},
  {id:"4",source:"character-custom",target:"kidult",label:"수집 · 자기표현",style:{stroke:"#9b7524"}},
  {id:"5",source:"analog-log",target:"digital-camera",label:"기록 행동",style:{stroke:"#9a6024"}},
  {id:"6",source:"vocaloid",target:"character-custom",label:"팬 창작",style:{stroke:"#1818a8",strokeDasharray:"4 4"}},
  {id:"7",source:"balletcore",target:"analog-log",label:"루틴",style:{stroke:"#912256",strokeDasharray:"4 4"}},
  {id:"8",source:"kidult",target:"retro-game",label:"놀이 · 수집",style:{stroke:"#602293"}},
];
const liveAccent=(snapshot:LiveAnalysisSnapshot)=>snapshot.dna?"#1818a8":"#868686";

function liveGraph(snapshots:LiveAnalysisSnapshot[],edges:CultureEdge[]){
  const radius=Math.max(180,snapshots.length*55);
  const nodes:Node[]=snapshots.map((snapshot,index)=>{const angle=(index/snapshots.length)*Math.PI*2-Math.PI/2;const accent=liveAccent(snapshot);return{id:snapshot.trendId,position:{x:Math.cos(angle)*radius,y:Math.sin(angle)*radius},data:{label:snapshot.trendName},style:{background:"#e4e4e4",border:`1px ${snapshot.dna?"solid":"dashed"} ${accent}`,color:"#242424",borderRadius:40,fontSize:11,padding:"11px 16px",width:150,boxShadow:`0 0 22px ${accent}22`}}});
  // 같은 쌍의 여러 관계는 한 선으로 그리고 가장 강한 근거 유형의 스타일을 쓴다. 개별 관계는 패널에서 확인한다.
  const strength:GraphEdgeType[]=["Observed Connection","Shared Cultural Attribute","Semantic Similarity","Hypothesized Connection"];
  const pairs=new Map<string,CultureEdge[]>();
  for(const edge of edges){const key=`${edge.source}|${edge.target}`;pairs.set(key,[...(pairs.get(key)??[]),edge])}
  const flowEdges:Edge[]=[...pairs.values()].map(group=>{const primary=[...group].sort((a,b)=>strength.indexOf(a.type)-strength.indexOf(b.type))[0];const style=edgeStyles[primary.type];return{id:primary.id,source:primary.source,target:primary.target,label:group.length>1?`${primary.type} +${group.length-1}`:primary.label,animated:style.animated,style:{stroke:style.stroke,strokeDasharray:style.dash,strokeWidth:1+group.length*.6},labelStyle:{fill:"#626262",fontSize:8},labelBgStyle:{fill:"#e6e6e6"}}});
  return{nodes,flowEdges};
}

function Flow({nodes:initialNodes,edges:initialEdges,onNodeClick,onEdgeClick,nodeColor}:{nodes:Node[];edges:Edge[];onNodeClick:(id:string)=>void;onEdgeClick?:(id:string)=>void;nodeColor:(id:string)=>string}){
  const [nodes,,onNodesChange]=useNodesState(initialNodes);const [edges,,onEdgesChange]=useEdgesState(initialEdges);
  return <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={(_,node)=>onNodeClick(node.id)} onEdgeClick={(_,edge)=>onEdgeClick?.(edge.id)} fitView colorMode="light" defaultEdgeOptions={{type:"step"}} minZoom={.35} maxZoom={1.7} proOptions={{hideAttribution:true}}><Background color="#dadee5" gap={32} size={1}/><Controls/><MiniMap nodeColor={(node)=>nodeColor(node.id)} maskColor="rgba(234,234,234,.72)"/></ReactFlow>;
}

export function CultureMap(){
  const snapshots=useStored(getLiveAnalyses);
  const collisions=useStored(getCollisions);
  const live=useMemo(()=>(snapshots??[]).filter(item=>item.whyReport),[snapshots]);
  const edges=useMemo(()=>buildCultureEdges(live,collisions??[]),[live,collisions]);
  const graph=useMemo(()=>liveGraph(live,edges),[live,edges]);
  const [modeChoice,setModeChoice]=useState<"live"|"demo"|null>(null);
  const mode=modeChoice??(live.length?"live":"demo");
  const [selectedDemo,setSelectedDemo]=useState(trends[0]);
  const [selectedLiveId,setSelectedLiveId]=useState<string|null>(null);
  const [selectedEdgeId,setSelectedEdgeId]=useState<string|null>(null);
  const selectedLive=live.find(item=>item.trendId===selectedLiveId)??live[0]??null;
  const selectedEdge=edges.find(edge=>edge.id===selectedEdgeId)??null;
  const nodeEdges=selectedLive?edges.filter(edge=>edge.source===selectedLive.trendId||edge.target===selectedLive.trendId):[];
  const nameOf=(id:string)=>live.find(item=>item.trendId===id)?.trendName??id;
  const onDemoNode=useCallback((id:string)=>setSelectedDemo(trends.find(t=>t.id===id)??trends[0]),[]);
  const counts=edges.reduce((acc,edge)=>({...acc,[edge.type]:(acc[edge.type]??0)+1}),{} as Partial<Record<GraphEdgeType,number>>);
  const graphKey=`${live.map(item=>`${item.trendId}:${item.dnaGeneratedAt??""}`).join("|")}#${edges.length}`;

  return <div className="page map-page"><PageHeader eyebrow="04 / CULTURE MAP" title="See what culture shares." description="저장된 LIVE 분석이 노드가 되고, 모든 연결은 생성 근거와 관계 유형을 가집니다. 임베딩 유사도는 의미적 근접성일 뿐 함께 확산된다는 증거가 아닙니다."/>
    <div className="mode-row"><div className="chip-select"><button type="button" aria-pressed={mode==="live"} onClick={()=>setModeChoice("live")}>LIVE GRAPH · {live.length}</button><button type="button" aria-pressed={mode==="demo"} onClick={()=>setModeChoice("demo")}>DEMO GRAPH</button></div><DataBadge status={mode==="demo"?"DEMO":live.length?"SAVED":"NOT ANALYZED"} detail={mode==="live"&&live.length?`노드 ${live.length} · 엣지 ${edges.length}`:undefined}/></div>
    {mode==="live"?<>
      <div className="map-legend">{(Object.keys(edgeStyles) as GraphEdgeType[]).map(type=><span key={type}><i style={{borderTop:`1px ${edgeStyles[type].dash?"dashed":"solid"} ${edgeStyles[type].stroke}`}}/>{type} <b>{counts[type]??0}</b></span>)}<small><Info size={12}/> 의미 유사 기준 cos ≥ {SEMANTIC_THRESHOLD}</small></div>
      {live.length===0?<div className="state-box panel" data-testid="map-empty"><DataBadge status="NOT ANALYZED"/><h3>아직 LIVE 분석된 트렌드가 없습니다.</h3><p>Discover나 TREND WHY에서 키워드를 LIVE 분석하면 노드가 추가됩니다. 연결을 만들려면 2개 이상의 트렌드에 DNA 분석이 필요합니다.</p><Link className="button primary" href="/discover">Analyze a keyword</Link></div>:
      <div className="map-shell panel"><div className="flow-wrap"><Flow key={graphKey} nodes={graph.nodes} edges={graph.flowEdges} onNodeClick={id=>{setSelectedLiveId(id);setSelectedEdgeId(null)}} onEdgeClick={setSelectedEdgeId} nodeColor={id=>{const s=live.find(item=>item.trendId===id);return s?liveAccent(s):"#777777"}}/></div>
        <aside>{selectedEdge?<><header><div><small>SELECTED EDGE</small><h2>{nameOf(selectedEdge.source)} ↔ {nameOf(selectedEdge.target)}</h2></div><Network/></header><div className="edge-type" style={{borderColor:edgeStyles[selectedEdge.type].stroke,color:edgeStyles[selectedEdge.type].stroke}}>{selectedEdge.type}</div><p>{selectedEdge.basis}</p>{selectedEdge.evidenceIds.length>0&&<div className="attributes"><small>EVIDENCE</small>{selectedEdge.evidenceIds.map(id=><span key={id}>{id.split(":").slice(-1)[0]}</span>)}</div>}<button className="button" onClick={()=>setSelectedEdgeId(null)}>Back to node</button></>:selectedLive&&<><header><div><small>SELECTED NODE · LIVE</small><h2 data-testid="selected-culture-node">{selectedLive.trendName}</h2></div><Network/></header>
          <dl className="node-meta"><dt>ID</dt><dd>{selectedLive.trendId}</dd><dt>분석</dt><dd>{formatDateTime(selectedLive.analyzedAt)}</dd><dt>DNA</dt><dd>{selectedLive.dna?`완료 · ${formatDateTime(selectedLive.dnaGeneratedAt)}`:"미분석"}</dd><dt>소스</dt><dd>NAVER {selectedLive.evidence?.filter(e=>e.kind==="naver_series").length??0} · Instagram {selectedLive.evidence?.filter(e=>e.kind==="instagram_media").length??0}</dd><dt>키워드</dt><dd>{selectedLive.keywords.join(", ")}</dd></dl>
          {selectedLive.dna&&<div className="attributes"><small>DOMINANT PATTERN</small><p className="pattern">{selectedLive.dna.dominantPattern.title}</p><StatusPill status={selectedLive.dna.dominantPattern.status}/></div>}
          <div className="connections"><small>CONNECTIONS · {nodeEdges.length}</small>{nodeEdges.length?nodeEdges.map(edge=><button key={edge.id} onClick={()=>setSelectedEdgeId(edge.id)}><i style={{background:edgeStyles[edge.type].stroke}}/>{nameOf(edge.source===selectedLive.trendId?edge.target:edge.source)}<em>{edge.type}</em></button>):<p>{selectedLive.dna?"다른 트렌드와 공통 속성·관찰된 연결·의미 유사가 아직 없습니다.":"DNA 분석 후 연결을 계산합니다."}</p>}</div>
          <Link href={trendPath(selectedLive.trendId,"dna")} className="button">Inspect DNA <ArrowRight size={14}/></Link><Link href="/collision" className="button primary">Start collision <ArrowRight size={14}/></Link></>}
        </aside></div>}
    </>:<>
      <div className="map-legend"><span><i className="solid"/>공통 속성</span><span><i className="dash"/>의미적 유사성</span><span><i className="glow"/>선택 경로</span><small><Info size={12}/> 모든 연결은 데모 가설입니다.</small></div>
      <div className="map-shell panel"><div className="flow-wrap"><Flow nodes={demoNodes} edges={demoEdges} onNodeClick={onDemoNode} nodeColor={id=>trends.find(t=>t.id===id)?.accent??"#777777"}/></div><aside><header><div><small>SELECTED NODE · DEMO</small><h2 data-testid="selected-culture-node">{selectedDemo.name}</h2></div><Network/></header><p>{selectedDemo.summary}</p><div className="attributes"><small>SHARED ATTRIBUTES</small>{selectedDemo.tags.map(t=><span key={t}>{t}</span>)}</div><StatusPill status={selectedDemo.status}/><div className="connections"><small>STRONGEST ROUTES (DEMO)</small><p>→ 헤이세이 레트로</p><p>→ 캐릭터 커스터마이징</p></div><Link href={`/trends/${selectedDemo.id}/dna`} className="button">Inspect DNA <ArrowRight size={14}/></Link><Link href="/collision" className="button primary">Start collision <ArrowRight size={14}/></Link></aside></div>
    </>}
    <style jsx>{`.mode-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;gap:12px}.map-legend{display:flex;gap:18px;align-items:center;margin-bottom:13px;color:#6b6b6b;font-size:9px;flex-wrap:wrap}.map-legend span{display:flex;align-items:center;gap:7px}.map-legend b{color:#262626;font-weight:500}.map-legend i{display:block;width:25px;border-top:1px solid #727272}.map-legend .dash{border-style:dashed}.map-legend .glow{border-color:var(--accent);box-shadow:0 0 6px var(--accent)}.map-legend small{display:flex;gap:6px;align-items:center;margin-left:auto;color:#898989}.map-shell{height:650px;display:grid;grid-template-columns:1fr 330px;overflow:hidden}.flow-wrap{height:100%;background:radial-gradient(circle at 50% 50%,#dfdfdf,#e8e8e8)}.map-shell aside{padding:27px;border-left:1px solid var(--border);display:flex;flex-direction:column;background:#e4e4e4;overflow-y:auto}.map-shell aside header{display:flex;justify-content:space-between;align-items:flex-start}.map-shell aside header :global(svg){color:var(--accent)}.map-shell aside small{color:#8a8a8a;font-size:8px;letter-spacing:.12em}.map-shell aside h2{font-size:21px;font-weight:500;margin:9px 0}.map-shell aside>p{color:var(--muted);font-size:11px;line-height:1.8}.edge-type{align-self:flex-start;font-size:9px;border:1px solid;padding:5px 8px;border-radius:4px;margin:8px 0}.node-meta{display:grid;grid-template-columns:52px 1fr;gap:7px 10px;font-size:9px;margin:10px 0}.node-meta dt{color:#8a8a8a}.node-meta dd{margin:0;color:#424242;word-break:break-all}.pattern{font-size:11px;margin:4px 0 8px;width:100%}.attributes{display:flex;flex-wrap:wrap;gap:6px;margin:18px 0}.attributes small{width:100%;margin-bottom:5px}.attributes span{font-size:9px;padding:6px 8px;border:1px solid var(--border);border-radius:20px}.connections{border-top:1px solid var(--border);margin:18px 0 auto;padding-top:16px;display:grid;gap:6px}.connections p{font-size:10px;color:#565656;margin:4px 0}.connections button{display:flex;align-items:center;gap:8px;background:#e6e6e6;border:1px solid var(--border);color:var(--text);font-size:10px;padding:8px;border-radius:5px;cursor:pointer;text-align:left}.connections button i{width:7px;height:7px;border-radius:50%;flex:0 0 auto}.connections em{margin-left:auto;font-style:normal;font-size:7px;color:#7a7a7a}.map-shell aside>.button{margin-top:7px}@media(max-width:850px){.map-shell{height:auto;grid-template-columns:1fr;grid-template-rows:480px auto}.map-shell aside{border-left:0;border-top:1px solid var(--border)}.map-legend small{display:none}}@media(max-width:520px){.mode-row{flex-direction:column;align-items:flex-start}}`}</style>
  </div>
}
