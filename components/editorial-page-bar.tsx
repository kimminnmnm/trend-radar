"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useInterfaceStyle } from "@/lib/interface-preferences";
import type { DataStatus } from "@/lib/types";
import { DataBadge, formatDateTime } from "./ui";

export type PageBarAction = { href: string; label: string; primary?: boolean; testId?: string };
export type PageBarSection = { id: string; label: string };

/**
 * TREND RADAR 3.0 Editorial Web 분석 화면 요약 막대: 분석 유형 · 데이터 상태 · 마지막 분석 시각 · 핵심 요약 · 다음 행동 · 이 페이지의 섹션.
 * Classic Desktop에서는 그리지 않는다(기존 화면 그대로). 화면의 데이터·로직은 바꾸지 않고, 이미 있는 값만 모아 보여 준다.
 */
export function EditorialPageBar({ type, title, status, analyzedAt, summary, actions = [], sections = [], testId = "page-bar" }: { type: string; title: string; status: DataStatus; analyzedAt?: string; summary?: React.ReactNode; actions?: PageBarAction[]; sections?: PageBarSection[]; testId?: string }) {
  const style = useInterfaceStyle();
  if (style !== "editorial") return null;
  return <section className="ed-pagebar" aria-label={`${type} 요약`} data-testid={testId}>
    <div className="ed-pagebar-main">
      <div className="ed-pagebar-meta"><span className="ed-pagebar-type">{type}</span><DataBadge status={status}/>{analyzedAt && <span>마지막 분석 {formatDateTime(analyzedAt)}</span>}</div>
      <p className="ed-pagebar-title">{title}</p>
      {summary && <div className="ed-pagebar-summary" data-testid={`${testId}-summary`}>{summary}</div>}
      {actions.length > 0 && <div className="ed-pagebar-actions">{actions.map((action) => <Link key={action.href + action.label} className={`button${action.primary ? " primary" : ""}`} href={action.href} data-testid={action.testId}>{action.label} <ArrowRight size={14}/></Link>)}</div>}
    </div>
    {sections.length > 0 && <nav className="ed-onpage" aria-label="이 페이지의 섹션" data-testid={`${testId}-sections`}><small>ON THIS PAGE</small><ol>{sections.map((section, index) => <li key={section.id}><a href={`#${section.id}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.label}</a></li>)}</ol></nav>}
  </section>;
}
