"use client";

import Link from "next/link";
import { apiFetch } from "@/lib/api-fetch";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Atom, LoaderCircle, Orbit, Play, RotateCcw, ScanSearch } from "lucide-react";
import type { DataStatus, LiveAnalysisSnapshot, Trend } from "@/lib/types";
import type { TrendDna } from "@/lib/schemas";
import type { ValidationLog } from "@/lib/signal";
import { evidenceLookup } from "@/lib/signal";
import { getLiveAnalyses, updateLiveAnalysis } from "@/lib/storage";
import { persistLiveDna } from "@/lib/cloud-storage";
import { CULTURE_ALIAS_RULES } from "@/lib/culture-alias-rules";
import { describePipeline, runCulturePipeline, syncCultureLedgerLocal } from "@/lib/culture-pipeline-client";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import { dna as demoDna } from "@/lib/demo-data";
import { standardizeCultureMetadata } from "@/lib/culture-metadata";
import { DataBadge, EvidenceRefs, formatDateTime, PageHeader, SectionHeading, StatusPill } from "./ui";

const colors:Record<string,string>={Aesthetic:"#1f50c8",Emotion:"#c2185b",Behavior:"#1b8a7a",Object:"#c27c0e",Culture:"#c4372b",Audience:"#6b3fa0"};
const dimensionNotes:Record<string,string>={Aesthetic:"시각 기호와 재질감이 트렌드를 처음 인식하게 만드는 층위",Emotion:"사람들이 트렌드에 머물게 하는 정서적 보상에 대한 가설",Behavior:"관찰 가능한 참여, 수집, 공유 방식",Object:"문화가 구체적으로 투영되는 제품과 사물",Culture:"참조하는 시대·하위문화·커뮤니티 맥락",Audience:"관심을 보일 가능성이 있는 집단에 대한 탐색 가설"};

type DnaResponse = { cached: boolean; dna: TrendDna; model: string; generatedAt: string; promptVersion: string; validation: ValidationLog; embedding: number[] | null };

