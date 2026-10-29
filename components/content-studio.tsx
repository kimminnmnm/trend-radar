"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Clipboard, ExternalLink, LoaderCircle, PenLine, Save, Sparkles } from "lucide-react";
import { getCollisions, getLabReviews, getLiveAnalyses, getSavedItem, saveItem } from "@/lib/storage";
import { persistSavedItem } from "@/lib/cloud-storage";
import { useStored } from "@/lib/use-stored";
import { buildInsightSources, readQueryParam } from "@/lib/insight-sources";
import { evidenceLookup, type ValidationLog } from "@/lib/signal";
import type { DataStatus, SavedItem, SavedPlanPayload } from "@/lib/types";
import type { ContentPlan, EvidenceItem } from "@/lib/schemas";
import { DataBadge, EvidenceRefs, formatDateTime, PageHeader, StatusPill } from "./ui";

type StudioResponse={cached:boolean;analyzedAt:string;model:string;result:ContentPlan;references:EvidenceItem[];validation:ValidationLog};

export function ContentStudio(){
  const snapshots=useStored(getLiveAnalyses);const collisions=useStored(getCollisions);
  const sources=useMemo(()=>buildInsightSources(snapshots??[],collisions??[]),[snapshots,collisions]);
  const [modeChoice,setModeChoice]=useState<"live"|"demo"|null>(null);
  const mode=modeChoice??(snapshots!==null&&sources.length===0?"demo":"live");
  // 저장된 기획안 복원 링크는 LIVE 출처가 없어도 LIVE 화면에서 열어야 한다.
  useEffect(()=>{const frame=requestAnimationFrame(()=>{if(readQueryParam("plan"))setModeChoice("live")});return()=>cancelAnimationFrame(frame)},[]);
  return <div className="page"><PageHeader eyebrow="07 / CONTENT STUDIO" title="Turn cultural insight into a brief." description="LIVE WHY·DNA·Collision·Lab 결과를 실제 입력으로 전달해 근거가 연결된 콘텐츠 기획안을 만듭니다. 참고 자료 URL은 AI가 아니라 서버의 근거 원장에서 붙입니다."/>
    <div className="chip-select mode-switch"><button type="button" aria-pressed={mode==="live"} onClick={()=>setModeChoice("live")}>LIVE BRIEF · {sources.length} SOURCES</button><button type="button" aria-pressed={mode==="demo"} onClick={()=>setModeChoice("demo")}>DEMO EXAMPLE</button></div>
    {mode==="live"?<LiveStudio sources={sources} loading={snapshots===null}/>:<DemoStudio/>}
    <style jsx>{`.mode-switch{margin-bottom:18px}`}</style>
    <style jsx global>{`.studio-layout{display:grid;grid-template-columns:330px 1fr;gap:14px}.studio-layout>aside{padding:22px;align-self:start}.source-stack>small{font-size:8px;color:#828282;letter-spacing:.12em}.source-stack article{display:grid;grid-template-columns:52px 1fr 15px;gap:10px;padding:14px 0;border-bottom:1px solid var(--border);align-items:center}.source-stack article>span{font-size:7px;color:var(--accent);border:1px solid #dbdbdb;padding:5px;text-align:center}.source-stack article.off>span{color:#8a8a8a;border-color:var(--border)}.source-stack b{font-size:9px}.source-stack p{font-size:8px;color:#8a8a8a;margin:5px 0 0}.source-stack svg{width:13px;color:var(--accent)}.studio-form{display:grid;gap:15px;margin-top:22px}.output{min-height:700px;padding:38px;position:relative}.output>header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.output header small,.output section>small{font-size:8px;color:var(--accent);letter-spacing:.14em}.output h2{font-size:35px;font-weight:500;line-height:1.15;margin:12px 0}.output-actions{display:flex;gap:7px}.output-actions svg{width:15px}.output-meta{display:flex;gap:15px;align-items:center;border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:13px 0;color:#787878;font-size:8px;flex-wrap:wrap}.output section{padding:24px 0;border-bottom:1px solid var(--border)}.output section>p{font-size:11px;line-height:1.9;color:#515151}.output blockquote{font-size:25px;line-height:1.4;margin:18px 0}.output blockquote em{font-style:normal;color:var(--accent)}.output ol{padding:0;list-style:none}.output li{display:grid;grid-template-columns:35px 1fr;gap:3px 12px;margin:15px 0}.output li span{grid-row:span 2;color:var(--accent);font-size:9px}.output li b{font-size:11px}.output li p{font-size:9px;color:var(--muted);margin:4px 0}.claims{display:grid;gap:10px;margin-top:12px}.claims article{display:grid;gap:7px;justify-items:start;padding:12px;border:1px solid var(--border);border-radius:6px}.claims p{font-size:10px;margin:0;color:#3d3d3d;line-height:1.6}.hooks{display:grid;gap:8px;margin-top:10px}.hooks blockquote{margin:0!important;font-size:20px!important}.refs{display:grid;gap:6px;margin-top:10px}.refs a,.refs div{display:grid;grid-template-columns:90px 1fr 14px;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--border);border-radius:6px;font-size:9px}.refs b{color:var(--accent)}.refs svg{width:12px;color:var(--accent)}.validation{background:#e8e8e8;padding:20px!important;margin-top:20px;border:1px solid #dedede!important}.validation li{display:list-item;font-size:9px;color:#747474;margin:8px 0}.output-empty{height:620px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.output-empty svg{color:var(--accent);width:35px;height:35px}.output-empty h2{font-size:24px}.output-empty p{font-size:10px;color:var(--muted)}.toast{position:sticky;bottom:20px;margin:20px auto 0;width:max-content;background:var(--accent);color:#eaeaea;padding:10px 15px;border-radius:6px;font-size:10px;display:flex;align-items:center;gap:7px}.toast svg{width:13px}@media(max-width:900px){.studio-layout{grid-template-columns:1fr}.output{padding:24px}.output h2{font-size:28px}.refs a,.refs div{grid-template-columns:1fr}}`}</style>
  </div>
}

