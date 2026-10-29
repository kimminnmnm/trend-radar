"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDashed, FlaskConical, LoaderCircle, RotateCcw } from "lucide-react";
import { DataBadge, EvidenceRefs, formatDateTime, PageHeader, StatusPill } from "./ui";
import { getCollisions, getLabReviews, getLiveAnalyses, saveLabReview } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { buildInsightSources, readQueryParam } from "@/lib/insight-sources";
import { evidenceLookup, type ValidationLog } from "@/lib/signal";
import type { DataStatus, SavedLabReview } from "@/lib/types";
import type { EvidenceItem, LabReview } from "@/lib/schemas";

const dimensions=[
  {name:"Demand",verdict:"Additional evidence needed",copy:"실제 검색·구매 데이터가 연결되지 않아 수요를 판단할 수 없습니다.",state:"check"},
  {name:"Cultural Relevance",verdict:"Promising",copy:"꾸미기와 기록 행동이 아이디어 안에서 자연스럽게 연결됩니다.",state:"good"},
  {name:"Novelty",verdict:"Worth exploring",copy:"레트로 미학보다 ‘사용자 제작 기록 화면’에 차별화 여지가 있습니다.",state:"good"},
  {name:"Audience Fit",verdict:"Plausible hypothesis",copy:"취향 공유와 커스터마이징에 참여하는 타깃과 연결 가능성이 있습니다.",state:"check"},
  {name:"Brand Fit",verdict:"Context dependent",copy:"브랜드의 기존 자산이 놀이와 개인화를 허용하는지 검토해야 합니다.",state:"check"},
  {name:"Feasibility",verdict:"Prototype first",copy:"가벼운 웹 커스터마이저 또는 템플릿 방식으로 빠른 검증이 가능합니다.",state:"good"},
];
type LabResponse={cached:boolean;analyzedAt:string;model:string;result:LabReview;validation:ValidationLog;ledger:EvidenceItem[]};
const basisColor:Record<string,string>={"Data Evidence":"var(--mint)","AI Inference":"#223190","Insufficient Evidence":"#666666"};

