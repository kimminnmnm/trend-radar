/**
 * TREND RADAR 3.0 — 화면 디자인 선택(서버·클라이언트 공용 상수).
 * classic: 기존 Y2K Pixel Desktop(TREND RADAR — LEGACY DESKTOP) · editorial: Editorial Web.
 * 디자인 선택은 화면 표현과 내비게이션만 바꾼다. 분석·프로젝트·로그인 데이터와는 별개의 키에 저장한다.
 */
export type InterfaceStyle = "classic" | "editorial";
export const INTERFACE_STYLES: readonly InterfaceStyle[] = ["classic", "editorial"];
/** 새 디자인을 충분히 검증하기 전까지 기본값은 기존 디자인이다. */
export const DEFAULT_INTERFACE_STYLE: InterfaceStyle = "classic";
export const INTERFACE_STYLE_KEY = "trend-radar-interface-style";
export const INTERFACE_STYLE_EVENT = "trend-radar:interface-style";

/** 첫 화면을 그리기 전에 <html data-ui>를 정한다(디자인이 깜빡이지 않게). 저장값을 읽지 못하면 기존 디자인. */
export const INTERFACE_BOOT_SCRIPT = `(function(){var s="${DEFAULT_INTERFACE_STYLE}";try{var v=localStorage.getItem("${INTERFACE_STYLE_KEY}");if(v==="editorial"||v==="classic")s=v}catch(e){}document.documentElement.setAttribute("data-ui",s)})();`;

export const isInterfaceStyle = (value: unknown): value is InterfaceStyle => value === "classic" || value === "editorial";
