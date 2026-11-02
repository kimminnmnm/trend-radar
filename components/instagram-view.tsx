"use client";

import Link from "next/link";
import { apiFetch } from "@/lib/api-fetch";
import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Instagram, LoaderCircle, LockKeyhole, Search, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "./ui";
import { recordIgQuotaUse, saveInstagramManualSearch } from "@/lib/storage";
import { instagramManualSearchId, pullInstagramManualSearches, pushInstagramManualSearch } from "@/lib/ig-pulse-cloud";
import { useAccountSync } from "@/lib/account-sync";

type MetaStatus = {
  configured: boolean;
  igUserConfigured: boolean;
  tokenValid: boolean;
  graphVersion: string;
  permissions: { granted: string[]; declined: string[]; requiredForHashtag: string[]; missingForHashtag: string[] };
  pages: Array<{ id: string; name: string; instagramProfessional: null | { id: string; username?: string; name?: string } }>;
  token: { expiresAt?: string; dataAccessExpiresAt?: string; expiresSoon: boolean };
  publicContentAccess: { status: "pending"|"approved"|"unknown"; message: string };
  canAttemptHashtagSearch: boolean;
  requirements: string[];
  error?: { message: string; code?: number };
};

type HashtagResult = {
  source: "live_meta";
  query: string;
  hashtagId: string|null;
  collectedAt: string;
  recentMedia: InstagramMedia[];
  topMedia: InstagramMedia[];
  topMediaAvailable: boolean;
  warnings: string[];
  cache: { hit: boolean; ttlSeconds: number };
  metrics: { postCount: null; growthRate: null; reason: string };
  quota: { searchKind: "refresh" | "new"; usedNewSlot: boolean };
};
type InstagramMedia={id:string;caption?:string;media_type?:string;permalink?:string;timestamp?:string};

function MediaCollection({title,items}:{title:string;items:InstagramMedia[]}){
  return <section className="media-collection"><header><small>{title}</small><b>{items.length} RETURNED</b></header>{items.length?<div className="media-grid">{items.map(item=><a href={item.permalink} target="_blank" rel="noreferrer" key={item.id}><span>LIVE META</span><small>{item.media_type||"MEDIA"}</small><p>{item.caption||"캡션 없음"}</p><time>{item.timestamp?new Date(item.timestamp).toLocaleString("ko-KR"):"게시 날짜 없음"}</time><em>{item.permalink?"원본 게시물 열기":"원본 URL 없음"}</em></a>)}</div>:<div className="empty-result">반환된 게시물이 없습니다.</div>}<style jsx>{`.media-collection{margin-top:20px}.media-collection>header{display:flex;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid var(--border)}.media-collection>header small,.media-collection>header b{font-size:11px;color:var(--mint);letter-spacing:.1em}.media-collection>header b{color:#808080}.media-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:8px}.media-grid a{min-height:170px;padding:17px;border:1px solid var(--border);display:flex;flex-direction:column}.media-grid a>span{align-self:flex-start;color:var(--mint);font-size:11px;border:1px solid #d5d9ea;padding:4px}.media-grid a>small{font-size:11px;color:#797979;margin-top:10px}.media-grid p{font-size:11px;line-height:1.6;color:#515151}.media-grid time{font-size:11px;color:#828282;margin-top:auto}.media-grid em{font-style:normal;color:var(--accent);font-size:11px;margin-top:9px}.empty-result{padding:35px;text-align:center;color:var(--muted);font-size:12px;border:1px solid var(--border);margin-top:8px}@media(max-width:600px){.media-grid{grid-template-columns:1fr}}`}</style></section>
}

