import Link from "next/link";
import type { DataStatus, EvidenceStatus } from "@/lib/types";
import type { EvidenceItem } from "@/lib/schemas";
import { ArrowUpRight, ExternalLink } from "lucide-react";

export function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow"><span />{children}</div>; }

export function StatusPill({ status }: { status: EvidenceStatus }) {
  const cls = status === "Verified Signal" ? "verified" : status === "Supported Hypothesis" ? "supported" : status === "Insufficient Evidence" ? "insufficient" : "creative";
  return <span className={`status ${cls}`}><i />{status}</span>;
}

/** 결과가 어디서 왔는지 표시한다. API가 연결돼 있다는 이유만으로 LIVE를 표시하지 않는다. */
export function DataBadge({ status, detail }: { status: DataStatus; detail?: string }) {
  const label = status === "SAVED" ? "SAVED ANALYSIS" : status === "LIVE" ? "LIVE ANALYSIS" : status;
  return <span className={`data-badge ${status.toLowerCase().replace(/\s+/g, "-")}`} data-testid="data-badge"><i />{label}{detail && <small>{detail}</small>}</span>;
}

/** 창 타이틀바 오른쪽의 최소화·최대화·닫기 장식. 동작 없는 시각 요소다. */
export function WinButtons() { return <span className="win-buttons" aria-hidden><i>_</i><i>□</i><i className="close">×</i></span>; }

export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: React.ReactNode; description: string; action?: React.ReactNode }) {
  return <header className="page-header window"><div className="titlebar"><Eyebrow>{eyebrow}</Eyebrow><WinButtons /></div><div className="window-body"><div><h1>{title}</h1><p>{description}</p></div>{action}</div></header>;
}

export function SectionHeading({ index, title, description }: { index?: string; title: string; description?: string }) {
  return <div className="section-heading"><div className="bar">{index && <span>{index}</span>}<h2>{title}</h2></div>{description && <p>{description}</p>}</div>;
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-link">{children}<ArrowUpRight size={15} /></Link>;
}

/** 근거 ID를 서버가 만든 원장 항목과 연결해 표시한다. 원장에 없는 ID는 표시하지 않는다. */
export function EvidenceRefs({ ids, evidence, empty = "근거 없음 · 검증 공백" }: { ids: string[] | undefined; evidence: Map<string, EvidenceItem>; empty?: string }) {
  const items = (ids ?? []).map((id) => [id, evidence.get(id)] as const).filter(([, item]) => item);
  if (!items.length) return <span className="evidence-refs empty">{empty}</span>;
  return <span className="evidence-refs">{items.map(([id, item]) => item!.url
    ? <a key={id} href={item!.url} target="_blank" rel="noreferrer" title={`${item!.title}\n${item!.excerpt}`}>{id}<ExternalLink /></a>
    : <b key={id} title={`${item!.title}\n${item!.excerpt}`}>{id}</b>)}</span>;
}

export function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("ko-KR");
}