export function DNAView({trend}:{trend:Trend}){
  const snapshots=useStored(getLiveAnalyses);
  const isLive=trend.category==="Live";
  const liveId=isLive?trend.id:liveTrendId(trend.name);
  const snapshot=snapshots?.find(item=>item.trendId===liveId)??null;
  return <div className="page">
    <PageHeader eyebrow={`03 / TREND DNA${isLive?" · LIVE":""}`} title="The culture beneath the keyword." description={`${snapshot?.trendName??trend.name}을(를) 하나의 유행어가 아닌 감각, 감정, 행동, 사물, 문화, 사람의 조합으로 읽습니다.`}/>
    {isLive?<LiveDna trend={trend} snapshot={snapshot} loading={snapshots===null}/>:<DemoDna trend={trend} liveSnapshot={snapshot}/>}
    <section className="section next-step"><div><small>NEXT LENS</small><h2>어떤 다른 문화도<br/>같은 행동을 공유할까요?</h2></div><div className="next-links"><Link href="/culture-map" className="button">Open Culture Map <ArrowRight size={14}/></Link><Link href="/collision" className="button primary">Start collision <ArrowRight size={14}/></Link></div></section>
    <style jsx global>{`.live-context{margin-bottom:12px;padding:18px;border-color:#d5d9ea;background:#f4f5f9;display:grid;grid-template-columns:180px 1fr auto;gap:6px 18px;align-items:center}.live-context small{font-size:11px;color:var(--mint);letter-spacing:.12em}.live-context strong{font-size:14px}.live-context p{grid-column:1/-1;margin:5px 0;font-size:12px;color:#494949;line-height:1.6}.live-context span{font-size:11px;color:#858585}.dna-hero{padding:32px;display:grid;grid-template-columns:220px 1fr;align-items:center;gap:35px;background:radial-gradient(circle at 13% 50%,rgba(24,24,167,.1),transparent 20%),#f4f5f9}.atom-visual{height:190px;position:relative;display:grid;place-items:center}.atom-visual i{position:absolute;width:150px;height:60px;border:1px solid #d5d9ea;border-radius:50%;transform:rotate(0)}.atom-visual i:nth-child(2){transform:rotate(60deg);border-color:#b2b2b2}.atom-visual i:nth-child(3){transform:rotate(-60deg);border-color:#d5d9ea}.atom-visual svg{color:var(--accent)}.dna-hero small,.composition small,.next-step small{font-size:11px;color:var(--accent);letter-spacing:.13em}.dna-hero h2{font-size:35px;font-weight:500;margin:12px 0}.dna-hero p{font-size:12px;color:var(--muted);margin-bottom:16px;line-height:1.7}.hero-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dna-hero>div{min-width:0}.hero-row .data-badge{white-space:normal;flex-wrap:wrap;max-width:100%;row-gap:2px}.hero-row .button svg{width:13px}.dna-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.dna-card{min-height:235px;padding:20px;display:flex;flex-direction:column;color:var(--text);text-align:left;cursor:pointer;transition:.2s}.dna-card:hover,.dna-card.active{border-color:var(--dna-color);transform:translateY(-2px)}.dna-card.active{box-shadow:inset 0 0 0 1px var(--dna-color)}.dna-grid header{display:flex;align-items:center;gap:12px;width:100%}.dna-grid header span{font-size:11px;color:#909090}.dna-grid h3{font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin:0}.dna-grid header i{height:1px;background:var(--dna-color);flex:1}.tag-cloud{display:flex;flex-wrap:wrap;align-content:center;gap:7px;flex:1;padding:25px 0}.tag-cloud span{border:1px solid var(--border);border-radius:30px;padding:7px 10px;font-size:11px;color:#616161}.tag-cloud .primary{border-color:var(--dna-color);color:var(--dna-color);font-size:13px}.tag-cloud .weak{border-style:dashed;color:#8a8a8a}.dna-grid footer{display:flex;gap:7px;align-items:center;color:var(--dna-color);font-size:11px;width:100%}.dna-grid footer small{margin-left:auto;color:#959595}.dimension-detail{margin-top:10px;padding:24px;display:grid;grid-template-columns:160px 1fr;gap:8px 25px;align-items:center}.dimension-detail small{font-size:11px;color:var(--accent);letter-spacing:.12em}.dimension-detail h3{font-size:22px;margin:0;grid-row:2}.dimension-detail p{font-size:12px;color:var(--muted);margin:0;line-height:1.7}.dimension-detail>div{display:flex;gap:6px;flex-wrap:wrap}.dimension-detail>div span{font-size:11px;border:1px solid var(--border);padding:6px 8px;border-radius:20px}.attr-list{grid-column:1/-1;display:grid!important;gap:8px!important;margin-top:12px}.attr-list article{border-top:1px solid var(--border);padding:14px 0 4px;display:grid;grid-template-columns:200px 1fr;gap:6px 20px}.attr-list h4{font-size:13px;margin:0 0 8px;font-weight:500}.attr-list article>div:last-child{display:grid;gap:8px;justify-items:start}.attr-list ul{margin:0;padding-left:14px;font-size:11px;color:#727272;line-height:1.6}.composition{padding:35px;display:grid;grid-template-columns:1fr 1.2fr;gap:40px;align-items:center}.composition h2{font-size:26px;font-weight:500;margin:12px 0}.composition p{color:var(--muted);font-size:12px;line-height:1.7}.composition>div:last-child{display:grid;gap:10px;justify-items:start}.loop{display:flex;align-items:center;gap:8px}.loop span{font-size:11px;border:1px solid #d5d9ea;padding:12px;color:var(--accent)}.loop svg{width:14px;color:#949494}.loop i{font-style:normal;color:var(--accent);font-size:20px}.dna-missing{margin-top:10px;padding:18px;background:#f4f5f9;border:1px solid #f4f5f9}.dna-missing small{font-size:11px;color:#a17b28;letter-spacing:.12em}.dna-missing ul{font-size:11px;color:#727272;line-height:1.7;margin-bottom:0}.next-step{display:flex;align-items:flex-end;justify-content:space-between;padding:40px;border-left:1px solid var(--accent)}.next-step h2{font-size:30px;font-weight:500;letter-spacing:-.04em;line-height:1.25;margin:15px 0 0}.next-links{display:flex;gap:8px}@media(max-width:950px){.dna-grid{grid-template-columns:repeat(2,1fr)}.composition{grid-template-columns:1fr}.loop{flex-wrap:wrap}}@media(max-width:650px){.live-context{grid-template-columns:1fr}.dna-hero{grid-template-columns:1fr}.atom-visual{height:150px}.dna-grid{grid-template-columns:1fr}.dimension-detail{grid-template-columns:1fr}.dimension-detail h3{grid-row:auto}.attr-list article{grid-template-columns:1fr}.next-step{display:block;padding:40px}.next-links{margin-top:25px;flex-direction:column}.dna-grid footer small{display:none}}`}</style>
  </div>
}

