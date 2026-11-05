"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, Search, Settings, UserRound, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getLiveAnalyses, setOnboardingDone } from "@/lib/storage";
import { useStored } from "@/lib/use-stored";
import { trendPath, keywordFromLiveId, safeDecode, isLiveTrendId } from "@/lib/live-trend";
import { resolveTrend } from "@/lib/demo-data";

type Item = { href: string; label: string; desc: string; match?: (path: string) => boolean };
type Group = { key: string; label: string; items: Item[] };

/**
 * TREND RADAR 3.0 Editorial Web 상단 내비게이션. 기존 사이드바의 모든 목적지를 5개 묶음으로 나눈다(경로는 그대로).
 * Classic Desktop에서는 CSS로 숨긴다(html[data-ui=classic]) — 기존 사이드바와 동시에 보이지 않는다.
 */
function useGroups(): Group[] {
  const live = useStored(getLiveAnalyses) ?? [];
  const latest = live[0];
  const why = latest ? trendPath(latest.trendId, "why") : "/trends/heisei-retro/why";
  const dna = latest ? trendPath(latest.trendId, "dna") : "/trends/heisei-retro/dna";
  return [
    { key: "discover", label: "DISCOVER", items: [
      { href: "/", label: "Overview", desc: "지금 뜨는 신호와 이어 할 작업", match: (p) => p === "/" },
      { href: "/discover", label: "Discover", desc: "키워드를 검색해 분석 시작" },
      { href: "/instagram", label: "Instagram", desc: "해시태그 직접 조회" },
    ] },
    { key: "analyze", label: "ANALYZE", items: [
      { href: why, label: "Trend WHY", desc: "뜨는 이유를 근거 ID와 함께", match: (p) => /^\/trends\/[^/]+\/why$/.test(p) },
      { href: dna, label: "Trend DNA", desc: "6가지 문화 요소로 분해", match: (p) => /^\/trends\/[^/]+\/dna$/.test(p) },
      { href: `${dna}#visual-dna`, label: "Visual DNA", desc: "실제 이미지의 색·구도·모티프" },
    ] },
    { key: "connect", label: "CONNECT", items: [
      { href: "/trend-web", label: "Trend Web", desc: "한 검색 안의 연결 신호 탐색" },
      { href: "/culture-map", label: "Culture Map", desc: "분석한 트렌드 사이의 관계" },
      { href: "/collision?mode=creative", label: "Creative Collision", desc: "두 트렌드로 SAFE·BOLD·WILD 아이디어", match: (p) => p === "/collision" },
    ] },
    { key: "create", label: "CREATE", items: [
      { href: "/lab", label: "Trend Lab", desc: "브랜드 적합성·위험 검토" },
      { href: "/studio", label: "Content Studio", desc: "카드뉴스·숏폼 제작" },
      { href: "/figma", label: "Figma Export", desc: "Figma로 보내기 안내·플러그인 연결" },
    ] },
    { key: "workspace", label: "WORKSPACE", items: [
      { href: "/workspace", label: "Workspace", desc: "저장된 분석 및 제작 프로젝트" },
    ] },
  ];
}
const pathOf = (href: string) => href.split(/[?#]/)[0];
const itemActive = (item: Item, path: string) => item.match ? item.match(path) : pathOf(item.href) !== "/" && path === pathOf(item.href);

export function EditorialNav() {
  const pathname = usePathname();
  const router = useRouter();
  const groups = useGroups();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [query, setQuery] = useState("");
  const navRef = useRef<HTMLElement>(null);
  // 바깥 클릭·Esc로 펼친 메뉴를 닫는다.
  useEffect(() => {
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !navRef.current?.contains(event.target as Node)) { setOpenGroup(null); if (event instanceof KeyboardEvent) setMobile(false); }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, []);
  const closeAll = () => { setOpenGroup(null); setMobile(false); };
  const search = (event: React.FormEvent) => {
    event.preventDefault();
    const keyword = query.trim();
    // 검색은 Discover 입력칸만 채운다. 분석(유료 호출)은 사용자가 Discover에서 직접 누른다.
    router.push(keyword ? `/discover?q=${encodeURIComponent(keyword)}` : "/discover");
    setQuery(""); closeAll();
  };
  return <header className="ed-nav" ref={navRef} data-testid="editorial-nav">
    <div className="ed-nav-inner">
      <Link href="/" className="ed-logo" onClick={closeAll} aria-label="TREND RADAR 홈"><i aria-hidden/>TREND RADAR</Link>
      <nav className={`ed-groups ${mobile ? "open" : ""}`} aria-label="주요 메뉴" id="ed-menu">
        {groups.map((group) => {
          const active = group.items.some((item) => itemActive(item, pathname));
          const expanded = openGroup === group.key || mobile;
          return <div key={group.key} className={`ed-group ${active ? "active" : ""}`}>
            <button type="button" className="ed-group-btn" aria-expanded={expanded} aria-controls={`ed-${group.key}`} onClick={() => setOpenGroup(openGroup === group.key ? null : group.key)} data-testid={`ed-group-${group.key}`}>
              {group.label}<ChevronDown size={14} aria-hidden/>
            </button>
            <ul id={`ed-${group.key}`} className={`ed-menu ${expanded ? "open" : ""}`}>
              {group.items.map((item) => <li key={item.label}><Link href={item.href} onClick={closeAll} aria-current={itemActive(item, pathname) ? "page" : undefined}><b>{item.label}</b><small>{item.desc}</small></Link></li>)}
            </ul>
          </div>;
        })}
        <div className="ed-mobile-extra">
          <Link href="/auth" onClick={closeAll}>ACCOUNT</Link>
          <Link href="/settings" onClick={closeAll}>SETTINGS · 디자인 전환</Link>
          <Link href="/" onClick={() => { setOnboardingDone(false); closeAll(); }}>사용 가이드</Link>
        </div>
      </nav>
      <form className="ed-search" role="search" onSubmit={search}>
        <Search size={15} aria-hidden/>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="키워드 검색" aria-label="키워드 검색(Discover로 이동)" maxLength={60}/>
      </form>
      <div className="ed-utils">
        <Link href="/auth" aria-label="Account" className={pathname === "/auth" ? "active" : ""}><UserRound size={17}/></Link>
        <Link href="/settings" aria-label="Settings" className={pathname === "/settings" ? "active" : ""}><Settings size={17}/></Link>
        <button type="button" className="ed-menu-btn" aria-label={mobile ? "메뉴 닫기" : "메뉴 열기"} aria-expanded={mobile} aria-controls="ed-menu" onClick={() => { setMobile(!mobile); setOpenGroup(null); }}>{mobile ? <X size={20}/> : <Menu size={20}/>}</button>
      </div>
    </div>
  </header>;
}

/** 깊은 화면의 현재 위치: Discover / 트렌드 / Trend WHY */
export function EditorialBreadcrumb() {
  const pathname = usePathname();
  const live = useStored(getLiveAnalyses) ?? [];
  const match = pathname.match(/^\/trends\/([^/]+)\/(why|dna)$/);
  const crumbs: Array<{ label: string; href?: string }> = [];
  if (match) {
    const id = safeDecode(match[1]);
    const name = live.find((item) => item.trendId === id)?.trendName ?? (isLiveTrendId(id) ? keywordFromLiveId(id) : resolveTrend(id)?.name ?? id);
    crumbs.push({ label: "Discover", href: "/discover" }, { label: name, href: trendPath(id, "why") }, { label: match[2] === "why" ? "Trend WHY" : "Trend DNA" });
  } else {
    const labels: Record<string, [string, string]> = { "/discover": ["DISCOVER", "Discover"], "/instagram": ["DISCOVER", "Instagram"], "/trend-web": ["CONNECT", "Trend Web"], "/culture-map": ["CONNECT", "Culture Map"], "/collision": ["CONNECT", "Collision"], "/lab": ["CREATE", "Trend Lab"], "/studio": ["CREATE", "Content Studio"], "/figma": ["CREATE", "Figma Export"], "/figma/connect": ["CREATE", "Figma 연결"], "/workspace": ["WORKSPACE", "Workspace"], "/settings": ["SYSTEM", "Settings"], "/auth": ["SYSTEM", "Account"] };
    const found = labels[pathname];
    if (found) crumbs.push({ label: found[0] }, { label: found[1] });
  }
  if (!crumbs.length) return null;
  return <nav className="ed-crumbs" aria-label="현재 위치" data-testid="editorial-breadcrumb"><ol>{crumbs.map((crumb, index) => <li key={`${crumb.label}-${index}`}>{crumb.href && index < crumbs.length - 1 ? <Link href={crumb.href}>{crumb.label}</Link> : <span aria-current={index === crumbs.length - 1 ? "page" : undefined}>{crumb.label}</span>}</li>)}</ol></nav>;
}
