"use client";

import Link from "next/link";
import { useState } from "react";
import { BookmarkCheck, BookmarkPlus, ExternalLink } from "lucide-react";
import { connectionContextOf, connectionParentKeyword, connectionPayloadOf, connectionTypeLabels, phenomenonItemId, phenomenonQuery, phenomenonTrendId, recencyLabels, type Connection, type ConnectionRun, type ConnectionType } from "@/lib/discovery";
import { removeItem, saveItem } from "@/lib/storage";
import { trendPath } from "@/lib/live-trend";

const typeClass: Record<ConnectionType, string> = { "OBSERVED CONNECTION": "obs", "EMERGING SIGNAL": "emg", "CREATIVE HYPOTHESIS": "ins" };

/**
 * T8: 두 키워드 연결(T3 /api/discover/connections) 결과. 연결마다 주체·행동·대상·방향이 따로 있고,
 * 고르면 그 맥락 그대로 WHY(T5)·Studio(T6)로 넘어간다. 유형은 서버가 두 개념이 함께 나오는 근거 수로 판정한 값이다.
 */
export function ConnectionResults({ run, savedIds, selectedConnectionId = null, onSelectConnection }: { run: ConnectionRun; savedIds: Set<string>; selectedConnectionId?: string | null; onSelectConnection?: (connection: Connection) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const ledger = new Map(run.ledger.map((item) => [item.id, item]));
  const toggleSave = (connection: Connection) => {
    const payload = connectionPayloadOf(run, connection);
    const id = phenomenonItemId(payload.context.phenomenonId);
    if (savedIds.has(id)) { removeItem(id); return; }
    const now = new Date().toISOString();
    saveItem({ id, type: "insight", mode: "live", title: connection.title, subtitle: `${connectionParentKeyword(run)} 연결 · ${connection.direction} · ${connectionTypeLabels[connection.type]}`, createdAt: now, updatedAt: now, payload });
  };
  return <div className="cr" data-testid="hn-connections">
    <div className="cr-meta"><strong>{run.a} × {run.b}</strong><span>관측 기간 {run.window.from} ~ {run.window.to} ({run.window.days}일)</span><span>연결 {run.connections.length}</span></div>
    <p className="cr-legend"><b>관측된 연결</b> 두 개념이 함께 나오는 독립 출처 2곳 이상 · <b>떠오르는 신호</b> 1곳 · <b>창의적 가설</b> 함께 나오는 근거 없음(검색 계획의 방향 포함). 방향이 다른 현상은 합치지 않습니다.</p>
    <ol className="cr-list">{run.connections.map((connection) => {
      const context = connectionContextOf(run, connection);
      const key = context.phenomenonId;
      const isSaved = savedIds.has(phenomenonItemId(key));
      return <li key={key} data-testid="hn-connection" data-type={connection.type} data-direction={connection.direction} data-selected={selectedConnectionId === connection.connectionId || undefined}>
        <div className="cr-top"><span className={`status ${typeClass[connection.type]}`}>{connectionTypeLabels[connection.type]}</span><span className="dir">{connection.direction}</span><span className="muted">함께 나온 출처 {connection.independentSources}곳 · {recencyLabels[connection.recency]}</span></div>
        <h3>{connection.title}</h3>
        <dl>
          {connection.subject && <div><dt>주체</dt><dd>{connection.subject}</dd></div>}
          {connection.action && <div><dt>행동</dt><dd>{connection.action}</dd></div>}
          {connection.object && <div><dt>대상</dt><dd>{connection.object}</dd></div>}
          {connection.platform && <div><dt>플랫폼</dt><dd>{connection.platform}</dd></div>}
        </dl>
        {connection.explanation && <p>{connection.explanation}</p>}
        <div className="cr-links">
          <Link className="button primary" href={`${trendPath(phenomenonTrendId(context), "why")}?${phenomenonQuery(context)}`}>EXPLORE WHY</Link>
          <button type="button" className="button" aria-expanded={open === key} onClick={() => setOpen(open === key ? null : key)} disabled={!connection.evidenceIds.length}>VIEW EVIDENCE</button>
          <Link className="button" href={`/studio?${phenomenonQuery(context)}`}>CREATE CONTENT</Link>
          {onSelectConnection && <button type="button" className="button" aria-pressed={selectedConnectionId === connection.connectionId} onClick={() => onSelectConnection(connection)}>SELECT RELATION</button>}
          <button type="button" className="button" aria-pressed={isSaved} onClick={() => toggleSave(connection)}>{isSaved ? <><BookmarkCheck/>SAVED</> : <><BookmarkPlus/>SAVE TO WORKSPACE</>}</button>
        </div>
        {open === key && <ul className="cr-ev" data-testid="hn-connection-evidence">{connection.evidenceIds.map((id) => { const item = ledger.get(id); return <li key={id} data-evidence-id={id}><code>{id}</code>{item?.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.title}<ExternalLink size={11}/></a> : <span>{item?.title ?? "원장에 없는 근거"}</span>}{item?.date && <small>{item.date.slice(0, 10)}</small>}</li>; })}</ul>}
      </li>;
    })}</ol>
    <style jsx>{`
      .cr{display:grid;gap:10px}.cr-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--muted);align-items:baseline}.cr-meta strong{font-size:15px;color:var(--title)}.cr-legend{margin:0;font-size:11px;color:var(--muted);line-height:1.6}.cr-legend b{color:#3a3d4a}
      .cr-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:10px}.cr-list>li{border:1.5px solid var(--ink);background:#fff;padding:14px;display:flex;flex-direction:column;gap:6px;min-width:0}.cr-list>li[data-selected=true]{box-shadow:0 0 0 3px #f6ff3a,3px 3px 0 var(--ink)}
      .cr-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px}.status{font-weight:800;font-size:10.5px;padding:2px 7px;border:1.5px solid currentColor}.status.obs{color:#0f6b3a}.status.emg{color:#9a5b00}.status.ins{color:#6b6f80;border-style:dashed}.dir{font-weight:800;color:#7b3fb5}.muted{color:var(--muted)}
      h3{margin:2px 0 0;font-size:15px;color:#14161f;overflow-wrap:anywhere}p{margin:0;font-size:12.5px;line-height:1.6;color:#3a3d4a;overflow-wrap:anywhere}
      dl{margin:0;display:grid;gap:2px;font-size:11.5px}dl div{display:flex;gap:6px;min-width:0}dt{flex:0 0 44px;color:var(--muted)}dd{margin:0;min-width:0;overflow-wrap:anywhere}
      .cr-links{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto;padding-top:6px}.cr-links :global(.button){font-size:11.5px;padding:5px 9px}.cr-links :global(svg){width:13px}
      .cr-ev{list-style:none;margin:4px 0 0;padding:8px;display:grid;gap:6px;border:1px dashed var(--border);background:#fafbfe;font-size:11.5px}.cr-ev li{display:flex;gap:6px;flex-wrap:wrap;min-width:0}.cr-ev code{font-size:10.5px;color:var(--muted)}.cr-ev small{color:var(--muted)}.cr-ev a{overflow-wrap:anywhere}
      @media(max-width:760px){.cr-list{grid-template-columns:1fr}}
    `}</style>
  </div>;
}