function LiveStudio({sources,loading}:{sources:ReturnType<typeof buildInsightSources>;loading:boolean}){
  const labs=useStored(getLabReviews);
  const [sourceChoice,setSourceChoice]=useState<string|null>(null);
  const [labChoice,setLabChoice]=useState<string>("");
  const [brief,setBrief]=useState({platform:"Instagram",format:"Card News",target:"",tone:"위트 있는, 발견하는, 과장하지 않는"});
  const [state,setState]=useState<"idle"|"loading"|"error">("idle");const [error,setError]=useState("");
  const [current,setCurrent]=useState<{payload:SavedPlanPayload;status:DataStatus;savedId?:string}|null>(null);
  const [toast,setToast]=useState("");
  useEffect(()=>{const frame=requestAnimationFrame(()=>{
    const plan=readQueryParam("plan");const collision=readQueryParam("collision");const lab=readQueryParam("lab");
    if(plan){const item=getSavedItem(plan);if(item?.payload)setCurrent({payload:item.payload,status:"SAVED",savedId:item.id})}
    if(collision)setSourceChoice(`collision:${collision}`);
    if(lab)setLabChoice(lab);
  });return()=>cancelAnimationFrame(frame)},[]);
  const source=sources.find(item=>item.id===sourceChoice)??sources[0];
  const keys=source?.contexts.map(c=>c.key).join("|");
  const matchingLabs=(labs??[]).filter(item=>item.trendKeys.join("|")===keys);
  const lab=matchingLabs.find(item=>item.id===labChoice);
  const ledger=useMemo(()=>evidenceLookup(current?.payload.references),[current]);

  const run=async()=>{
    if(!source)return;
    setState("loading");setError("");setToast("");
    try{
      const response=await fetch("/api/studio",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trends:source.contexts,collision:source.collision?.result,lab:lab?.result,brief,force:Boolean(current)})});
      const body=await response.json();
      if(!response.ok)throw new Error(body.message||"기획안 생성에 실패했습니다.");
      const data=body as StudioResponse;
      setCurrent({status:data.cached?"CACHED":"LIVE",payload:{kind:"content-plan",plan:data.result,references:data.references,brief,trendNames:source.contexts.map(c=>c.name),trendKeys:source.contexts.map(c=>c.key),collisionId:source.collision?.id,labId:lab?.id,model:data.model,analyzedAt:data.analyzedAt,validation:data.validation}});
      setState("idle");
    }catch(reason){setError(reason instanceof Error?reason.message:"기획안 생성에 실패했습니다.");setState("error")}
  };
  const save=()=>{if(!current)return;const item:SavedItem={id:current.savedId??`plan-${Date.now()}`,type:"plan",mode:"live",title:current.payload.plan.title,subtitle:`${current.payload.brief.platform} · ${current.payload.brief.format} · ${current.payload.trendNames.join(" × ")}`,createdAt:new Date().toISOString(),payload:current.payload};saveItem(item);void persistSavedItem(item);setCurrent({...current,savedId:item.id});setToast("Workspace에 저장했습니다.")};
  const copy=async()=>{if(!current)return;await navigator.clipboard.writeText([current.payload.plan.hooks[0],current.payload.plan.caption,current.payload.plan.cta].filter(Boolean).join("\n\n"));setToast("후킹 문구·캡션·CTA를 복사했습니다.")};

  if(loading)return <div className="state-box panel"><LoaderCircle className="spin"/><p>저장된 LIVE 분석을 불러오고 있습니다.</p></div>;
  if(!sources.length&&!current)return <div className="state-box panel"><DataBadge status="NOT ANALYZED"/><h3>기획에 사용할 LIVE 분석이 없습니다.</h3><p>TREND WHY를 LIVE로 실행하면 그 결과로 콘텐츠 기획안을 만들 수 있습니다.</p><Link className="button primary" href="/discover">Analyze a keyword</Link></div>;
  const plan=current?.payload.plan;const firstContext=source?.contexts[0];
  return <div className="studio-layout"><aside className="panel"><div className="source-stack"><small>CONNECTED INSIGHTS · 실제 API 입력</small>
      <article className={firstContext?.why?"":"off"}><span>WHY</span><div><b>{source?.contexts.map(c=>c.name).join(", ")||"—"}</b><p>{firstContext?`LIVE · ${formatDateTime(firstContext.analyzedAt)}`:"없음"}</p></div>{firstContext&&<Check/>}</article>
      <article className={source?.contexts.every(c=>c.dna)?"":"off"}><span>DNA</span><div><b>{source?.contexts.every(c=>c.dna)?source.contexts.map(c=>c.dna!.dominantPattern.title).join(" / "):"DNA 미분석 트렌드 포함"}</b><p>{source?.contexts.every(c=>c.dna)?"LIVE DNA":"WHY만 전달됩니다"}</p></div>{source?.contexts.every(c=>c.dna)&&<Check/>}</article>
      <article className={source?.collision?"":"off"}><span>COLLISION</span><div><b>{source?.collision?.result.title??"선택 안 함"}</b><p>{source?.collision?"LIVE · Creative Hypothesis 포함":"Collision 출처를 선택하면 전달됩니다"}</p></div>{source?.collision&&<Check/>}</article>
      <article className={lab?"":"off"}><span>LAB</span><div><b>{lab?lab.result.overall.verdict:"선택 안 함"}</b><p>{lab?`${lab.brief.brand} · ${formatDateTime(lab.analyzedAt)}`:`이 출처의 Lab 검토 ${matchingLabs.length}개`}</p></div>{lab&&<Check/>}</article></div>
    <div className="studio-form"><div className="field"><label htmlFor="studio-source">ANALYSIS SOURCE</label><select id="studio-source" value={source?.id} onChange={e=>{setSourceChoice(e.target.value);setLabChoice("")}}>{sources.map(item=><option key={item.id} value={item.id}>{item.kind==="collision"?"⨯ ":""}{item.label} — {item.detail}</option>)}</select></div>
      <div className="field"><label htmlFor="studio-lab">TREND LAB REVIEW</label><select id="studio-lab" value={labChoice} onChange={e=>setLabChoice(e.target.value)}><option value="">사용 안 함</option>{matchingLabs.map(item=><option key={item.id} value={item.id}>{item.brief.brand} · {item.result.overall.verdict}</option>)}</select></div>
      <div className="field"><label>PLATFORM</label><select value={brief.platform} onChange={e=>setBrief({...brief,platform:e.target.value})}><option>Instagram</option><option>TikTok</option><option>YouTube</option><option>Blog</option></select></div><div className="field"><label>FORMAT</label><select value={brief.format} onChange={e=>setBrief({...brief,format:e.target.value})}><option>Card News</option><option>Short-form Video</option><option>Campaign</option></select></div><div className="field"><label>TARGET</label><input value={brief.target} placeholder="비워 두면 분석 결과에서 제안" onChange={e=>setBrief({...brief,target:e.target.value})}/></div><div className="field"><label>TONE & MANNER</label><input value={brief.tone} onChange={e=>setBrief({...brief,tone:e.target.value})}/></div>
      <button className="button primary" onClick={run} disabled={state==="loading"||!source}>{state==="loading"?<><LoaderCircle className="spin"/>Generating…</>:<><Sparkles size={14}/>{plan?"Regenerate (new API call)":"Generate grounded brief"}</>}</button></div></aside>
    <section className="output panel" aria-label="Content plan output">{state==="error"&&<div className="state-box error-box"><AlertTriangle/><h3>기획안을 생성하지 못했습니다.</h3><p>{error}</p></div>}
      {plan&&current?<><header><div><small>CONTENT PLAN / LIVE</small><h2>{plan.title}</h2></div><div className="output-actions"><button className="icon-button" onClick={copy} title="복사"><Clipboard/></button><button className="icon-button" onClick={save} title="저장"><Save/></button></div></header>
        <div className="output-meta"><span>{current.payload.brief.platform.toUpperCase()}</span><span>{current.payload.brief.format.toUpperCase()}</span><DataBadge status={current.status} detail={`${current.payload.model} · ${formatDateTime(current.payload.analyzedAt)}`}/><span>SOURCES {current.payload.trendNames.join(" × ")}{current.payload.collisionId?" · COLLISION":""}{current.payload.labId?" · LAB":""}</span></div>
        <section><small>01 / BACKGROUND</small><p>{plan.background}</p></section>
        <section><small>02 / TARGET</small><p>{plan.target}</p></section>
        <section><small>03 / TREND EVIDENCE</small><div className="claims">{plan.trendEvidence.map(item=><article key={item.claim}><p>{item.claim}</p><StatusPill status={item.status}/><EvidenceRefs ids={item.evidenceIds} evidence={ledger}/></article>)}</div></section>
        <section><small>04 / CONSUMER INSIGHT</small><p>{plan.consumerInsight.text}</p><StatusPill status={plan.consumerInsight.status}/> <EvidenceRefs ids={plan.consumerInsight.evidenceIds} evidence={ledger}/></section>
        <section><small>05 / CULTURAL CONNECTION</small><p>{plan.culturalConnection.text}</p><StatusPill status={plan.culturalConnection.status}/></section>
        <section><small>06 / CONTENT FLOW</small><ol>{plan.structure.map((step,i)=><li key={`${step.step}-${i}`}><span>{step.step||String(i+1).padStart(2,"0")}</span><b>{step.heading}</b><p>{step.detail}</p></li>)}</ol></section>
        <section><small>07 / HOOK</small><div className="hooks">{plan.hooks.map(hook=><blockquote key={hook}>“{hook}”</blockquote>)}</div></section>
        <section><small>08 / CAPTION</small><p>{plan.caption}</p></section>
        <section><small>09 / CTA</small><p>{plan.cta}</p></section>
        <section><small>10 / REFERENCES · 서버 근거 원장</small><div className="refs">{current.payload.references.length?current.payload.references.map(item=>item.url?<a key={item.id} href={item.url} target="_blank" rel="noreferrer"><b>{item.id}</b><span>{item.title}</span><ExternalLink/></a>:<div key={item.id}><b>{item.id}</b><span>{item.title}</span><i/></div>):<p>인용된 참고 자료가 없습니다.</p>}</div></section>
        <section className="validation"><small>11 / VERIFY BEFORE PUBLISHING</small><ul>{plan.verifyBeforePublishing.map(item=><li key={item}>{item}</li>)}</ul>{current.payload.validation&&<p className="validation-log">SERVER VALIDATION · 근거 ID 제거 {current.payload.validation.removedEvidenceIds.length} · 상태 하향 {current.payload.validation.downgraded}</p>}</section>
        {toast&&<div className="toast"><Check/>{toast}</div>}</>
      :state!=="error"&&<div className="output-empty"><PenLine/><h2>Insight-aware content starts here.</h2><p>왼쪽에서 출처를 확인한 후 기획안을 생성하세요. 1회 OpenAI 호출이 발생합니다.</p></div>}
    </section></div>;
}