export function TrendLab(){
  const snapshots=useStored(getLiveAnalyses);const collisions=useStored(getCollisions);
  const sources=useMemo(()=>buildInsightSources(snapshots??[],collisions??[]),[snapshots,collisions]);
  const [modeChoice,setModeChoice]=useState<"live"|"demo"|null>(null);
  const mode=modeChoice??(snapshots!==null&&sources.length===0?"demo":"live");
  return <div className="page"><PageHeader eyebrow="06 / TREND LAB" title="Test the opportunity, not the hype." description="LIVE 분석 결과를 근거로 브랜드·타깃 적합성을 6개 관점에서 검토합니다. 각 항목은 데이터 근거·AI 추론·근거 부족으로 구분됩니다."/>
    <div className="chip-select mode-switch"><button type="button" aria-pressed={mode==="live"} onClick={()=>setModeChoice("live")}>LIVE REVIEW · {sources.length} SOURCES</button><button type="button" aria-pressed={mode==="demo"} onClick={()=>setModeChoice("demo")}>DEMO EXAMPLE</button></div>
    {mode==="live"?<LiveLab sources={sources} loading={snapshots===null}/>:<DemoLab/>}
    <style jsx>{`.mode-switch{margin-bottom:18px}`}</style>
    <style jsx global>{`.lab-layout{display:grid;grid-template-columns:390px 1fr;gap:16px}.lab-form{padding:26px;display:grid;gap:18px;align-content:start}.form-title{display:flex;gap:13px;align-items:center;border-bottom:1px solid var(--border);padding-bottom:20px}.form-title svg{color:var(--accent)}.form-title h2{font-size:16px;margin:0 0 5px}.form-title p,.form-note{color:#818181;font-size:9px;margin:0}.lab-form>.button{width:100%}.form-note{text-align:center}.pending{min-height:590px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:55px;background:radial-gradient(circle,rgba(24,24,167,.08),transparent 35%),#e6e6e6}.pending>svg{color:var(--accent);width:42px;height:42px}.pending h2{font-size:25px;font-weight:500;margin:25px 0 10px}.pending p{max-width:500px;color:var(--muted);font-size:11px;line-height:1.8}.criteria{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:20px}.criteria span{border:1px solid var(--border);padding:6px 8px;font-size:8px}.result-head{padding:30px;border:1px solid #dbdbdb;background:linear-gradient(120deg,#e3e3e3,#e8e8e8);display:flex;justify-content:space-between;align-items:center;gap:16px}.result-head small{font-size:8px;color:var(--accent);letter-spacing:.13em}.result-head h2{font-size:36px;color:var(--accent);margin:10px 0}.result-head p{font-size:10px;color:var(--muted);line-height:1.7}.verdict-ring{width:90px;height:90px;border:1px solid var(--accent);border-radius:50%;display:grid;place-content:center;text-align:center;flex:0 0 auto}.verdict-ring span{font-size:25px}.verdict-ring small{font-size:7px;color:#808080}.dimension-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}.dimension-list article{padding:18px;display:grid;grid-template-columns:20px 1fr;gap:12px}.dimension-list article>svg{color:var(--accent);width:16px}.dimension-list article>.status,.dimension-list article>.lab-meta{grid-column:2;justify-self:start}.dimension-list small{color:#7a7a7a;font-size:8px}.dimension-list h3{font-size:12px;margin:7px 0}.dimension-list p{font-size:9px;color:var(--muted);line-height:1.6;margin:0}.lab-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.basis{font-size:8px;border:1px solid;padding:4px 7px;border-radius:3px}.risks{margin-top:10px;padding:16px;border:1px solid #dedede;background:#e8e8e8}.risks small{font-size:8px;color:#a17b28;letter-spacing:.12em}.risks ul{font-size:9px;color:#727272;line-height:1.7;margin-bottom:0}.result-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}@media(max-width:1000px){.lab-layout{grid-template-columns:1fr}.pending{min-height:400px}}@media(max-width:650px){.dimension-list{grid-template-columns:1fr}.result-head{align-items:flex-start;flex-direction:column}.verdict-ring{width:70px;height:70px}.result-actions{flex-direction:column}}`}</style>
  </div>
}

