"use client";

import { getInterfaceStyle, setInterfaceStyle, useInterfaceStyle } from "@/lib/interface-preferences";
import type { InterfaceStyle } from "@/lib/interface-style";

const OPTIONS: Array<{ value: InterfaceStyle; label: string; badge: string; text: string }> = [
  { value: "classic", label: "CLASSIC DESKTOP", badge: "기본", text: "기존 Y2K Pixel Desktop. 왼쪽 사이드바와 창(윈도우) 패널." },
  { value: "editorial", label: "EDITORIAL WEB", badge: "새 디자인 · 검증 중", text: "상단 내비게이션과 스크롤 중심의 편집형 레이아웃." },
];

/** Settings · INTERFACE STYLE: 디자인만 바꾼다(분석·프로젝트·로그인 상태는 그대로). 언제든 CLASSIC DESKTOP으로 되돌릴 수 있다. */
export function InterfaceStyleSetting() {
  const current = useInterfaceStyle();
  const choose = (value: InterfaceStyle) => { if (getInterfaceStyle() !== value) setInterfaceStyle(value); };
  return <section className="panel interface-style" aria-labelledby="interface-style-title" data-testid="interface-style">
    <header><h2 id="interface-style-title">INTERFACE STYLE</h2><p>화면 디자인과 메뉴 배치만 바뀝니다. 분석 결과·콘텐츠 프로젝트·로그인 상태는 그대로 유지됩니다. 선택은 이 브라우저에 저장됩니다.</p></header>
    <div className="options" role="radiogroup" aria-label="INTERFACE STYLE">
      {OPTIONS.map((option) => <label key={option.value} className={`option ${current === option.value ? "on" : ""}`}>
        <input type="radio" name="interface-style" value={option.value} checked={current === option.value} onChange={() => choose(option.value)} data-testid={`style-${option.value}`}/>
        <span className={`swatch ${option.value}`} aria-hidden/>
        <span className="copy"><b>{option.label}</b><em>{option.badge}</em><small>{option.text}</small></span>
      </label>)}
    </div>
    <style jsx>{`
      .interface-style{padding:22px 24px;margin-bottom:14px}.interface-style header h2{margin:0 0 6px;font-size:16px}.interface-style header p{margin:0 0 14px;font-size:13px;color:var(--muted);line-height:1.6;max-width:760px}
      .options{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.option{display:grid;grid-template-columns:auto 56px 1fr;gap:12px;align-items:center;padding:12px 14px;border:1.5px solid var(--ink);cursor:pointer;background:#fff}
      .option.on{outline:3px solid var(--blue);outline-offset:0}.copy{display:grid;gap:2px}.copy b{font-size:14px}.copy em{font-style:normal;font-size:11px;font-weight:700;color:var(--blue)}.copy small{font-size:12px;color:var(--muted);line-height:1.5}
      .swatch{width:56px;height:40px;border:1.5px solid var(--ink)}.swatch.classic{background:linear-gradient(#2238e6 0 9px,#7fb4fb 9px 28px,#5cf28c 28px)}.swatch.editorial{background:linear-gradient(90deg,#111 0 30%,#f5f5f2 30% 72%,#dfff32 72%)}
      @media(max-width:700px){.options{grid-template-columns:1fr}}
    `}</style>
  </section>;
}