function DemoStudio(){
  const [generated,setGenerated]=useState(false);const [saved,setSaved]=useState(false);const [copied,setCopied]=useState(false);
  const copy=async()=>{await navigator.clipboard.writeText("완벽한 사진보다, 나다운 기록. 나만의 레트로 디지털 다이어리를 만들어 보세요.");setCopied(true)};
  const save=()=>{saveItem({id:"plan-retro-diary",type:"plan",mode:"demo",title:"나만의 레트로 디지털 다이어리",subtitle:"DEMO · Instagram · Card News · MUSE ARCHIVE",createdAt:new Date().toISOString()});setSaved(true)};
  return <div className="studio-layout"><aside className="panel"><div className="source-stack"><small>CONNECTED INSIGHTS · DEMO</small><article><span>WHY</span><div><b>불완전한 디지털 감각</b><p>Demo interpretation</p></div><Check/></article><article><span>DNA</span><div><b>Collect → Customize → Display</b><p>Demo interpretation</p></div><Check/></article><article><span>COLLISION</span><div><b>레트로 × 캐릭터 커스텀</b><p>Creative Hypothesis</p></div><Check/></article></div><div className="studio-form"><div className="field"><label>PLATFORM</label><select><option>Instagram</option><option>TikTok</option><option>YouTube</option><option>Blog</option></select></div><div className="field"><label>FORMAT</label><select><option>Card News</option><option>Short-form Video</option><option>Campaign</option></select></div><div className="field"><label>TARGET</label><input defaultValue="취향을 기록하고 공유하는 20대"/></div><div className="field"><label>TONE & MANNER</label><input defaultValue="위트 있는, 발견하는, 과장하지 않는"/></div><button className="button primary" onClick={()=>setGenerated(true)}><Sparkles size={14}/>{generated?"Regenerate brief":"Generate grounded brief"}</button></div></aside>
    <section className="output panel" aria-label="Content plan output">{generated?<><header><div><small>CONTENT PLAN / DEMO</small><h2>나만의 레트로<br/>디지털 다이어리</h2></div><div className="output-actions"><button className="icon-button" onClick={copy} title="복사"><Clipboard/></button><button className="icon-button" onClick={save} title="저장"><Save/></button></div></header><div className="output-meta"><span>INSTAGRAM</span><span>CARD NEWS · 7 SLIDES</span><DataBadge status="DEMO"/><StatusPill status="Creative Hypothesis"/></div><section><small>01 / BACKGROUND</small><p>완벽하게 정돈된 스마트폰 이미지 대신, 낮은 해상도와 장식적 UI가 주는 개인적 기록감에 주목합니다. 사용자가 직접 결과물을 꾸미는 참여 구조를 더합니다.</p></section><section><small>02 / HOOK</small><blockquote>“완벽한 사진보다,<br/><em>나다운 기록.</em>”</blockquote></section><section><small>03 / CONTENT FLOW</small><ol><li><span>01</span><b>요즘 다시 보이는 ‘옛날 디지털’</b><p>현상을 질문으로 열고 실제 성장 수치는 주장하지 않습니다.</p></li><li><span>02</span><b>왜 불완전함이 매력적일까?</b><p>WHY의 감정 가설을 짧게 소개합니다.</p></li><li><span>03</span><b>나의 화면을 조립해 보기</b><p>캐릭터, 아이콘, 프레임을 고르는 참여 경험입니다.</p></li><li><span>04</span><b>결과를 저장하고 공유하기</b><p>브랜드 에셋은 선택 가능한 꾸미기 요소로 배치합니다.</p></li></ol></section><section><small>04 / CAPTION</small><p>기억 속에는 없지만 왠지 그리운 화면이 있나요? 작은 픽셀, 반짝이는 아이콘, 조금은 흐릿한 사진을 골라 오늘의 기분을 기록해 보세요.</p></section><section className="validation"><small>VERIFY BEFORE PUBLISHING</small><ul><li>‘유행’ 또는 ‘급성장’ 표현을 쓰려면 실제 검색 데이터를 연결하세요.</li><li>특정 세대의 심리를 일반화하지 마세요.</li><li>사용한 시각 레퍼런스의 저작권을 검토하세요.</li></ul></section>{(saved||copied)&&<div className="toast"><Check/>{saved?"Workspace에 저장했습니다.":"후킹 문구를 복사했습니다."}</div>}</>:<div className="output-empty"><PenLine/><h2>Insight-aware content starts here.</h2><p>데모 기획안입니다. AI를 호출하지 않습니다.</p></div>}</section></div>;
}