function LiveLab({sources,loading}:{sources:ReturnType<typeof buildInsightSources>;loading:boolean}){
  const saved=useStored(getLabReviews);
  const [sourceChoice,setSourceChoice]=useState<string|null>(null);
  const [brief,setBrief]=useState({brand:"MUSE ARCHIVE",description:"일상의 기록을 작은 오브제로 만드는 라이프스타일 브랜드",audience:"",platform:"Instagram",opportunity:""});
  const [state,setState]=useState<"idle"|"loading"|"error">("idle");const [error,setError]=useState("");
  const [current,setCurrent]=useState<{item:SavedLabReview;status:DataStatus}|null>(null);
  useEffect(()=>{const frame=requestAnimationFrame(()=>{const collision=readQueryParam("collision");if(collision)setSourceChoice(`collision:${collision}`)});return()=>cancelAnimationFrame(frame)},[]);
  const source=sources.find(item=>item.id===sourceChoice)??sources[0];
  const shown=current??(saved?.[0]?{item:saved[0],status:"SAVED" as DataStatus}:null);
  const ledger=useMemo(()=>evidenceLookup(shown?.item.ledger),[shown?.item.ledger]);
  const opportunity=brief.opportunity||source?.collision?.result.creativeOpportunities[0]?.title||"";

  const run=async()=>{
    if(!source)return;
    setState("loading");setError("");
    try{
      const payload={trends:source.contexts,collision:source.collision?.result,brief:{...brief,opportunity}};
      const prior=saved?.find(item=>item.trendKeys.join("|")===source.contexts.map(c=>c.key).join("|")&&item.brief.brand===brief.brand&&item.brief.opportunity===opportunity);
      const response=await fetch("/api/lab",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...payload,force:Boolean(prior)})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.message||"Trend Lab 검토에 실패했습니다.");
      const data=body as LabResponse;
      const item:SavedLabReview={id:`lab-${Date.now()}`,trendKeys:source.contexts.map(c=>c.key),trendNames:source.contexts.map(c=>c.name),collisionId:source.collision?.id,brief:payload.brief,analyzedAt:data.analyzedAt,model:data.model,result:data.result,validation:data.validation,ledger:data.ledger};
      saveLabReview(item);setCurrent({item,status:data.cached?"CACHED":"LIVE"});setState("idle");
    }catch(reason){setError(reason instanceof Error?reason.message:"Trend Lab 검토에 실패했습니다.");setState("error")}
  };

  if(loading)return <div className="state-box panel"><LoaderCircle className="spin"/><p>저장된 LIVE 분석을 불러오고 있습니다.</p></div>;
  if(!sources.length)return <div className="state-box panel"><DataBadge status="NOT ANALYZED"/><h3>검토할 LIVE 분석이 없습니다.</h3><p>TREND WHY를 LIVE로 실행하면 그 결과를 근거로 브랜드 적합성을 검토할 수 있습니다.</p><Link className="button primary" href="/discover">Analyze a keyword</Link></div>;
  const r=shown?.item.result;
  const promising=r?.dimensions.filter(d=>d.status==="Verified Signal"||d.status==="Supported Hypothesis").length??0;
  return <div className="lab-layout"><form className="panel lab-form" onSubmit={e=>{e.preventDefault();void run()}}><div className="form-title"><FlaskConical/><div><h2>Validation brief</h2><p>LIVE 분석 결과와 브랜드 맥락을 함께 전달합니다.</p></div></div>
    <div className="field"><label htmlFor="lab-source">ANALYSIS SOURCE</label><select id="lab-source" value={source?.id} onChange={e=>setSourceChoice(e.target.value)}>{sources.map(item=><option key={item.id} value={item.id}>{item.kind==="collision"?"⨯ ":""}{item.label} — {item.detail}</option>)}</select></div>
    <div className="field"><label>BRAND NAME</label><input value={brief.brand} onChange={e=>setBrief({...brief,brand:e.target.value})} required/></div><div className="field"><label>BRAND DESCRIPTION</label><textarea value={brief.description} onChange={e=>setBrief({...brief,description:e.target.value})}/></div><div className="grid two"><div className="field"><label>TARGET AUDIENCE</label><input value={brief.audience} placeholder="예: 대회를 준비하는 러너" onChange={e=>setBrief({...brief,audience:e.target.value})}/></div><div className="field"><label>PLATFORM</label><select value={brief.platform} onChange={e=>setBrief({...brief,platform:e.target.value})}><option>Instagram</option><option>TikTok</option><option>YouTube</option><option>Blog</option></select></div></div><div className="field"><label>TREND OPPORTUNITY</label><input value={brief.opportunity} placeholder={opportunity||"검토할 콘텐츠·캠페인 아이디어"} onChange={e=>setBrief({...brief,opportunity:e.target.value})}/></div>
    <button className="button primary" type="submit" disabled={state==="loading"}>{state==="loading"?<><LoaderCircle className="spin"/>Reviewing…</>:<>Run LIVE review <ArrowRight size={14}/></>}</button><small className="form-note">1회 OpenAI 호출 · 수치 점수를 만들지 않고 시장 성과를 예측하지 않습니다.</small></form>
    <div className="lab-result">{state==="error"&&<div className="state-box panel error-box"><AlertTriangle/><h3>검토를 완료하지 못했습니다.</h3><p>{error}</p></div>}
      {shown&&r?<><div className="result-head"><div><small>QUALITATIVE VERDICT · {shown.item.trendNames.join(" × ")}</small><h2>{r.overall.verdict}</h2><p>{r.overall.summary}</p><DataBadge status={shown.status} detail={`${shown.item.model} · ${formatDateTime(shown.item.analyzedAt)}`}/></div><div className="verdict-ring"><span>{promising}</span><small>of 6<br/>grounded</small></div></div>
        <div className="dimension-list">{r.dimensions.map(d=><article className="panel" key={d.name}>{d.basis==="Data Evidence"?<CheckCircle2/>:<CircleDashed/>}<div><small>{d.name}</small><h3>{d.verdict}</h3><p>{d.rationale}</p></div><div className="lab-meta"><span className="basis" style={{color:basisColor[d.basis],borderColor:basisColor[d.basis]}}>{d.basis}</span><StatusPill status={d.status}/><EvidenceRefs ids={d.evidenceIds} evidence={ledger} empty="인용 근거 없음"/></div></article>)}</div>
        <div className="risks"><small>RISKS</small><ul>{r.risks.map(item=><li key={item}>{item}</li>)}</ul></div>
        <p className="validation-log">BRIEF · {shown.item.brief.brand} / {shown.item.brief.opportunity} · SERVER VALIDATION 근거 ID 제거 {shown.item.validation.removedEvidenceIds.length} · 하향 {shown.item.validation.downgraded}</p>
        <div className="result-actions"><Link href={`/studio?lab=${shown.item.id}${shown.item.collisionId?`&collision=${shown.item.collisionId}`:""}`} className="button primary">Create content plan <ArrowRight size={14}/></Link></div></>
      :<div className="pending panel"><FlaskConical/><h2>Ready for a grounded review.</h2><p>선택한 LIVE 분석의 근거 원장을 함께 전달합니다. 확인할 수 없는 항목은 점수 대신 Insufficient Evidence로 표시합니다.</p><div className="criteria">{dimensions.map(d=><span key={d.name}>{d.name}</span>)}</div></div>}
    </div></div>;
}

