"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Aperture, Atom, Beaker, BookMarked, Compass, FlaskConical, HelpCircle, Instagram, Menu, Network, Orbit, Settings, Sparkles, UserRound, X } from "lucide-react";
import { useState } from "react";
import { getLiveAnalyses, setOnboardingDone } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { trendPath } from "@/lib/live-trend";
import { WinButtons } from "@/components/ui";
import { JourneyBar } from "@/components/journey-bar";
import { AccountSyncBar } from "@/components/account-sync-bar";
import { StorageWarning } from "@/components/storage-warning";

const nav = [
  { href: "/", label: "Overview", desc: "지금 뜨는 해시태그·2030 순위", icon: Aperture },
  { href: "/discover", label: "Discover", desc: "키워드 입력하고 분석 시작", icon: Compass },
  { href: "/trends/heisei-retro/why", label: "Trend Why", desc: "왜 뜨는지 근거로 분석", icon: Orbit },
  { href: "/trends/heisei-retro/dna", label: "Trend DNA", desc: "트렌드를 6가지 요소로 분해", icon: Atom },
  { href: "/culture-map", label: "Culture Map", desc: "분석한 트렌드 사이의 연결", icon: Network },
  { href: "/collision", label: "Collision", desc: "트렌드를 섞어 아이디어 찾기", icon: Sparkles },
  { href: "/lab", label: "Trend Lab", desc: "브랜드에 적용해도 될지 검토", icon: Beaker },
  { href: "/studio", label: "Content Studio", desc: "근거가 연결된 콘텐츠 기획안", icon: FlaskConical },
  { href: "/workspace", label: "Workspace", desc: "저장한 분석·기획안 모아보기", icon: BookMarked },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const live = useStored(getLiveAnalyses) ?? [];
  const latest = live[0];
  // WHY·DNA 메뉴는 가장 최근 LIVE 트렌드로 연결하고, 없을 때만 데모 트렌드로 연결한다.
  const links = nav.map((item) => latest && item.label === "Trend Why" ? { ...item, href: trendPath(latest.trendId, "why") } : latest && item.label === "Trend DNA" ? { ...item, href: trendPath(latest.trendId, "dna") } : item);
  const isActive = (href: string, label: string) => pathname === href || (label === "Trend Why" && /^\/trends\/[^/]+\/why$/.test(pathname)) || (label === "Trend DNA" && /^\/trends\/[^/]+\/dna$/.test(pathname));
  return (
    <div className="app-shell">
      <header className="mobile-bar">
        <Link href="/" className="mobile-logo"><i /> TR</Link>
        <button className="icon-button" onClick={() => setOpen(!open)} aria-label="메뉴 열기">{open ? <X /> : <Menu />}</button>
      </header>
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="titlebar"><span>Trend Explorer</span><WinButtons /></div>
        <div className="sidebar-body">
        <div className="brand">
          <div className="brand-mark"><span /><span /><span /></div>
          <div><strong>TREND RADAR</strong><small>CULTURAL INTELLIGENCE</small></div>
        </div>
        <nav className="nav-list">
          <p className="nav-caption">OBSERVATORY</p>
          {links.slice(0, 6).map(({ href, label, desc, icon: Icon }) => (
            <Link key={label} href={href} aria-label={label} onClick={() => setOpen(false)} className={isActive(href, label) ? "active" : ""}><Icon size={17} /><span className="nav-text"><span>{label}</span><small aria-hidden>{desc}</small></span></Link>
          ))}
          <p className="nav-caption">MAKE & VALIDATE</p>
          {links.slice(6).map(({ href, label, desc, icon: Icon }) => (
            <Link key={label} href={href} aria-label={label} onClick={() => setOpen(false)} className={isActive(href, label) ? "active" : ""}><Icon size={17} /><span className="nav-text"><span>{label}</span><small aria-hidden>{desc}</small></span></Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href="/auth" className={pathname === "/auth" ? "active" : ""}><UserRound size={17} />Account</Link>
          <Link href="/instagram" className={pathname === "/instagram" ? "active" : ""}><Instagram size={17} />Instagram</Link>
          <Link href="/settings" className={pathname === "/settings" ? "active" : ""}><Settings size={17} />Settings</Link>
          <Link href="/" className="guide-link" onClick={() => { setOnboardingDone(false); setOpen(false); }}><HelpCircle size={17} />사용 가이드</Link>
          <div className="demo-chip"><b className="start"><span /> {live.length ? "HYBRID" : "DEMO"}</b><small>{live.length ? `LIVE ${live.length} · DEMO 분리` : "LIVE 분석 없음"}</small></div>
        </div>
        </div>
      </aside>
      {open && <button className="backdrop" aria-label="메뉴 닫기" onClick={() => setOpen(false)} />}
      <main className="main-content"><StorageWarning /><AccountSyncBar /><JourneyBar />{children}</main>
    </div>
  );
}
