"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Atom, LoaderCircle, Orbit, Plus, Radar, Search, SlidersHorizontal, Trash2 } from "lucide-react";
import { trends } from "@/lib/demo-data";
import { getLiveAnalyses, getWatchlist, saveWatchlist } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { liveTrendId, trendPath } from "@/lib/live-trend";
import type { LiveAnalysisSnapshot, WatchCandidate } from "@/lib/types";
import type { SeriesStats } from "@/lib/schemas";
import { DataBadge, formatDateTime, PageHeader, SectionHeading } from "./ui";
import { TrendCard } from "./trend-card";

const categories = ["All","Subculture","Lifestyle","Fashion","Entertainment","Technology"];
type ValidateResponse = { batchId: string; collectedAt: string; startDate: string; endDate: string; stats: SeriesStats[]; methodology: string };

/** 수집된 Instagram 캡션에서 분석 키워드와 함께 등장한 해시태그를 센다. 게시물 단위로 1회만 센다. */
function coHashtagCandidates(snapshots: LiveAnalysisSnapshot[]) {
  const counts = new Map<string, { tag: string; posts: Set<string>; from: Set<string> }>();
  for (const snapshot of snapshots) {
    const own = new Set([snapshot.trendName, ...snapshot.keywords].map((k) => k.replace(/\s+/g, "").toLocaleLowerCase("ko-KR")));
    for (const item of snapshot.evidence ?? []) {
      if (item.kind !== "instagram_media") continue;
      const tags = new Set([...item.excerpt.matchAll(/#([\p{L}\p{N}_]{2,30})/gu)].map((match) => match[1]));
      for (const tag of tags) {
        const key = tag.toLocaleLowerCase("ko-KR");
        if (own.has(key)) continue;
        const entry = counts.get(key) ?? { tag, posts: new Set<string>(), from: new Set<string>() };
        entry.posts.add(`${snapshot.trendId}:${item.id}`); entry.from.add(snapshot.trendName);
        counts.set(key, entry);
      }
    }
  }
  return [...counts.values()].map((entry) => ({ tag: entry.tag, posts: entry.posts.size, from: [...entry.from] })).sort((a, b) => b.posts - a.posts).slice(0, 15);
}

export function Discover(){
  const router=useRouter();
  const snapshots=useStored(getLiveAnalyses);
  const storedWatchlist=useStored(getWatchlist);
  const watchlist=useMemo(()=>storedWatchlist??[],[storedWatchlist]);
  const [keyword,setKeyword]=useState("");
  const [newCandidate,setNewCandidate]=useState("");
  const [picked,setPicked]=useState<string[]>([]);
  const [validating,setValidating]=useState(false);const [validateError,setValidateError]=useState("");const [methodology,setMethodology]=useState("");
  const [query,setQuery]=useState(""); const [category,setCategory]=useState("All");
  const live=useMemo(()=>snapshots??[],[snapshots]);
  const coTags=useMemo(()=>coHashtagCandidates(live),[live]);
  const filtered=useMemo(()=>trends.filter(t=>(category==="All"||t.category===category)&&(`${t.name} ${t.en} ${t.tags.join(" ")}`).toLowerCase().includes(query.toLowerCase())),[query,category]);
  const batches=useMemo(()=>{const map=new Map<string,WatchCandidate[]>();for(const item of watchlist)if(item.validation){const list=map.get(item.validation.batchId)??[];list.push(item);map.set(item.validation.batchId,list)}return [...map.entries()].map(([id,items])=>({id,items:items.sort((a,b)=>a.validation!.rank-b.validation!.rank)}))},[watchlist]);

  const analyze=(event:FormEvent)=>{event.preventDefault();const value=keyword.trim();if(value)router.push(trendPath(liveTrendId(value),"why"))};
  const addCandidate=(value:string,source:string)=>{const keywordValue=value.trim();if(!keywordValue)return;const existing=watchlist.find(item=>item.keyword===keywordValue);saveWatchlist(existing?watchlist.map(item=>item.keyword===keywordValue?{...item,sources:[...new Set([...item.sources,source])]}:item):[{keyword:keywordValue,sources:[source],addedAt:new Date().toISOString()},...watchlist])};
  const removeCandidate=(value:string)=>{saveWatchlist(watchlist.filter(item=>item.keyword!==value));setPicked(picked.filter(item=>item!==value))};
  const togglePick=(value:string)=>setPicked(picked.includes(value)?picked.filter(item=>item!==value):picked.length>=5?picked:[...picked,value]);
  const validate=async()=>{
    if(!picked.length)return;setValidating(true);setValidateError("");
    try{
      const response=await fetch("/api/discover/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({keywords:picked,periodMonths:3})});
      const body=await response.json();if(!response.ok)throw new Error(body.message||"검증에 실패했습니다.");
      const data=body as ValidateResponse;setMethodology(data.methodology);
      saveWatchlist(getWatchlist().map(item=>{const index=data.stats.findIndex(stat=>stat.title===item.keyword);return index<0?item:{...item,validation:{batchId:data.batchId,collectedAt:data.collectedAt,batchSize:data.stats.length,rank:index+1,stat:data.stats[index]}}}));
      setPicked([]);
    }catch(reason){setValidateError(reason instanceof Error?reason.message:"검증에 실패했습니다.")}finally{setValidating(false)}
  };

  return <div className="page"><PageHeader eyebrow="01 / TREND DISCOVER" title="Find the signal before the noise." description="NAVER DataLab은 지정한 키워드의 상대 관심도를 비교하는 API이며 새로운 유행어 목록을 제공하지 않습니다. 그래서 후보를 실제 수집 자료에서 찾고, 같은 요청 안에서만 비교해 검증합니다."/>
    <form className="search-panel panel" onSubmit={analyze}><Radar/><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="LIVE로 분석할 키워드 입력 (예: 러닝)" aria-label="LIVE keyword"/><button className="button primary" disabled={!keyword.trim()}>Analyze live <ArrowRight size={14}/></button></form>

    <section className="section"><SectionHeading index="01" title="Live trends you have analyzed" description="저장된 LIVE 분석입니다. 다시 열 때는 API를 호출하지 않습니다."/>
      {snapshots===null?<div className="state-box panel"><LoaderCircle className="spin"/></div>:live.length?<div className="grid three">{live.map(item=><article className="live-card panel" key={item.trendId}><div className="card-top"><DataBadge status="SAVED" detail={formatDateTime(item.analyzedAt)}/></div><h3>{item.trendName}</h3><p>{item.summary}</p><dl><dt>SOURCES</dt><dd>NAVER {item.evidence?.filter(e=>e.kind==="naver_series").length??0} · Instagram {item.evidence?.filter(e=>e.kind==="instagram_media").length??0}</dd><dt>SIGNAL</dt><dd>{item.signalStats?.[0]?`${item.signalStats[0].direction} (같은 요청 내 ${item.signalStats[0].earlyAvg}→${item.signalStats[0].recentAvg})`:"—"}</dd><dt>DNA</dt><dd>{item.dna?"분석 완료":"미분석"}</dd></dl><footer><Link href={trendPath(item.trendId,"why")}><Orbit size={13}/>WHY</Link><Link href={trendPath(item.trendId,"dna")}><Atom size={13}/>DNA</Link></footer></article>)}</div>:<div className="state-box panel"><DataBadge status="NOT ANALYZED"/><p>아직 LIVE 분석한 키워드가 없습니다. 위 입력창에서 시작하세요.</p></div>}
    </section>

    <section className="section"><SectionHeading index="02" title="Observed candidates" description="후보 출처를 기록하고, 선택한 후보(최대 5개)를 하나의 NAVER 요청으로 묶어 검증합니다. AI를 호출하지 않습니다."/>
      <div className="candidates panel"><div className="cand-col"><small>CANDIDATE SOURCE · INSTAGRAM CO-HASHTAGS</small><p className="hint">LIVE 분석 때 수집한 Instagram 캡션에서 함께 등장한 해시태그입니다. 표본 게시물 기준이며 전체 인기도를 뜻하지 않습니다.</p>{coTags.length?<div className="tag-list">{coTags.map(tag=><button type="button" key={tag.tag} onClick={()=>addCandidate(tag.tag,`Instagram 공동 해시태그 · ${tag.from.join(", ")} 수집 게시물 ${tag.posts}개`)}><Plus size={11}/>#{tag.tag}<em>{tag.posts} posts</em></button>)}</div>:<p className="hint">Instagram 근거가 포함된 LIVE 분석이 없어 후보가 없습니다.</p>}
        <form className="add-row" onSubmit={e=>{e.preventDefault();addCandidate(newCandidate,"사용자 입력");setNewCandidate("")}}><input value={newCandidate} onChange={e=>setNewCandidate(e.target.value)} placeholder="직접 관측 중인 후보 추가"/><button className="button" disabled={!newCandidate.trim()}>Add</button></form></div>
        <div className="cand-col"><small>WATCHLIST · {watchlist.length}</small>{watchlist.length?<ul className="watch">{watchlist.map(item=><li key={item.keyword}><label><input type="checkbox" checked={picked.includes(item.keyword)} onChange={()=>togglePick(item.keyword)}/><b>{item.keyword}</b></label><span>{item.sources.join(" / ")}</span><div><Link href={trendPath(liveTrendId(item.keyword),"why")}>Analyze</Link><button onClick={()=>removeCandidate(item.keyword)} aria-label={`${item.keyword} 삭제`}><Trash2 size={12}/></button></div></li>)}</ul>:<p className="hint">후보를 추가하면 여기에 표시됩니다.</p>}
          <button className="button primary" onClick={validate} disabled={!picked.length||validating}>{validating?<><LoaderCircle className="spin"/>Validating…</>:<>Validate {picked.length}/5 with NAVER</>}</button>{validateError&&<p className="err">{validateError}</p>}</div></div>
      {batches.length>0&&<div className="batches">{batches.map(batch=><div className="batch panel" key={batch.id}><header><DataBadge status="LIVE" detail={`NAVER · ${formatDateTime(batch.items[0].validation!.collectedAt)}`}/><small>같은 요청의 {batch.items[0].validation!.batchSize}개 키워드 안에서만 비교한 순위</small></header><table><thead><tr><th>RANK</th><th>KEYWORD</th><th>EARLY ⅓ → RECENT ⅓</th><th>PEAK</th><th>DIRECTION</th></tr></thead><tbody>{batch.items.map(item=><tr key={item.keyword}><td>{item.validation!.rank}</td><td>{item.keyword}</td><td>{item.validation!.stat.earlyAvg} → {item.validation!.stat.recentAvg}</td><td>{item.validation!.stat.peak.ratio} <small>{item.validation!.stat.peak.period}</small></td><td>{item.validation!.stat.direction}</td></tr>)}</tbody></table></div>)}<p className="hint">{methodology||"순위는 같은 배치 안에서만 의미가 있습니다. 서로 다른 배치의 값을 비교하지 마세요."}</p></div>}
    </section>

    <section className="section"><SectionHeading index="03" title="Demo dataset" description="사용자 흐름 검증용 예시입니다. LIVE 결과와 분리되어 있습니다."/>
      <div className="search-panel panel small"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="트렌드, 감정, 행동을 검색하세요"/><kbd>DEMO</kbd></div>
      <div className="filter-row"><div className="category-tabs">{categories.map(c=><button className={category===c?"active":""} onClick={()=>setCategory(c)} key={c}>{c}</button>)}</div><span><SlidersHorizontal size={13}/>{filtered.length} signals</span></div>
      <div className="demo-explainer"><b>DEMO DATASET</b><p>현재 카드의 상태와 설명은 사용자 흐름 검증용입니다. 실제 검색량·성장률은 표시하지 않습니다.</p></div>
      <div className="grid three result-grid">{filtered.map(t=><TrendCard trend={t} key={t.id}/>)}</div>
      {!filtered.length&&<div className="empty-state panel"><h3>일치하는 신호가 없습니다.</h3><p>다른 키워드나 카테고리를 선택해 보세요.</p></div>}
    </section>
    <style jsx>{`.search-panel{height:70px;display:flex;align-items:center;padding:0 12px 0 21px;gap:15px}.search-panel.small{height:56px}.search-panel :global(svg){color:var(--accent)}.search-panel input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text);font-size:15px}.search-panel kbd{font-size:9px;color:#a27e26;border:1px solid #dbdbdb;border-radius:4px;padding:5px 7px}.live-card{padding:22px;display:flex;flex-direction:column;gap:10px;min-height:250px;border-top:2px solid var(--mint)}.live-card h3{font-size:20px;font-weight:500;margin:6px 0 0}.live-card p{font-size:11px;color:#505050;line-height:1.7;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.live-card dl{display:grid;grid-template-columns:60px 1fr;gap:5px 10px;font-size:9px;margin:0}.live-card dt{color:#8a8a8a}.live-card dd{margin:0;color:#424242}.live-card footer{display:flex;gap:14px;margin-top:auto;padding-top:12px;border-top:1px solid var(--border)}.live-card footer :global(a){display:flex;gap:6px;align-items:center;font-size:10px;color:var(--accent)}.candidates{display:grid;grid-template-columns:1fr 1fr;gap:0}.cand-col{padding:22px;display:grid;gap:12px;align-content:start}.cand-col+.cand-col{border-left:1px solid var(--border)}.cand-col>small{font-size:8px;color:var(--mint);letter-spacing:.12em}.hint{font-size:9px;color:#727272;line-height:1.6;margin:0}.tag-list{display:flex;flex-wrap:wrap;gap:6px}.tag-list button{display:flex;align-items:center;gap:5px;background:#e6e6e6;border:1px solid var(--border);color:#3d3d3d;font-size:10px;padding:6px 9px;border-radius:20px;cursor:pointer}.tag-list button:hover{border-color:var(--accent)}.tag-list em{font-style:normal;font-size:8px;color:#8a8a8a}.add-row{display:flex;gap:8px}.add-row input{flex:1;min-width:0;background:#e6e6e6;border:1px solid var(--border);color:var(--text);border-radius:6px;padding:10px}.watch{list-style:none;padding:0;margin:0;display:grid;gap:6px}.watch li{display:grid;grid-template-columns:1fr auto;gap:4px 10px;padding:10px;border:1px solid var(--border);border-radius:6px}.watch label{display:flex;gap:8px;align-items:center;font-size:11px}.watch span{grid-column:1;font-size:8px;color:#727272}.watch li>div{grid-row:1/3;grid-column:2;display:flex;gap:8px;align-items:center}.watch li>div :global(a){font-size:9px;color:var(--accent)}.watch button{background:transparent;border:0;color:#727272;cursor:pointer}.err{font-size:9px;color:#952326;margin:0}.batches{display:grid;gap:10px;margin-top:12px}.batch{padding:18px}.batch header{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.batch header small{font-size:8px;color:#727272}.batch table{width:100%;border-collapse:collapse;font-size:10px}.batch th{font-size:7px;color:#828282;text-align:left;font-weight:500;padding:6px;border-bottom:1px solid var(--border);letter-spacing:.1em}.batch td{padding:7px 6px;border-bottom:1px solid #e0e4ea;color:#424242}.batch td small{font-size:7px;color:#868686}.filter-row{display:flex;justify-content:space-between;align-items:center;margin:23px 0}.category-tabs{display:flex;gap:5px;flex-wrap:wrap}.category-tabs button{background:transparent;border:1px solid transparent;color:#7a7a7a;padding:8px 11px;border-radius:5px;font-size:10px;cursor:pointer}.category-tabs button.active{color:var(--text);border-color:var(--border);background:#e2e2e2}.filter-row>span{display:flex;align-items:center;gap:6px;color:#8a8a8a;font-size:9px}.demo-explainer{display:flex;gap:18px;align-items:center;border-left:2px solid #b2b2b2;background:#e8e8e8;padding:11px 15px;margin-bottom:16px}.demo-explainer b{color:#9e7c2b;font-size:9px;letter-spacing:.1em;white-space:nowrap}.demo-explainer p{margin:0;color:#808080;font-size:9px}.result-grid{margin-top:0}@media(max-width:760px){.search-panel{height:auto;flex-wrap:wrap;padding:14px}.search-panel .button{width:100%}.candidates{grid-template-columns:1fr}.cand-col+.cand-col{border-left:0;border-top:1px solid var(--border)}.filter-row{align-items:flex-start;gap:12px}.filter-row>span{display:none}.demo-explainer{align-items:flex-start;flex-direction:column;gap:6px}.batch table{display:block;overflow-x:auto}}`}</style>
  </div>
}