function DemoLab(){
  const [ran,setRan]=useState(false);const [brand,setBrand]=useState("MUSE ARCHIVE");
  return <div className="lab-layout"><form className="panel lab-form" onSubmit={e=>{e.preventDefault();setRan(true)}}><div className="form-title"><FlaskConical/><div><h2>Validation brief · DEMO</h2><p>판단에 필요한 최소 맥락을 입력하세요.</p></div></div><div className="field"><label>BRAND NAME</label><input value={brand} onChange={e=>setBrand(e.target.value)}/></div><div className="field"><label>BRAND DESCRIPTION</label><textarea defaultValue="일상의 기록을 작은 오브제로 만드는 라이프스타일 브랜드"/></div><div className="grid two"><div className="field"><label>TARGET AUDIENCE</label><input defaultValue="취향을 기록하고 공유하는 20대"/></div><div className="field"><label>PLATFORM</label><select defaultValue="Instagram"><option>Instagram</option><option>TikTok</option><option>YouTube</option><option>Blog</option></select></div></div><div className="field"><label>TREND OPPORTUNITY</label><input defaultValue="나만의 레트로 디지털 다이어리"/></div><button className="button primary" type="submit">Run qualitative review <ArrowRight size={14}/></button><small className="form-note">미리 작성된 데모 검토이며 AI를 호출하지 않습니다.</small></form>
    <div className="lab-result">{ran?<><div className="result-head"><div><small>QUALITATIVE VERDICT · DEMO</small><h2>EXPLORE NOW</h2><p>{brand}가 작은 프로토타입으로 문화적 반응을 확인할 가치가 있습니다.</p><DataBadge status="DEMO"/></div><div className="verdict-ring"><span>4</span><small>of 6<br/>promising</small></div></div><div className="dimension-list">{dimensions.map(d=><article className="panel" key={d.name}>{d.state==="good"?<CheckCircle2/>:<CircleDashed/>}<div><small>{d.name}</small><h3>{d.verdict}</h3><p>{d.copy}</p></div><StatusPill status={d.state==="good"?"Supported Hypothesis":"Creative Hypothesis"}/></article>)}</div><div className="result-actions"><button className="button ghost" onClick={()=>setRan(false)}><RotateCcw size={14}/>Edit brief</button><Link href="/studio" className="button primary">Create content plan <ArrowRight size={14}/></Link></div></>:<div className="pending panel"><FlaskConical/><h2>Ready for a grounded review.</h2><p>입력한 브랜드 맥락을 바탕으로 6개 관점에서 정성적으로 검토하는 데모입니다.</p><div className="criteria">{dimensions.map(d=><span key={d.name}>{d.name}</span>)}</div></div>}</div></div>;
}