function LiveDna({trend,snapshot,loading}:{trend:Trend;snapshot:LiveAnalysisSnapshot|null;loading:boolean}){
  const [selected,setSelected]=useState("Aesthetic");
  const [state,setState]=useState<"idle"|"loading"|"error">("idle");
  const [error,setError]=useState("");
  const [freshStatus,setFreshStatus]=useState<DataStatus|null>(null);
  const [message,setMessage]=useState("");
  const ledger=useMemo(()=>evidenceLookup(snapshot?.evidence),[snapshot?.evidence]);

  const run=async()=>{
    if(!snapshot?.whyReport||!snapshot.evidence?.length)return;
    setState("loading");setError("");setMessage("");
    // 재분석 전에 현재 DNA를 버전 원장에 남겨 둔다(이미 기록돼 있으면 변화 없음).
    syncCultureLedgerLocal();
    try{
      const response=await apiFetch("/api/dna",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trend:snapshot.trendName,why:snapshot.whyReport,evidence:snapshot.evidence,signalStats:snapshot.signalStats,force:Boolean(snapshot.dna)})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.message||"DNA 분석에 실패했습니다.");
      const data=body as DnaResponse;
      const cultureMetadata=standardizeCultureMetadata({trendId:snapshot.trendId,trendName:snapshot.trendName,sourceAnalyzedAt:data.generatedAt,updatedAt:data.generatedAt,dna:data.dna,evidence:snapshot.evidence,aliasRules:CULTURE_ALIAS_RULES});
      const patch={dna:data.dna,dnaGeneratedAt:data.generatedAt,dnaModel:data.model,dnaPromptVersion:data.promptVersion,dnaValidation:data.validation,embedding:data.embedding,cultureMetadata};
      updateLiveAnalysis(snapshot.trendId,patch);
      setFreshStatus(data.cached?"CACHED":"LIVE");setState("idle");
      const result=await persistLiveDna({...snapshot,...patch});
      // PHASE 5: 메타데이터 버전 기록 → 기존 트렌드와 관계 계산 → 원장·Supabase 저장. 유료 API 호출 없음.
      const pipeline=await runCulturePipeline();
      setMessage(`${result.message} ${describePipeline(pipeline)}`);
    }catch(reason){setError(reason instanceof Error?reason.message:"DNA 분석에 실패했습니다.");setState("error")}
  };

  if(loading)return <div className="state-box panel"><LoaderCircle className="spin"/><p>저장된 분석을 불러오고 있습니다.</p></div>;
  if(!snapshot?.whyReport)return <div className="state-box panel" data-testid="dna-not-analyzed"><DataBadge status="NOT ANALYZED"/><h3>LIVE WHY 분석이 먼저 필요합니다.</h3><p>TREND DNA는 실제 WHY 결과와 근거 원장을 입력으로 사용합니다. 데모 DNA를 대신 표시하지 않습니다.</p><Link className="button primary" href={trendPath(trend.id,"why")}><Orbit size={14}/>Run LIVE WHY</Link></div>;
  if(!snapshot.evidence?.length)return <div className="state-box panel"><DataBadge status="NOT AVAILABLE" detail="근거 원장 없음"/><h3>이전 버전으로 저장된 WHY입니다.</h3><p>근거 원장이 없어 근거 ID를 검증할 수 없습니다. WHY를 재분석하면 DNA를 생성할 수 있습니다.</p><Link className="button primary" href={trendPath(trend.id,"why")}>Re-analyze WHY</Link></div>;

  const dna=snapshot.dna;
  const status:DataStatus=state==="loading"?"LOADING":state==="error"&&!dna?"ERROR":dna?(freshStatus??"SAVED"):"NOT ANALYZED";
  const dimension=dna?.dimensions.find(item=>item.dimension===selected);
  const igCount=snapshot.evidence.filter(item=>item.kind==="instagram_media").length;

  return <>
    <aside className="live-context panel"><small>INPUT · LIVE WHY</small><strong>{snapshot.trendName}</strong><span>WHY 분석 {formatDateTime(snapshot.analyzedAt)} · 근거 NAVER {snapshot.evidence.length-igCount} · Instagram {igCount}</span><p>{snapshot.summary}</p></aside>
    <div className="dna-hero panel"><div className="atom-visual"><i/><i/><i/><Atom/></div><div><small>CULTURAL FINGERPRINT / LIVE</small><h2>{snapshot.trendName}</h2><p>{dna?"각 속성은 근거 원장 ID와 연결되며, 근거가 없는 속성은 Insufficient Evidence로 표시됩니다. 정량 점수가 아닌 해석 언어입니다.":"WHY 결과와 근거 원장을 OpenAI에 전달해 6차원 DNA를 생성합니다. 1회 API 호출이 발생합니다."}</p>
      <div className="hero-row"><DataBadge status={status} detail={dna?`${snapshot.dnaModel??""} · ${formatDateTime(snapshot.dnaGeneratedAt)}`:undefined}/><button className="button primary" onClick={run} disabled={state==="loading"}>{state==="loading"?<><LoaderCircle className="spin"/>Analyzing DNA…</>:dna?<><RotateCcw/>Re-analyze DNA</>:<><Play/>Run LIVE DNA analysis</>}</button></div>
      {message&&<p role="status" style={{color:"var(--mint)",fontSize: 11,marginTop:10}}>{message}</p>}
      {state==="error"&&<p role="alert" style={{color:"#952326",fontSize: 11,marginTop:10,display:"flex",gap:6,alignItems:"center"}}><AlertTriangle size={13}/>{error}{dna?" 아래는 이전에 저장된 DNA입니다.":""}</p>}
    </div></div>
    {dna&&<>
      <section className="section"><SectionHeading index="01" title="Six dimensions" description="카드를 선택하면 각 속성의 설명·근거·한계를 확인할 수 있습니다."/><div className="dna-grid">{dna.dimensions.map((item,index)=>{const grounded=item.attributes.filter(attr=>attr.evidenceIds.length).length;return <button type="button" aria-pressed={selected===item.dimension} onClick={()=>setSelected(item.dimension)} className={`dna-card panel ${selected===item.dimension?"active":""}`} key={item.dimension} style={{"--dna-color":colors[item.dimension]} as React.CSSProperties}><header><span>{String(index+1).padStart(2,"0")}</span><h3>{item.dimension}</h3><i/></header><div className="tag-cloud">{item.attributes.map((attr,i)=><span className={attr.status==="Insufficient Evidence"?"weak":i===0?"primary":""} key={attr.label}>{attr.label}</span>)}</div><footer><ScanSearch size={13}/><span>근거 연결 {grounded}/{item.attributes.length}</span><small>LIVE · OpenAI</small></footer></button>})}</div>
        {dimension&&<div className="dimension-detail panel" data-testid="dna-dimension-detail"><small>SELECTED DIMENSION</small><h3>{dimension.dimension}</h3><p>{dimension.summary}</p><div className="attr-list">{dimension.attributes.map(attr=><article key={attr.label}><div><h4>{attr.label}</h4><StatusPill status={attr.status}/></div><div><p>{attr.description}</p><EvidenceRefs ids={attr.evidenceIds} evidence={ledger}/>{attr.limitations.length>0&&<ul>{attr.limitations.map(limit=><li key={limit}>{limit}</li>)}</ul>}</div></article>)}</div></div>}
      </section>
      <section className="section composition panel"><div><small>DOMINANT PATTERN · LIVE</small><h2>{dna.dominantPattern.title}</h2><p>{dna.dominantPattern.explanation}</p></div><div><StatusPill status={dna.dominantPattern.status}/><EvidenceRefs ids={dna.dominantPattern.evidenceIds} evidence={ledger}/></div></section>
      <div className="dna-missing"><small>VERIFICATION GAPS</small><ul>{dna.missingEvidence.map(item=><li key={item}>{item}</li>)}</ul></div>
      {snapshot.dnaValidation&&<p className="validation-log">SERVER VALIDATION · 원장에 없는 근거 ID 제거 {snapshot.dnaValidation.removedEvidenceIds.length}개 · 상태 하향 {snapshot.dnaValidation.downgraded}건 · 프롬프트 {snapshot.dnaPromptVersion} · 임베딩 {snapshot.embedding?.length?"생성됨":"없음"}</p>}
    </>}
  </>;
}