export function InstagramView(){
  const account=useAccountSync();
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState<MetaStatus|null>(null);
  const [loading,setLoading]=useState(true);
  const [searching,setSearching]=useState(false);
  const [result,setResult]=useState<HashtagResult|null>(null);
  const [searchError,setSearchError]=useState("");
  const [allowNew,setAllowNew]=useState(false);
  const [historySync,setHistorySync]=useState<"local"|"syncing"|"saved"|"failed">("local");
  const displayedHistorySync=account.userId?historySync:"local";

  useEffect(()=>{
    const controller=new AbortController();
    fetch("/api/meta/status",{signal:controller.signal,cache:"no-store"})
      .then(async response=>{const body=await response.json() as MetaStatus;if(!response.ok&&!body.configured)throw new Error("Meta 연결 상태를 불러오지 못했습니다.");return body})
      .then(setStatus)
      .catch(error=>{if(error.name!=="AbortError")setSearchError(error.message)})
      .finally(()=>setLoading(false));
    return()=>controller.abort();
  },[]);
  useEffect(()=>{if(!account.userId)return;void Promise.resolve().then(async()=>{setHistorySync("syncing");const result=await pullInstagramManualSearches();setHistorySync(result.ok?"saved":"failed")})},[account.userId]);

  const search=async(event:FormEvent)=>{
    event.preventDefault();setSearching(true);setSearchError("");setResult(null);
    try{const response=await apiFetch(`/api/meta/hashtag?query=${encodeURIComponent(query)}&allowNew=${allowNew?"1":"0"}`,{cache:"no-store"});const body=await response.json();if(!response.ok)throw new Error(body.message||"검색에 실패했습니다.");const next=body as HashtagResult;setResult(next);if(next.quota.usedNewSlot&&!next.cache.hit)recordIgQuotaUse({tag:next.query,hashtagId:next.hashtagId,searchedAt:next.collectedAt,source:"manual"});const record={id:instagramManualSearchId(next),query:next.query,hashtagId:next.hashtagId,collectedAt:next.collectedAt,cacheHit:next.cache.hit,usedNewSlot:next.quota.usedNewSlot,result:next};saveInstagramManualSearch(record);if(account.userId){setHistorySync("syncing");const synced=await pushInstagramManualSearch(record);setHistorySync(synced.ok?"saved":"failed")}else setHistorySync("local");setAllowNew(false)}
    catch(error){setSearchError(error instanceof Error?error.message:"검색에 실패했습니다.")}
    finally{setSearching(false)}
  };

  const connectedAccount=status?.pages.find(page=>page.instagramProfessional)?.instagramProfessional;
  return <div className="page"><PageHeader eyebrow="LIVE SOURCE / INSTAGRAM" title="Search with permission, interpret with care." description="Meta Graph API 서버 연결 상태를 확인하고, 승인된 범위에서만 실제 Instagram 해시태그 데이터를 요청합니다."/>
    <div className="source-banner"><span className="live-dot"/>LIVE META와 DEMO 데이터는 합치지 않습니다.<b>{status?.graphVersion||"Graph API"} · SEARCH HISTORY {displayedHistorySync === "syncing" ? "SYNCING" : displayedHistorySync === "saved" ? "CLOUD SAVED" : displayedHistorySync === "failed" ? "SYNC FAILED" : "LOCAL ONLY"}</b></div>
    <div className="instagram-layout">
      <section className="panel connection-panel">
        <header><div><small>SERVER CONNECTION</small><h2>Meta Graph API</h2></div>{loading?<LoaderCircle className="spin"/>:status?.tokenValid?<CheckCircle2 className="ok"/>:<XCircle className="bad"/>}</header>
        {loading?<div className="loading-state"><LoaderCircle className="spin"/><p>토큰과 권한을 서버에서 확인하고 있습니다.</p></div>:<>
          <div className="connection-row"><span>Access token</span><b className={status?.tokenValid?"ok-text":"bad-text"}>{status?.tokenValid?status.token.expiresSoon?"EXPIRES SOON":"VALID":"INVALID"}</b></div>
          {status?.token.expiresAt&&<div className="connection-row"><span>Token expires</span><b className={status.token.expiresSoon?"warn-text":""}>{new Date(status.token.expiresAt).toLocaleString("ko-KR")}</b></div>}
          <div className="connection-row"><span>Facebook Pages</span><b>{status?.pages.length||0}</b></div>
          <div className="connection-row"><span>Instagram professional</span><b className={connectedAccount||status?.igUserConfigured?"ok-text":"warn-text"}>{status?.igUserConfigured?"ENV CONFIGURED":connectedAccount?"AUTO DISCOVERED":"NOT FOUND"}</b></div>
          <div className="connection-row"><span>Public Content Access</span><b className={status?.publicContentAccess.status==="approved"?"ok-text":"warn-text"}>{status?.publicContentAccess.status==="approved"?"APPROVED":status?.publicContentAccess.status==="pending"?"PENDING":"VERIFY ON SEARCH"}</b></div>
          {status?.pages.map(page=><article className="page-record" key={page.id}><small>FACEBOOK PAGE</small><strong>{page.name}</strong><code>ID {page.id}</code>{page.instagramProfessional?<><small>INSTAGRAM PROFESSIONAL</small><strong>@{page.instagramProfessional.username||"username unavailable"}</strong><code>ID {page.instagramProfessional.id}</code></>:<span>연결된 Instagram 프로페셔널 계정 없음</span>}</article>)}
          {!status?.pages.length&&<div className="empty-connection"><AlertTriangle/><h3>관리 가능한 Facebook 페이지가 없습니다.</h3><p>토큰 사용자가 페이지 관리자 권한을 가지고 있는지 확인하고, 해당 페이지에 Instagram Business 또는 Creator 계정을 연결하세요.</p></div>}
          <div className="permission-block"><small>GRANTED PERMISSIONS</small><div>{status?.permissions.granted.map(permission=><span key={permission}>{permission}</span>)}</div></div>
          <div className="permission-block"><small>HASHTAG REQUIREMENTS</small>{status?.permissions.missingForHashtag.length?<p className="bad-text">누락: {status.permissions.missingForHashtag.join(", ")}</p>:<p className="ok-text"><ShieldCheck/> 토큰 권한 3개 확인됨</p>}<ul>{status?.requirements.map(item=><li key={item}>{item}</li>)}</ul></div>
        </>}
      </section>

      <section className="panel search-panel">
        <form className="ig-search" onSubmit={search}><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="해시태그 입력 (# 제외)"/><label className="new-approval"><input type="checkbox" checked={allowNew} onChange={event=>setAllowNew(event.target.checked)}/>신규 태그라면 한도 1개 사용 승인</label><button className="button primary" disabled={!status?.canAttemptHashtagSearch||searching}>{searching?"Searching…":"Search live data"}</button></form>
        {!status?.canAttemptHashtagSearch&&!loading&&<div className="locked"><div><Instagram/><LockKeyhole/></div><h2>{status?.publicContentAccess.status==="pending"?"Meta API 승인 대기 중":"Hashtag search is not available yet"}</h2><p>{status?.publicContentAccess.status==="pending"?"Instagram Public Content Access 승인 후 LIVE 검색을 실행할 수 있습니다.":status?.tokenValid?"META_IG_USER_ID를 설정하거나 연결된 Instagram 프로페셔널 계정을 확인하세요.":status?.error?.message||"유효한 Meta 사용자 토큰이 필요합니다."}</p><Link className="button" href="/settings">Review connection setup</Link></div>}
        {status?.canAttemptHashtagSearch&&!result&&!searchError&&<div className="ready"><ShieldCheck/><h2>Ready for a live test</h2><p>결과에는 LIVE META 배지와 수집 시각을 표시하며 데모 카드와 섞지 않습니다.</p></div>}
        {searchError&&<div className="search-error"><AlertTriangle/><div><h3>검색을 완료하지 못했습니다.</h3><p>{searchError}</p></div></div>}
        {result&&<div className="live-results"><header><div><small>LIVE META RESULT · {result.cache.hit?"SERVER CACHE":result.quota.searchKind==="refresh"?"기존 ID 갱신":"승인된 신규 검색"}</small><h2>#{result.query}</h2><code>HASHTAG ID {result.hashtagId||"NOT FOUND"}</code></div><time>{new Date(result.collectedAt).toLocaleString("ko-KR")}</time></header><div className="metric-note"><AlertTriangle/><p><b>게시물 수·관심도 상승률 미표시</b>{result.metrics.reason}</p></div>{result.warnings.map(warning=><div className="result-warning" key={warning}>{warning}</div>)}<MediaCollection title="RECENT MEDIA" items={result.recentMedia}/>{result.topMediaAvailable&&<MediaCollection title="TOP MEDIA" items={result.topMedia}/>}</div>}
      </section>
    </div>
    <style jsx>{`.live-results code{font-size:11px;color:#888888}.metric-note{display:flex;gap:10px;align-items:center;margin-top:18px;padding:12px;border:1px solid #f4f5f9;background:#f4f5f9;color:#9e7d2b}.metric-note :global(svg){width:16px}.metric-note p{margin:0;font-size:11px;line-height:1.6}.metric-note b{display:block}.result-warning{margin-top:8px;padding:10px;border:1px solid #d5d9ea;color:#985e2a;font-size:11px}`}</style>
    <style jsx>{`.source-banner{display:flex;align-items:center;gap:8px;border:1px solid #d2d2e5;background:#f4f5f9;color:#32328f;padding:11px 14px;border-radius:7px;font-size:11px;margin-bottom:14px}.source-banner b{margin-left:auto;color:var(--mint)}.live-dot{width:6px;height:6px;border-radius:50%;background:var(--mint);box-shadow:0 0 8px var(--mint)}.instagram-layout{display:grid;grid-template-columns:380px 1fr;gap:14px}.connection-panel,.search-panel{overflow:hidden}.connection-panel{padding:24px;align-self:start}.connection-panel>header{display:flex;justify-content:space-between;align-items:center;padding-bottom:20px;border-bottom:1px solid var(--border)}.connection-panel small{font-size:11px;color:#828282;letter-spacing:.12em}.connection-panel h2{font-size:17px;margin:7px 0}.connection-panel header :global(svg){width:20px}.connection-panel :global(.ok){color:var(--mint)}.connection-panel :global(.bad){color:#962327}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.loading-state{min-height:220px;display:grid;place-content:center;justify-items:center;color:var(--muted);font-size:12px}.connection-row{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid var(--border);font-size:12px}.connection-row span{color:var(--muted)}.ok-text{color:var(--mint)!important}.bad-text{color:#962327!important}.warn-text{color:#996924!important}.page-record{margin:14px 0;padding:15px;border:1px solid var(--border);display:grid;gap:6px}.page-record strong{font-size:12px}.page-record code{font-size:11px;color:#8c8c8c;margin-bottom:8px}.page-record>span{font-size:11px;color:#996924}.empty-connection{padding:25px 5px;text-align:center}.empty-connection :global(svg){color:#996924}.empty-connection h3{font-size:13px}.empty-connection p{font-size:11px;line-height:1.7;color:var(--muted)}.permission-block{border-top:1px solid var(--border);padding-top:18px;margin-top:16px}.permission-block>div{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.permission-block>div span{font-size:11px;padding:5px 7px;border:1px solid #d5d9ea;color:var(--mint);border-radius:20px}.permission-block p{font-size:11px;display:flex;gap:6px;align-items:center}.permission-block p :global(svg){width:13px}.permission-block ul{padding-left:16px;color:#656565;font-size:11px;line-height:1.7}.ig-search{min-height:72px;border-bottom:1px solid var(--border);display:flex;gap:13px;align-items:center;padding:12px 20px;flex-wrap:wrap}.ig-search>svg{color:var(--accent)}.ig-search input{flex:1;background:transparent;border:0;outline:0;color:var(--text);min-width:180px}.new-approval{width:100%;margin-left:36px;font-size:11px;color:var(--muted);display:flex;gap:6px;align-items:center}.locked,.ready{min-height:520px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px}.locked>div{position:relative}.locked>div svg:first-child{width:50px;height:50px;color:#7c7c7c}.locked>div svg:last-child{position:absolute;width:20px;bottom:-5px;right:-8px;color:var(--accent)}.locked h2,.ready h2{font-size:23px;font-weight:500;margin:30px 0 10px}.locked p,.ready p{max-width:510px;color:var(--muted);font-size:12px;line-height:1.8;margin-bottom:22px}.ready>svg{color:var(--mint);width:42px;height:42px}.search-error{margin:20px;padding:18px;display:flex;gap:13px;background:#f4f5f9;border:1px solid #decfcf;color:#952326}.search-error h3{font-size:13px;margin:0}.search-error p{font-size:11px;margin:7px 0 0}.live-results{padding:25px}.live-results>header{display:flex;justify-content:space-between}.live-results h2{font-size:27px;margin:8px 0}.live-results small,.live-results time{font-size:11px;color:var(--muted)}.media-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.media-grid a{min-height:150px;padding:17px;border:1px solid var(--border);display:flex;flex-direction:column}.media-grid a>span{align-self:flex-start;color:var(--mint);font-size:11px;border:1px solid #d5d9ea;padding:4px}.media-grid p{font-size:11px;line-height:1.6;color:#515151}.media-grid time{margin-top:auto}.empty-result{padding:80px;text-align:center;color:var(--muted);font-size:12px}@media(max-width:950px){.instagram-layout{grid-template-columns:1fr}.locked,.ready{min-height:380px}}@media(max-width:600px){.ig-search{height:auto;padding:14px;flex-wrap:wrap}.ig-search input{min-width:0}.ig-search .button{width:100%}.new-approval{margin-left:0}.media-grid{grid-template-columns:1fr}}`}</style>
  </div>
}
