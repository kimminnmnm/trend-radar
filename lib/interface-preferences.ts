"use client";

import { useEffect, useState } from "react";
import { DEFAULT_INTERFACE_STYLE, INTERFACE_STYLE_EVENT, INTERFACE_STYLE_KEY, isInterfaceStyle, type InterfaceStyle } from "./interface-style";

/** 저장된 디자인 선택. 저장소를 읽지 못하면 기존 디자인. */
export function getInterfaceStyle(): InterfaceStyle {
  try {
    const value = localStorage.getItem(INTERFACE_STYLE_KEY);
    return isInterfaceStyle(value) ? value : DEFAULT_INTERFACE_STYLE;
  } catch { return DEFAULT_INTERFACE_STYLE; }
}

/** 디자인만 바꾼다. 분석·프로젝트·로그인 데이터는 건드리지 않는다. */
export function setInterfaceStyle(style: InterfaceStyle) {
  try { localStorage.setItem(INTERFACE_STYLE_KEY, style); } catch { /* 저장하지 못해도 이번 화면에는 적용한다 */ }
  document.documentElement.setAttribute("data-ui", style);
  window.dispatchEvent(new CustomEvent(INTERFACE_STYLE_EVENT, { detail: style }));
}

/** 현재 디자인. 첫 렌더(서버와 같음)는 null이고, 브라우저에서 읽은 뒤 값이 정해진다. */
export function useInterfaceStyle(): InterfaceStyle | null {
  const [style, setStyle] = useState<InterfaceStyle | null>(null);
  useEffect(() => {
    const refresh = () => setStyle(getInterfaceStyle());
    const frame = requestAnimationFrame(refresh);
    window.addEventListener(INTERFACE_STYLE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => { cancelAnimationFrame(frame); window.removeEventListener(INTERFACE_STYLE_EVENT, refresh); window.removeEventListener("storage", refresh); };
  }, []);
  return style;
}