function DemoDna({trend,liveSnapshot}:{trend:Trend;liveSnapshot:LiveAnalysisSnapshot|null}){
  const [selectedDimension,setSelectedDimension]=useState("Aesthetic");
  return <>
    {liveSnapshot&&<aside className="live-context panel"><small>LIVE ANALYSIS AVAILABLE</small><strong>{liveSnapshot.trendName}</strong><Link className="button" href={trendPath(liveSnapshot.trendId,"dna")}>Open LIVE DNA <ArrowRight size={13}/></Link><p>이 키워드의 LIVE WHY 분석이 저장되어 있습니다. 아래 DNA는 데모이며 LIVE 결과가 아닙니다.</p></aside>}
    <div className="dna-hero panel"><div className="atom-visual"><i/><i/><i/><Atom/></div><div><small>CULTURAL FINGERPRINT / DEMO</small><h2>{trend.name}</h2><p>모든 속성은 데모 해석이며, 정량 점수가 아닌 탐색용 언어입니다. 실제 분석은 LIVE WHY 실행 후 생성됩니다.</p><div className="hero-row"><DataBadge status="DEMO"/><StatusPill status="Creative Hypothesis"/><Link className="button" href={trendPath(liveTrendId(trend.name),"why")}>Analyze “{trend.name}” live</Link></div></div></div>
    <section className="section"><SectionHeading index="01" title="Six dimensions" description="카드를 선택해 각 문화 차원의 해석과 속성을 탐색합니다. (DEMO)"/><div className="dna-grid">{Object.entries(demoDna).map(([dimension,items],index)=><button type="button" aria-pressed={selectedDimension===dimension} onClick={()=>setSelectedDimension(dimension)} className={`dna-card panel ${selectedDimension===dimension?"active":""}`} key={dimension} style={{"--dna-color":colors[dimension]} as React.CSSProperties}><header><span>{String(index+1).padStart(2,"0")}</span><h3>{dimension}</h3><i/></header><div className="tag-cloud">{items.map((item,i)=><span className={i===0?"primary":""} key={item}>{item}</span>)}</div><footer><ScanSearch size={13}/><span>DEMO Interpretation</span><small>Evidence mapping required</small></footer></button>)}</div><div className="dimension-detail panel" data-testid="dna-dimension-detail"><small>SELECTED DIMENSION</small><h3>{selectedDimension}</h3><p>{dimensionNotes[selectedDimension]}</p><div>{demoDna[selectedDimension as keyof typeof demoDna].map(item=><span key={item}>{item}</span>)}</div></div></section>
    <section className="section composition panel"><div><small>DOMINANT PATTERN / DEMO</small><h2>Collect → Customize → Display</h2><p>수집한 대상을 개인 취향으로 바꾸고, 그것을 다시 커뮤니티에 보여주는 반복 행동이 여러 차원에 걸쳐 나타난다는 데모 해석입니다.</p></div><div className="loop"><span>COLLECT</span><ArrowRight/><span>CUSTOMIZE</span><ArrowRight/><span>DISPLAY</span><ArrowRight/><i>↻</i></div></section>
  </>;
}
