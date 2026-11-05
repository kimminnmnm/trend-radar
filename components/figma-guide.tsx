"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getStudioProjects } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { useAccountSync } from "@/lib/account-sync";
import { productionFormatLabels } from "@/lib/content-production";
import { DataBadge, PageHeader, formatDateTime } from "./ui";

/**
 * CREATE · Figma Export 안내 페이지(/figma). 실제 보내기는 Content Studio의 "Figma로 보내기"에서, 받기는 Figma 플러그인에서 한다.
 * /figma/connect는 플러그인이 연결 키를 붙여 여는 연결 허용 페이지라 메뉴에서 바로 열면 "연결 키가 없습니다"가 나온다 — 메뉴는 이 안내로 보낸다.
 * 이 페이지는 아무것도 호출하거나 저장하지 않는다.
 */
export function FigmaGuide() {
  const projects = useStored(getStudioProjects) ?? [];
  const account = useAccountSync();
  const signedIn = Boolean(account.userId);
  const cardnews = projects.filter((project) => project.settings.format === "cardnews" && project.plan);
  return <div className="page figma-guide" data-testid="figma-guide">
    <PageHeader eyebrow="CREATE / FIGMA EXPORT" title="Figma로 보내기" description="Content Studio에서 만든 카드뉴스를 Figma의 편집 가능한 프레임으로 옮깁니다. AUTO DESIGN 또는 내 Figma 템플릿(MY TEMPLATES)을 쓸 수 있습니다."
      guide={{ what: "보내기 순서와 Figma 플러그인 연결 방법을 안내합니다.", first: "아래에서 프로젝트를 열고 Content Studio의 'Figma로 보내기'를 누르세요(로그인 필요).", next: "Figma의 TREND RADAR Studio Import 플러그인이 보낸 작업을 받아 프레임을 만듭니다." }}/>
    <ol className="fg-steps">
      <li><b>01</b><div><h2>Content Studio에서 보내기</h2><p>카드뉴스 프로젝트를 열고 오른쪽 아래 <strong>Figma로 보내기</strong>를 누릅니다. 로그인한 계정에 작업이 등록되고 연결 코드가 보입니다. 로그인 없이 파일로 옮기려면 <strong>Figma JSON 내보내기</strong>를 씁니다.</p>
        {!signedIn && <p className="fg-note" data-testid="figma-guide-signin"><DataBadge status="NOT AVAILABLE" detail="로그인 필요"/> Figma로 보내기는 로그인해야 쓸 수 있습니다. <Link href="/auth">로그인하기</Link></p>}</div></li>
      <li><b>02</b><div><h2>Figma 플러그인 연결(처음 한 번)</h2><p>Figma에서 <strong>TREND RADAR Studio Import</strong> 플러그인을 실행하고 <strong>TREND RADAR 연결</strong>을 누르면, 이 사이트의 연결 페이지가 연결 키와 함께 열립니다. 거기서 허용하면 됩니다. 연결 페이지는 플러그인이 열어 주는 페이지라 메뉴에서 직접 열 필요가 없습니다.</p></div></li>
      <li><b>03</b><div><h2>Figma에서 받기</h2><p>플러그인이 보낸 작업 목록을 불러옵니다. 작업을 고르고 AUTO DESIGN 또는 MY TEMPLATES로 프레임을 만듭니다. 내 템플릿을 쓰려면 플러그인에서 <strong>SYNC MY TEMPLATES</strong>를 먼저 눌러 Content Studio 갤러리에 등록합니다. 원본 템플릿은 바뀌지 않습니다.</p></div></li>
    </ol>
    <section className="fg-projects" aria-labelledby="fg-projects-title">
      <h2 id="fg-projects-title">보낼 수 있는 카드뉴스</h2>
      {cardnews.length ? <ul>{cardnews.slice(0, 8).map((project) => <li key={project.id}><Link href={`/studio?project=${encodeURIComponent(project.id)}`} data-testid="figma-guide-project"><b>{project.plan?.title ?? project.title}</b><span>{productionFormatLabels[project.settings.format]} · {project.plan?.slides.length ?? 0}장 · 수정 {formatDateTime(project.updatedAt)}</span><em>Studio에서 열기 <ArrowRight size={13}/></em></Link></li>)}</ul>
        : <p className="fg-empty" data-testid="figma-guide-empty">아직 만든 카드뉴스가 없습니다. <Link href="/studio">Content Studio</Link>에서 카드뉴스를 만들면 여기에서 바로 열 수 있습니다.</p>}
    </section>
    <style jsx>{`
      .fg-steps{list-style:none;margin:0 0 28px;padding:0;display:grid;gap:12px}
      .fg-steps li{display:grid;grid-template-columns:56px minmax(0,1fr);gap:14px;padding:18px;border:1.5px solid var(--ink);background:#fff}
      .fg-steps li>b{font-family:var(--font-display);font-size:28px;color:var(--blue);line-height:1}
      .fg-steps h2{margin:0 0 6px;font-size:18px}.fg-steps p{margin:0;font-size:14px;line-height:1.7;color:var(--text)}
      .fg-note{margin-top:10px!important;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.fg-note :global(a){color:var(--blue);text-decoration:underline}
      .fg-projects h2{font-size:18px;margin:0 0 10px}
      .fg-projects ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px}
      .fg-projects ul :global(a){display:grid;gap:4px;padding:14px;border:1.5px solid var(--ink);background:#fff;color:var(--text)}
      .fg-projects ul :global(a:hover){background:#f6ffd1}
      .fg-projects span{font-size:12px;color:var(--muted)}.fg-projects em{font-style:normal;font-size:13px;font-weight:700;color:var(--blue);display:inline-flex;gap:4px;align-items:center}
      .fg-empty{margin:0;padding:16px;border:1.5px dashed var(--ink);background:#fff}.fg-empty :global(a){color:var(--blue);text-decoration:underline}
      @media(max-width:600px){.fg-steps li{grid-template-columns:1fr;gap:6px}}
    `}</style>
  </div>;
}
