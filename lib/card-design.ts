import { resolvedSlideImageAssetId, type ProductionPlan, type ProductionSlide, type StudioProject } from "./content-production";
import type { VisualDnaRecord } from "./visual-dna";

/*
 * FIGMA DESIGN ENGINE V2 — 카드뉴스 디자인 기획(웹). Studio가 디자인을 기획하고, Figma 플러그인은 이 장면(scene)을 편집 가능한 노드로 구현한다.
 *  D1 디자인 시스템: 색 토큰 7종 · 타이포 역할 6종 · 간격(안전 여백·요소 간격) · 시각 위계
 *  D2 레이아웃 엔진: L01~L08을 슬라이드 역할·내용 길이·이미지 유무로 고르고, 맞지 않으면 다른 레이아웃으로 바꾼다(문구를 지우지 않는다)
 *  D3 트렌드별 스타일: 소재·방향·톤·Visual DNA로 스타일과 모티프를 고른다. Visual DNA 색은 "이미지에서 관찰한 색", 역할 배정은 "규칙 해석"으로 구분한다.
 * 같은 장면을 웹 미리보기(components/card-preview.tsx)와 플러그인(figma-plugin/code.js)이 그린다. 외부 호출 없음.
 */
export const CARD_DESIGN_VERSION = "card-design-v1";

/* ---------- D5 사용자 설정 ---------- */
export const designStyleIds = ["minimal-editorial", "bold-typography", "kitsch-pop", "retro-digital", "contemporary-magazine", "playful-graphic"] as const;
export type DesignStyleId = (typeof designStyleIds)[number];
export const paletteModes = ["auto", "style", "mono", "vivid"] as const;
export const typeMoods = ["auto", "sans", "serif", "display", "rounded"] as const;
export const imageEmphases = ["auto", "low", "medium", "high"] as const;
export const densities = ["airy", "balanced", "compact"] as const;
export type DesignControls = { style: DesignStyleId | "auto"; palette: (typeof paletteModes)[number]; typeMood: (typeof typeMoods)[number]; imageEmphasis: (typeof imageEmphases)[number]; density: (typeof densities)[number] };
export const defaultDesignControls: DesignControls = { style: "auto", palette: "auto", typeMood: "auto", imageEmphasis: "auto", density: "balanced" };
export const paletteModeLabels: Record<DesignControls["palette"], string> = { auto: "자동(Visual DNA 관찰 색 우선)", style: "스타일 기본색", mono: "모노톤", vivid: "비비드" };
export const typeMoodLabels: Record<DesignControls["typeMood"], string> = { auto: "자동", sans: "고딕(깔끔)", serif: "명조(에디토리얼)", display: "디스플레이(강하게)", rounded: "둥근(친근하게)" };
export const imageEmphasisLabels: Record<DesignControls["imageEmphasis"], string> = { auto: "자동", low: "그래픽 위주", medium: "균형", high: "이미지 크게" };
export const densityLabels: Record<DesignControls["density"], string> = { airy: "여유 있게", balanced: "균형", compact: "촘촘하게" };

/* ---------- D1 디자인 시스템 ---------- */
export type ColorTokens = { primary: string; secondary: string; accent: string; background: string; surface: string; textPrimary: string; textSecondary: string };
export type FontSpec = { family: string; style: string };
export type Motif = "rules" | "stripes" | "stickers" | "pixels" | "camera" | "blobs";
type StyleDef = { label: string; description: string; colors: ColorTokens; fonts: { display: FontSpec; headline: FontSpec; body: FontSpec; label: FontSpec }; motif: Motif; radius: number; coverDark: boolean; tracking: number };

const NOTO = "Noto Sans KR";
export const STYLES: Record<DesignStyleId, StyleDef> = {
  "minimal-editorial": { label: "Minimal Editorial", description: "여백·가는 선·명조 헤드라인. 담백한 정보형", colors: { primary: "#1C1D21", secondary: "#8C8F96", accent: "#C8553D", background: "#F4F1EA", surface: "#FFFFFF", textPrimary: "#17181C", textSecondary: "#575A63" }, fonts: { display: { family: "Noto Serif KR", style: "Bold" }, headline: { family: "Noto Serif KR", style: "Bold" }, body: { family: NOTO, style: "Regular" }, label: { family: NOTO, style: "Medium" } }, motif: "rules", radius: 0, coverDark: false, tracking: -2 },
  "bold-typography": { label: "Bold Typography", description: "어두운 바탕·굵은 대형 글자·사선 그래픽. 스포츠·뉴스형", colors: { primary: "#111216", secondary: "#2A2C33", accent: "#F2C230", background: "#F3F3F1", surface: "#FFFFFF", textPrimary: "#0F1013", textSecondary: "#4D5059" }, fonts: { display: { family: "Black Han Sans", style: "Regular" }, headline: { family: "Black Han Sans", style: "Regular" }, body: { family: NOTO, style: "Medium" }, label: { family: NOTO, style: "Bold" } }, motif: "stripes", radius: 4, coverDark: true, tracking: -3 },
  "kitsch-pop": { label: "Kitsch Pop", description: "핑크·노랑·하늘색, 스티커와 레이어드 장식", colors: { primary: "#FF5FA2", secondary: "#7FD3F0", accent: "#FFE14D", background: "#FFF3F8", surface: "#FFFFFF", textPrimary: "#2B1630", textSecondary: "#6A4A6E" }, fonts: { display: { family: "Jua", style: "Regular" }, headline: { family: "Jua", style: "Regular" }, body: { family: NOTO, style: "Medium" }, label: { family: "Jua", style: "Regular" } }, motif: "stickers", radius: 32, coverDark: false, tracking: -1 },
  "retro-digital": { label: "Retro Digital", description: "어두운 화면·네온·픽셀 블록과 창 테두리", colors: { primary: "#151834", secondary: "#2D3170", accent: "#39FF88", background: "#EDEEF8", surface: "#FFFFFF", textPrimary: "#14162E", textSecondary: "#4A4E7A" }, fonts: { display: { family: "Do Hyeon", style: "Regular" }, headline: { family: "Do Hyeon", style: "Regular" }, body: { family: NOTO, style: "Medium" }, label: { family: "Do Hyeon", style: "Regular" } }, motif: "pixels", radius: 0, coverDark: true, tracking: 0 },
  "contemporary-magazine": { label: "Contemporary Magazine", description: "사진 중심·큰 번호·뷰파인더 장식. 포토 에디토리얼", colors: { primary: "#22252B", secondary: "#B9B2A6", accent: "#E8492F", background: "#EFEBE4", surface: "#FAF8F4", textPrimary: "#1B1D21", textSecondary: "#5E6068" }, fonts: { display: { family: "Noto Serif KR", style: "Black" }, headline: { family: NOTO, style: "Bold" }, body: { family: NOTO, style: "Regular" }, label: { family: NOTO, style: "Medium" } }, motif: "camera", radius: 0, coverDark: true, tracking: -2 },
  "playful-graphic": { label: "Playful Graphic", description: "둥근 도형·밝은 색·말랑한 글자. 캐릭터·라이프스타일", colors: { primary: "#4C6FFF", secondary: "#FFB4A2", accent: "#FFD166", background: "#FFF9EE", surface: "#FFFFFF", textPrimary: "#1F2340", textSecondary: "#5B6080" }, fonts: { display: { family: "Jua", style: "Regular" }, headline: { family: "Jua", style: "Regular" }, body: { family: "Gowun Dodum", style: "Regular" }, label: { family: "Jua", style: "Regular" } }, motif: "blobs", radius: 40, coverDark: false, tracking: -1 },
};

/** 역할별 크기(1080 폭 기준 최대·최소). 길이에 맞춰 이 범위 안에서 정한다 — 무조건 줄이지 않고, 최소보다 작아져야 하면 레이아웃을 바꾼다. */
export const TYPE_SCALE = {
  display: { max: 156, min: 92, lineHeight: 1.12 },
  section: { max: 96, min: 64, lineHeight: 1.18 },
  body: { max: 44, min: 34, lineHeight: 1.5 },
  supporting: { max: 32, min: 26, lineHeight: 1.45 },
  caption: { max: 26, min: 22, lineHeight: 1.4 },
  cta: { max: 40, min: 32, lineHeight: 1.2 },
} as const;
export type TypeRole = keyof typeof TYPE_SCALE;
const DENSITY = { airy: { margin: 0.09, gap: 40 }, balanced: { margin: 0.075, gap: 32 }, compact: { margin: 0.062, gap: 24 } } as const;

/* ---------- 색 계산 ---------- */
const hex = (value: string) => value.replace("#", "").padEnd(6, "0").slice(0, 6);
const rgb = (value: string) => [0, 2, 4].map((i) => parseInt(hex(value).slice(i, i + 2), 16));
const toHex = (values: number[]) => `#${values.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
export function luminance(color: string) { const [r, g, b] = rgb(color).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a: string, b: string) { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t));
const saturation = (color: string) => { const [r, g, b] = rgb(color).map((v) => v / 255); const max = Math.max(r, g, b), min = Math.min(r, g, b); return max === 0 ? 0 : (max - min) / max; };
/** 배경 위 글자색: 대비 4.5 이상이 되는 쪽(밝은/어두운)을 고르고, 모자라면 더 밀어낸다. */
export function readableOn(background: string, dark = "#14151A", light = "#FFFFFF") {
  const pick = contrast(background, dark) >= contrast(background, light) ? dark : light;
  let color = pick;
  for (let i = 0; i < 6 && contrast(background, color) < 4.5; i += 1) color = mix(color, pick === dark ? "#000000" : "#FFFFFF", 0.5);
  // 중간 밝기 배경(예: #C8553D)은 흰색이 4.5에 못 미치고 검정만 넘는다 — 그때는 순수 검정·흰색 중 대비가 큰 쪽.
  if (contrast(background, color) < 4.5) color = contrast(background, "#000000") >= contrast(background, "#FFFFFF") ? "#000000" : "#FFFFFF";
  return color;
}

export type ColorSource = { role: keyof ColorTokens; color: string; source: "observed" | "style" | "rule" };
/** Visual DNA 팔레트(이미지에서 관찰한 색)를 역할에 배정한다. 배정 자체는 규칙 해석이다. */
export function paletteFrom(style: StyleDef, mode: DesignControls["palette"], observed: string[]): { colors: ColorTokens; sources: ColorSource[] } {
  const base = { ...style.colors };
  const sources: ColorSource[] = (Object.keys(base) as Array<keyof ColorTokens>).map((role) => ({ role, color: base[role], source: "style" as const }));
  const set = (role: keyof ColorTokens, color: string, source: ColorSource["source"]) => { base[role] = color.toUpperCase(); const entry = sources.find((item) => item.role === role)!; entry.color = base[role]; entry.source = source; };
  if (mode === "mono") { set("accent", style.colors.primary, "rule"); set("secondary", mix(style.colors.primary, "#FFFFFF", 0.6), "rule"); }
  if (mode === "vivid") { set("accent", "#FF3D7F", "rule"); set("secondary", "#2EC4FF", "rule"); }
  if (mode === "auto" && observed.length >= 2) {
    const valid = observed.filter((color) => /^#?[0-9a-f]{6}$/i.test(color)).map((color) => (color.startsWith("#") ? color : `#${color}`));
    const vivid = [...valid].sort((a, b) => saturation(b) - saturation(a));
    if (vivid[0] && saturation(vivid[0]) > 0.25) set("accent", vivid[0], "observed");
    const deep = [...valid].sort((a, b) => luminance(a) - luminance(b))[0];
    if (deep && luminance(deep) < 0.25) set("primary", deep, "observed");
    else if (vivid[1] && saturation(vivid[1]) > 0.25) set("secondary", vivid[1], "observed");
    const light = [...valid].sort((a, b) => luminance(b) - luminance(a))[0];
    if (light && luminance(light) > 0.7) set("background", mix(light, "#FFFFFF", 0.4), "observed");
  }
  // 대비 보정: 본문 글자는 배경·표면에서 4.5 이상.
  if (contrast(base.textPrimary, base.background) < 4.5) set("textPrimary", readableOn(base.background), "rule");
  if (contrast(base.textSecondary, base.background) < 3) set("textSecondary", mix(base.textPrimary, base.background, 0.35), "rule");
  return { colors: base, sources };
}

/* ---------- D3 스타일 자동 선택 ---------- */
const STYLE_SIGNALS: Array<{ style: DesignStyleId; motif?: Motif; words: RegExp }> = [
  { style: "bold-typography", motif: "stripes", words: /야구|구단|타이거즈|경기|응원|축구|농구|스포츠|선수|리그|우승|직관/ },
  { style: "contemporary-magazine", motif: "camera", words: /카메라|디카|사진|필름|출사|렌즈|촬영|포토/ },
  { style: "kitsch-pop", motif: "stickers", words: /헤이세이|레트로|y2k|스티커|키치|프리쿠라|다마고치|데코|바인더|꾸미기/i },
  { style: "retro-digital", motif: "pixels", words: /게임|픽셀|8비트|도트|오락|아케이드|레트로\s*게임|패미컴|nes|브금/i },
  { style: "minimal-editorial", motif: "rules", words: /발레|패션|코어|룩|코디|뷰티|미술|전시|역사|브랜드/ },
  { style: "playful-graphic", motif: "blobs", words: /캐릭터|귀여|치이카와|디저트|간식|굿즈|팬케이크|산리오|인형/ },
];
const TONE_SIGNALS: Array<{ style: DesignStyleId; words: RegExp }> = [
  { style: "minimal-editorial", words: /담백|정보|차분|에세이|조용/ },
  { style: "bold-typography", words: /강하게|임팩트|뉴스|열정|역동/ },
  { style: "playful-graphic", words: /유쾌|귀엽|친근|발랄|팬의 마음/ },
  { style: "kitsch-pop", words: /키치|화려|톡톡|힙/ },
];
export type StyleChoice = { style: DesignStyleId; motif: Motif; reason: string; scores: Partial<Record<DesignStyleId, number>> };
/** 소재·방향 단어(×2), 톤(+5), Visual DNA 관찰 모티프·무드(×1)로 점수를 매긴다. 톤을 바꾸면 같은 소재도 다른 스타일이 될 수 있다. */
export function chooseStyle(input: { subject: string; angle: string; tone: string; dnaText: string }): StyleChoice {
  const scores: Partial<Record<DesignStyleId, number>> = {};
  const add = (style: DesignStyleId, value: number) => { scores[style] = (scores[style] ?? 0) + value; };
  let motif: Motif | null = null;
  for (const signal of STYLE_SIGNALS) {
    const subjectHits = (`${input.subject} ${input.angle}`.match(new RegExp(signal.words.source, `g${signal.words.flags.replace("g", "")}`)) ?? []).length;
    if (subjectHits) { add(signal.style, subjectHits * 2); if (!motif && signal.motif) motif = signal.motif; }
    if (signal.words.test(input.dnaText)) add(signal.style, 1);
  }
  // 사용자가 고른 톤은 소재 단어(보통 2~4점)보다 크게 둔다 — 톤을 바꾸면 같은 소재도 다른 디자인이 될 수 있다.
  for (const signal of TONE_SIGNALS) if (signal.words.test(input.tone)) add(signal.style, 5);
  const ranked = (Object.entries(scores) as Array<[DesignStyleId, number]>).sort((a, b) => b[1] - a[1]);
  const style = ranked[0]?.[0] ?? "contemporary-magazine";
  const reasons = ranked.slice(0, 2).map(([id, score]) => `${STYLES[id].label} ${score}`).join(", ");
  return { style, motif: motif && STYLE_SIGNALS.find((signal) => signal.motif === motif)?.style === style ? motif : STYLES[style].motif, reason: ranked.length ? `소재·방향·톤·Visual DNA 단어 점수(${reasons})` : "신호 없음 → 기본(Contemporary Magazine)", scores };
}

const MOOD_FONTS: Record<Exclude<DesignControls["typeMood"], "auto">, { display: FontSpec; headline: FontSpec; body: FontSpec }> = {
  sans: { display: { family: NOTO, style: "Black" }, headline: { family: NOTO, style: "Bold" }, body: { family: NOTO, style: "Regular" } },
  serif: { display: { family: "Noto Serif KR", style: "Black" }, headline: { family: "Noto Serif KR", style: "Bold" }, body: { family: NOTO, style: "Regular" } },
  display: { display: { family: "Black Han Sans", style: "Regular" }, headline: { family: "Black Han Sans", style: "Regular" }, body: { family: NOTO, style: "Medium" } },
  rounded: { display: { family: "Jua", style: "Regular" }, headline: { family: "Jua", style: "Regular" }, body: { family: "Gowun Dodum", style: "Regular" } },
};

/* ---------- 텍스트 측정(추정) ---------- */
/** 글자 폭 추정(em): 한글·한자·가나 0.95, 영문·숫자 0.56, 공백 0.28, 문장부호 0.35. 실제 글꼴과 다를 수 있어 플러그인이 실측으로 한 번 더 맞춘다. */
const charWidth = (char: string) => /[ㄱ-힝぀-ヿ一-鿿]/.test(char) ? 0.95 : /\s/.test(char) ? 0.28 : /[A-Za-z0-9]/.test(char) ? 0.56 : 0.35;
export function estimateLines(text: string, size: number, width: number, tracking = 0) {
  const perEm = size * (1 + tracking / 100);
  let lines = 0;
  for (const paragraph of text.split("\n")) {
    let line = 0;
    lines += 1;
    for (const word of paragraph.split(/(\s+)/)) {
      const w = [...word].reduce((sum, char) => sum + charWidth(char), 0) * perEm;
      if (line + w <= width || line === 0) { line += w; if (line > width) { lines += Math.floor(line / width); line = line % width; } }
      else if (/^\s+$/.test(word)) continue;
      else { lines += 1; line = w; }
    }
  }
  return lines;
}
/**
 * 제목 줄바꿈 조정: 예상 줄 수가 2줄 이상이면 띄어쓰기 위치에서 줄 길이가 고르게 나뉘도록 줄바꿈을 넣는다.
 * ("같은 연못, 두 / 가지 거리"처럼 한 단어만 떨어지는 줄을 막는다.) 이미 줄바꿈이 있으면 그대로 둔다.
 */
export function balanceBreaks(text: string, size: number, width: number, tracking = 0) {
  if (text.includes("\n")) return text;
  const lines = estimateLines(text, size, width, tracking);
  if (lines < 2) return text;
  const words = text.split(" ");
  if (words.length < lines) return text;
  const widthOf = (part: string) => [...part].reduce((sum, char) => sum + charWidth(char), 0) * size * (1 + tracking / 100);
  const target = widthOf(text) / lines;
  const out: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && widthOf(next) > target * 1.12 && out.length < lines - 1) { out.push(line); line = word; } else line = next;
  }
  out.push(line);
  // 한 글자 수식어(한·두·세·첫·그…)가 줄 끝에 남으면 다음 줄로 넘긴다("한 / 장을" → "/ 한 장을").
  for (let i = 0; i < out.length - 1; i += 1) {
    const parts = out[i].split(" ");
    const last = parts[parts.length - 1];
    if (parts.length > 1 && [...last].length === 1) { out[i] = parts.slice(0, -1).join(" "); out[i + 1] = `${last} ${out[i + 1]}`; }
  }
  return out.every((part) => widthOf(part) <= width) ? out.join("\n") : text;
}

/** 상자에 맞는 가장 큰 크기. 최소 크기에서도 넘치면 overflow=true(레이아웃을 바꿀 신호). */
export function fitText(text: string, role: TypeRole, box: { w: number; h: number }, scale: number, tracking = 0) {
  const spec = TYPE_SCALE[role];
  for (let size = Math.round(spec.max * scale); size >= Math.round(spec.min * scale); size -= 2) {
    const lines = estimateLines(text, size, box.w, tracking);
    if (lines * size * spec.lineHeight <= box.h) return { size, lines, overflow: false, minSize: Math.round(spec.min * scale), lineHeight: spec.lineHeight };
  }
  const size = Math.round(spec.min * scale);
  return { size, lines: estimateLines(text, size, box.w, tracking), overflow: true, minSize: size, lineHeight: spec.lineHeight };
}

/* ---------- 장면(scene) ---------- */
export type SceneElement =
  | { kind: "rect" | "ellipse"; name: string; x: number; y: number; w: number; h: number; fill: string; opacity?: number; radius?: number; rotation?: number; stroke?: string; strokeWidth?: number }
  | { kind: "gradient"; name: string; x: number; y: number; w: number; h: number; color: string; from: number; to: number }
  | { kind: "text"; name: string; role: TypeRole | "label"; x: number; y: number; w: number; h: number; text: string; font: FontSpec; size: number; minSize: number; lineHeight: number; tracking: number; color: string; align: "LEFT" | "CENTER" | "RIGHT"; valign: "TOP" | "CENTER" | "BOTTOM" }
  | { kind: "image"; name: string; x: number; y: number; w: number; h: number; assetId: string; status: string; radius?: number; fallback: string };
export const layoutIds = ["L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08"] as const;
export type LayoutId = (typeof layoutIds)[number];
export const layoutLabels: Record<LayoutId, string> = { L01: "HERO COVER", L02: "EDITORIAL STORY", L03: "FULL BLEED IMAGE", L04: "SPLIT", L05: "INFORMATION CARDS", L06: "LIST / CURATION", L07: "BIG STATEMENT", L08: "CLOSING / CTA" };
export type SceneFrame = { id: string; number: number; name: string; layout: LayoutId; width: number; height: number; background: string; elements: SceneElement[]; notes: string[] };
export type CardDesign = {
  version: typeof CARD_DESIGN_VERSION; style: DesignStyleId; styleLabel: string; styleReason: string; motif: Motif; controls: DesignControls;
  colors: ColorTokens; colorSources: ColorSource[]; fonts: { display: FontSpec; headline: FontSpec; body: FontSpec; label: FontSpec };
  canvas: { width: number; height: number }; frames: SceneFrame[]; notes: string[];
};

/** 목록으로 나눌 수 있는 내용: 보조 문구의 구분자(·, /, →, |) 또는 본문 문장 2~4개. */
export function splitItems(slide: Pick<ProductionSlide, "body" | "supporting_text">) {
  const parts = slide.supporting_text.split(/\s*(?:·|\/|→|\||,|\n)\s*/).map((item) => item.trim()).filter(Boolean);
  if (parts.length >= 2 && parts.length <= 4 && parts.every((item) => item.length <= 32)) return { items: parts, from: "supporting" as const };
  const sentences = slide.body.split(/(?<=[.!?。])\s+/).map((item) => item.trim()).filter(Boolean);
  if (sentences.length >= 2 && sentences.length <= 4 && sentences.every((item) => item.length <= 70)) return { items: sentences, from: "body" as const };
  return { items: [] as string[], from: "none" as const };
}

type Ctx = { W: number; H: number; s: number; m: number; gap: number; c: ColorTokens; f: CardDesign["fonts"]; style: StyleDef; motif: Motif; total: number; tracking: number; subject: string };
const shortLabel = (text: string, max = 18) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** 모티프 장식(편집 가능한 벡터 도형). 텍스트를 가리지 않게 가장자리에 둔다. */
function decorate(ctx: Ctx, onDark: boolean, seed: number, compact = false): SceneElement[] {
  const { W, H, m, c, s } = ctx;
  const ink = onDark ? c.accent : c.primary;
  switch (ctx.motif) {
    case "stripes": return [0, 1, 2].map((i) => ({ kind: "rect" as const, name: "deco · 사선 스트라이프", x: W - m * 2.6 + i * 46 * s, y: -40 * s, w: 22 * s, h: compact ? H * 0.14 : H * 0.42, fill: i === 1 ? c.accent : ink, opacity: i === 1 ? 1 : 0.35, rotation: -18 }));
    case "stickers": return [
      { kind: "rect", name: "deco · 스티커", x: W - m - 190 * s, y: m * 0.8, w: 190 * s, h: 74 * s, fill: c.accent, radius: 37 * s, rotation: 8 },
      { kind: "ellipse", name: "deco · 스티커 원", x: W - m - 70 * s, y: m * 0.8 + 96 * s, w: 64 * s, h: 64 * s, fill: c.secondary },
      { kind: "rect", name: "deco · 별 스티커", x: m * 0.6, y: H - m - 40 * s, w: 46 * s, h: 46 * s, fill: c.primary, radius: 8 * s, rotation: 45, opacity: 0.85 },
    ];
    case "pixels": return Array.from({ length: 7 }, (_, i) => ({ kind: "rect" as const, name: "deco · 픽셀 블록", x: W - m - (i % 4) * 26 * s - 26 * s, y: m * 0.7 + Math.floor(i / 4) * 26 * s + ((seed + i) % 3) * 26 * s, w: 22 * s, h: 22 * s, fill: i % 2 ? c.accent : (onDark ? c.secondary : c.primary) }));
    case "camera": {
      const k = 64 * s, t = 6 * s, inset = m * 0.55, color = onDark ? "#FFFFFF" : c.textPrimary;
      const corner = (x: number, y: number, dx: number, dy: number): SceneElement[] => [
        { kind: "rect", name: "deco · 뷰파인더 모서리", x: dx > 0 ? x : x - k, y: dy > 0 ? y : y - t, w: k, h: t, fill: color, opacity: 0.85 },
        { kind: "rect", name: "deco · 뷰파인더 모서리", x: dx > 0 ? x : x - t, y: dy > 0 ? y : y - k, w: t, h: k, fill: color, opacity: 0.85 },
      ];
      return [...corner(inset, inset, 1, 1), ...corner(W - inset, inset, -1, 1), ...corner(inset, H - inset, 1, -1), ...corner(W - inset, H - inset, -1, -1),
        { kind: "ellipse", name: "deco · REC", x: W - inset - 150 * s, y: inset + 28 * s, w: 20 * s, h: 20 * s, fill: "#FF3B30" }];
    }
    case "blobs": return [
      { kind: "ellipse", name: "deco · 둥근 도형", x: W - 260 * s, y: -90 * s, w: 360 * s, h: 360 * s, fill: c.secondary, opacity: 0.55 },
      { kind: "ellipse", name: "deco · 둥근 도형", x: -80 * s, y: H - 200 * s, w: 260 * s, h: 260 * s, fill: c.accent, opacity: 0.6 },
    ];
    default: return [
      { kind: "rect", name: "deco · 상단 선", x: m, y: m * 0.75, w: W - m * 2, h: 3 * s, fill: onDark ? "#FFFFFF" : c.textPrimary, opacity: 0.8 },
      { kind: "rect", name: "deco · 하단 선", x: m, y: H - m * 0.75, w: W - m * 2, h: 2 * s, fill: onDark ? "#FFFFFF" : c.textPrimary, opacity: 0.4 },
    ];
  }
}

const text = (ctx: Ctx, name: string, role: TypeRole | "label", content: string, box: { x: number; y: number; w: number; h: number }, opts: { font?: FontSpec; color: string; align?: "LEFT" | "CENTER" | "RIGHT"; valign?: "TOP" | "CENTER" | "BOTTOM"; size?: number }) => {
  const fit = role === "label" ? { size: opts.size ?? Math.round(24 * ctx.s), minSize: Math.round(20 * ctx.s), lineHeight: 1.3, overflow: false } : fitText(content, role, box, ctx.s, role === "display" || role === "section" ? ctx.tracking : 0);
  const font = opts.font ?? (role === "display" ? ctx.f.display : role === "section" ? ctx.f.headline : role === "label" || role === "cta" ? ctx.f.label : ctx.f.body);
  const finalText = role === "display" || role === "section" ? balanceBreaks(content, fit.size, box.w, ctx.tracking) : content;
  return { element: { kind: "text" as const, name, role, ...box, text: finalText, font, size: fit.size, minSize: fit.minSize, lineHeight: fit.lineHeight, tracking: role === "display" || role === "section" ? ctx.tracking : 0, color: opts.color, align: opts.align ?? "LEFT", valign: opts.valign ?? "TOP" }, overflow: fit.overflow };
};

type Built = { elements: SceneElement[]; background: string; overflow: boolean };
type SlideInput = { slide: ProductionSlide; index: number; image: { assetId: string; status: string } | null; reference: boolean };

function counter(ctx: Ctx, n: number, color: string): SceneElement {
  return text(ctx, "series · 페이지 번호", "label", `${String(n).padStart(2, "0")} / ${String(ctx.total).padStart(2, "0")}`, { x: ctx.W - ctx.m - 200 * ctx.s, y: ctx.H - ctx.m * 0.6 - 30 * ctx.s, w: 200 * ctx.s, h: 34 * ctx.s }, { color, align: "RIGHT" }).element;
}
function seriesMark(ctx: Ctx, color: string): SceneElement {
  return text(ctx, "series · 시리즈 표시", "label", shortLabel(ctx.subject, 22), { x: ctx.m, y: ctx.H - ctx.m * 0.6 - 30 * ctx.s, w: 520 * ctx.s, h: 34 * ctx.s }, { color }).element;
}
/** T7: AI 생성 이미지 위에 붙는 표시(미리보기·Figma 장면 공통). 이미지 영역 오른쪽 위, 반투명 바탕 + 흰 글자. */
export const AI_IMAGE_LABEL = "AI 생성 이미지";
const aiChip = (ctx: Ctx, image: { x: number; y: number; w: number }): SceneElement[] => {
  const w = 190 * ctx.s, h = 38 * ctx.s, x = image.x + image.w - w - 14 * ctx.s, y = image.y + 14 * ctx.s;
  return [
    { kind: "rect", name: "label-bg · AI 생성 표시", x, y, w, h, fill: "#14161F", opacity: 0.72, radius: 6 * ctx.s },
    text(ctx, "label · AI 생성 표시", "label", AI_IMAGE_LABEL, { x: x + 10 * ctx.s, y: y + 6 * ctx.s, w: w - 20 * ctx.s, h: h - 12 * ctx.s }, { color: "#FFFFFF", size: Math.round(20 * ctx.s) }).element,
  ];
};
const refChip = (ctx: Ctx, color: string): SceneElement => text(ctx, "참고 이미지 · 원본 링크(복제 안 함)", "label", "참고 이미지 · 원본 링크는 Editor Notes", { x: ctx.m, y: ctx.m * 0.55, w: 620 * ctx.s, h: 32 * ctx.s }, { color, size: Math.round(22 * ctx.s) }).element;

function buildLayout(layout: LayoutId, ctx: Ctx, input: SlideInput): Built {
  const { W, H, m, gap, c, s } = ctx;
  const { slide, index, image } = input;
  const headline = slide.headline.trim(), body = slide.body.trim(), support = slide.supporting_text.trim();
  const els: SceneElement[] = [];
  let overflow = false;
  const put = (built: { element: SceneElement; overflow: boolean }) => { els.push(built.element); overflow = overflow || built.overflow; };
  const n = index + 1;
  switch (layout) {
    case "L01": {
      const dark = ctx.style.coverDark || Boolean(image);
      const bg = dark ? c.primary : c.background;
      if (image) els.push({ kind: "image", name: "image · 표지 메인 비주얼", x: 0, y: 0, w: W, h: H, assetId: image.assetId, status: image.status, fallback: c.primary }, { kind: "gradient", name: "overlay · 가독성 그라데이션", x: 0, y: H * 0.35, w: W, h: H * 0.65, color: "#000000", from: 0, to: 0.78 });
      else els.push({ kind: "rect", name: "bg · 컬러 블록", x: 0, y: H * 0.64, w: W, h: H * 0.36, fill: dark ? c.secondary : c.accent, opacity: dark ? 0.55 : 0.9 });
      els.push(...decorate(ctx, dark, n));
      const ink = dark ? "#FFFFFF" : c.textPrimary;
      put(text(ctx, "kicker · 표지 라벨", "label", shortLabel(ctx.subject, 26).toUpperCase(), { x: m, y: m, w: W * 0.6, h: 40 * s }, { color: dark ? c.accent : c.primary, size: Math.round(28 * s) }));
      put(text(ctx, "headline · 표지 제목", "display", headline, { x: m, y: H * 0.18, w: W - m * 2, h: H * 0.42 }, { color: ink, valign: "BOTTOM" }));
      if (body) put(text(ctx, "body · 표지 부제", "body", body, { x: m, y: H * 0.68, w: W - m * 2, h: H * 0.2 }, { color: image ? "#EDEDED" : readableOn(dark ? mix(c.primary, c.secondary, 0.55) : c.accent) }));
      els.push(counter(ctx, n, dark ? "#FFFFFF" : c.textSecondary));
      return { elements: els, background: bg, overflow };
    }
    case "L03": {
      els.push({ kind: "image", name: "image · 풀블리드", x: 0, y: 0, w: W, h: H, assetId: image!.assetId, status: image!.status, fallback: c.primary }, { kind: "gradient", name: "overlay · 하단 그라데이션", x: 0, y: H * 0.45, w: W, h: H * 0.55, color: "#000000", from: 0, to: 0.82 });
      put(text(ctx, "headline · 이미지 위 제목", "section", headline, { x: m, y: H * 0.56, w: W - m * 2, h: H * 0.2 }, { color: "#FFFFFF", valign: "BOTTOM" }));
      if (body) put(text(ctx, "body · 이미지 위 본문", "body", body, { x: m, y: H * 0.78, w: W - m * 2, h: H * 0.22 - m * 1.3 }, { color: "#F2F2F2" }));
      els.push(counter(ctx, n, "#FFFFFF"));
      return { elements: els, background: c.primary, overflow };
    }
    case "L04": {
      const top = H * 0.5;
      if (image) els.push({ kind: "image", name: "image · 상단 분할", x: 0, y: 0, w: W, h: top, assetId: image.assetId, status: image.status, fallback: c.secondary });
      else {
        els.push({ kind: "rect", name: "bg · 상단 컬러 블록", x: 0, y: 0, w: W, h: top, fill: c.primary });
        els.push(...decorate(ctx, true, n, true).slice(0, 3));
        const key = support && support.length <= 24 ? support : shortLabel(slide.specific_detail || headline, 24);
        put(text(ctx, "keyword · 상단 키워드", "section", key, { x: m, y: m * 1.4, w: W - m * 2, h: top - m * 2.2 }, { color: "#FFFFFF", valign: "BOTTOM" }));
      }
      put(text(ctx, "headline · 섹션 제목", "section", headline, { x: m, y: top + m * 0.7, w: W - m * 2, h: H * 0.17 }, { color: c.textPrimary }));
      if (body) put(text(ctx, "body · 본문", "body", body, { x: m, y: top + m * 0.7 + H * 0.17 + gap * s, w: W - m * 2, h: H - (top + m * 0.7 + H * 0.17 + gap * s) - m * 1.3 }, { color: c.textSecondary }));
      els.push(counter(ctx, n, c.textSecondary));
      return { elements: els, background: c.background, overflow };
    }
    case "L05": {
      // 정보 카드: 제목 + 본문(지우지 않음) + 보조 문구의 핵심 항목을 내용 크기에 맞춘 칩 카드로.
      const { items } = splitItems({ body: "", supporting_text: support });
      const tinted = mix(c.secondary, c.background, 0.55);
      put(text(ctx, "headline · 섹션 제목", "section", headline, { x: m, y: m * 1.1, w: W - m * 2, h: H * 0.2 }, { color: c.textPrimary, valign: "BOTTOM" }));
      const bodyTop = m * 1.1 + H * 0.2 + gap * s;
      if (body) put(text(ctx, "body · 본문", "body", body, { x: m, y: bodyTop, w: W - m * 2, h: H * 0.27 }, { color: c.textSecondary }));
      const cols = items.length === 4 ? 2 : items.length, cardGap = 20 * s;
      const cardW = (W - m * 2 - cardGap * (cols - 1)) / cols, cardH = 210 * s, rows = Math.ceil(items.length / cols);
      const gridTop = H - m * 1.35 - rows * cardH - (rows - 1) * cardGap;
      items.forEach((item, i) => {
        const x = m + (i % cols) * (cardW + cardGap), y = gridTop + Math.floor(i / cols) * (cardH + cardGap);
        els.push({ kind: "rect", name: `card · 정보 카드 ${i + 1}`, x, y, w: cardW, h: cardH, fill: i % 2 ? c.surface : tinted, radius: Math.max(ctx.style.radius, 12) * s, stroke: mix(c.textPrimary, c.surface, 0.82), strokeWidth: 2 * s });
        const cardInk = readableOn(i % 2 ? c.surface : tinted);
        put(text(ctx, `card · 번호 ${i + 1}`, "label", String(i + 1).padStart(2, "0"), { x: x + 28 * s, y: y + 24 * s, w: 120 * s, h: 44 * s }, { color: contrast(c.primary, i % 2 ? c.surface : tinted) >= 3 ? c.primary : cardInk, size: Math.round(34 * s), font: ctx.f.display }));
        put(text(ctx, `card · 내용 ${i + 1}`, "section", item, { x: x + 28 * s, y: y + 78 * s, w: cardW - 56 * s, h: cardH - 100 * s }, { color: cardInk, valign: "TOP", font: ctx.f.headline }));
      });
      return { elements: [{ kind: "rect", name: "bg · 상단 띠", x: 0, y: 0, w: W, h: 18 * s, fill: c.accent }, ...els, counter(ctx, n, c.textSecondary)], background: c.background, overflow };
    }
    case "L06": {
      // 목록: 본문 문장을 번호 항목으로. 항목 높이는 예상 줄 수에 비례(빈 상자를 늘리지 않는다).
      const { items } = splitItems({ body, supporting_text: "" });
      put(text(ctx, "headline · 섹션 제목", "section", headline, { x: m, y: m * 1.1, w: W - m * 2, h: H * 0.2 }, { color: c.textPrimary, valign: "BOTTOM" }));
      els.push({ kind: "rect", name: "deco · 제목 아래 선", x: m, y: m * 1.1 + H * 0.2 + 18 * s, w: W - m * 2, h: 4 * s, fill: c.textPrimary });
      const top = m * 1.1 + H * 0.2 + 60 * s, bottom = H - m * 1.5 - (support ? 70 * s : 0);
      const textW = W - m * 2 - 170 * s, rowGap = 26 * s;
      const weights = items.map((item) => Math.max(1, estimateLines(item, TYPE_SCALE.body.max * s, textW)));
      const unit = (bottom - top - rowGap * (items.length - 1)) / weights.reduce((sum, value) => sum + value, 0);
      let y = top;
      items.forEach((item, i) => {
        const rowH = Math.min(unit * weights[i], weights[i] * TYPE_SCALE.body.max * s * TYPE_SCALE.body.lineHeight * 1.6);
        put(text(ctx, `list · 번호 ${i + 1}`, "section", String(i + 1).padStart(2, "0"), { x: m, y, w: 150 * s, h: 96 * s }, { color: c.accent === c.background ? c.primary : c.accent, font: ctx.f.display }));
        put(text(ctx, `list · 항목 ${i + 1}`, "body", item, { x: m + 170 * s, y: y + 6 * s, w: textW, h: Math.max(rowH, 70 * s) }, { color: c.textPrimary }));
        y += Math.max(rowH, 96 * s) + rowGap;
        if (i < items.length - 1) els.push({ kind: "rect", name: `list · 구분선 ${i + 1}`, x: m + 170 * s, y: y - rowGap / 2, w: textW, h: 2 * s, fill: c.textPrimary, opacity: 0.15 });
      });
      if (support) put(text(ctx, "supporting · 보조 문구", "supporting", support, { x: m, y: H - m * 1.5 - 50 * s, w: W - m * 2, h: 60 * s }, { color: c.primary }));
      els.push(...decorate(ctx, false, n, true).filter((item) => item.kind !== "text").slice(0, 2), counter(ctx, n, c.textSecondary));
      return { elements: els, background: c.surface, overflow };
    }
    case "L07": {
      const bg = n % 2 ? c.accent : c.primary;
      const ink = readableOn(bg);
      els.push(...decorate(ctx, luminance(bg) < 0.4, n, true));
      put(text(ctx, "quote · 큰 따옴표", "label", "“", { x: m - 8 * s, y: m * 0.9, w: 200 * s, h: 200 * s }, { color: ink, size: Math.round(200 * s), font: { family: "Noto Serif KR", style: "Black" } }));
      put(text(ctx, "statement · 큰 문장", "display", headline, { x: m, y: H * 0.2, w: W - m * 2, h: H * 0.46 }, { color: ink, valign: "CENTER" }));
      if (body) put(text(ctx, "body · 덧붙임", "body", body, { x: m, y: H * 0.69, w: W - m * 2, h: H * 0.2 }, { color: ink }));
      els.push(counter(ctx, n, ink));
      return { elements: els, background: bg, overflow };
    }
    case "L08": {
      const bg = c.primary, ink = readableOn(bg);
      els.push(...decorate(ctx, luminance(bg) < 0.4, n));
      put(text(ctx, "headline · 마무리 제목", "section", headline, { x: m, y: H * 0.16, w: W - m * 2, h: H * 0.28 }, { color: ink, valign: "BOTTOM" }));
      if (body) put(text(ctx, "body · 마무리 본문", "body", body, { x: m, y: H * 0.47, w: W - m * 2, h: H * 0.2 }, { color: ink }));
      const cta = (slide.cta || support || "저장해두고 다시 보기").trim();
      const btnY = H * 0.71, btnH = 112 * s;
      els.push({ kind: "rect", name: "cta · 버튼", x: m, y: btnY, w: W - m * 2, h: btnH, fill: c.accent, radius: btnH / 2 });
      put(text(ctx, "cta · 버튼 문구", "cta", cta, { x: m + 40 * s, y: btnY + 14 * s, w: W - m * 2 - 80 * s, h: btnH - 28 * s }, { color: readableOn(c.accent), align: "CENTER", valign: "CENTER" }));
      ["저장", "공유", "댓글"].forEach((label, i) => {
        const x = m + i * 200 * s, y = H * 0.84;
        els.push({ kind: "ellipse", name: `cta · ${label} 아이콘`, x, y, w: 44 * s, h: 44 * s, fill: "#FFFFFF", opacity: 0.18, stroke: ink, strokeWidth: 3 * s });
        put(text(ctx, `cta · ${label}`, "label", label, { x: x + 56 * s, y: y + 4 * s, w: 120 * s, h: 40 * s }, { color: ink, size: Math.round(28 * s) }));
      });
      els.push(seriesMark(ctx, ink));
      return { elements: els, background: bg, overflow };
    }
    default: { // L02 EDITORIAL STORY
      const bg = n % 2 ? c.background : c.surface;
      if (image) {
        els.push({ kind: "image", name: "image · 매거진 이미지", x: m, y: m, w: W - m * 2, h: H * 0.42, assetId: image.assetId, status: image.status, radius: ctx.style.radius * s, fallback: c.secondary });
        put(text(ctx, "headline · 섹션 제목", "section", headline, { x: m, y: m + H * 0.42 + gap * s, w: W - m * 2, h: H * 0.16 }, { color: c.textPrimary }));
        if (body) put(text(ctx, "body · 본문", "body", body, { x: m, y: m + H * 0.58 + gap * s * 1.5, w: W - m * 2, h: H - (m + H * 0.58 + gap * s * 1.5) - m * 1.3 }, { color: c.textSecondary }));
      } else {
        put(text(ctx, "number · 큰 번호", "display", String(n).padStart(2, "0"), { x: m, y: m * 0.9, w: 320 * s, h: 190 * s }, { color: c.accent, font: ctx.f.display }));
        els.push({ kind: "rect", name: "deco · 번호 아래 선", x: m, y: m * 0.9 + 200 * s, w: 120 * s, h: 8 * s, fill: c.primary });
        put(text(ctx, "headline · 섹션 제목", "section", headline, { x: m, y: H * 0.28, w: W - m * 2, h: H * 0.24 }, { color: c.textPrimary, valign: "BOTTOM" }));
        if (body) put(text(ctx, "body · 본문", "body", body, { x: m, y: H * 0.55, w: W - m * 2, h: H * 0.27 }, { color: c.textSecondary }));
        if (support) put(text(ctx, "supporting · 보조 문구", "supporting", support, { x: m, y: H * 0.84, w: W - m * 2, h: H * 0.06 }, { color: c.primary }));
        els.push(...decorate(ctx, false, n, true).filter((item) => item.kind !== "text").slice(0, 2));
      }
      els.push(counter(ctx, n, c.textSecondary));
      return { elements: els, background: bg, overflow };
    }
  }
}

/**
 * D1 대비 보정: 각 텍스트 바로 아래의 칠(카드·컬러 블록·프레임 배경)을 찾아 큰 글자(48px 이상)는 3, 작은 글자는 4.5 이상이 되게 색을 민다.
 * 이미지·그라데이션 오버레이 위 글자는 오버레이가 대비를 맡으므로 건드리지 않는다.
 */
/** 텍스트 요소 바로 아래의 칠. 이미지·그라데이션 위면 null(오버레이가 대비를 맡는다). */
export function colorUnder(elements: SceneElement[], index: number, frameBackground: string): string | null {
  const element = elements[index];
  const cx = element.x + element.w / 2, cy = element.y + element.h / 2;
  let under: string | null = frameBackground;
  for (const other of elements.slice(0, index)) {
    if (other.kind === "text" || cx < other.x || cx > other.x + other.w || cy < other.y || cy > other.y + other.h) continue;
    if (other.kind === "image" || other.kind === "gradient") under = null;
    else if ((other.opacity ?? 1) >= 0.85 && !other.rotation) under = other.fill;
  }
  return under;
}
export function ensureContrast(elements: SceneElement[], frameBackground: string): SceneElement[] {
  return elements.map((element, index) => {
    if (element.kind !== "text") return element;
    const under = colorUnder(elements, index, frameBackground);
    if (!under) return element;
    const need = element.size >= 48 ? 3 : 4.5;
    if (contrast(element.color, under) >= need) return element;
    const target = readableOn(under);
    let color = element.color;
    for (let i = 1; i <= 10 && contrast(color, under) < need; i += 1) color = mix(element.color, target, i / 10);
    return { ...element, color };
  });
}

/** 레이아웃 선택용 내용 신호. */
export function contentShape(slide: Pick<ProductionSlide, "headline" | "body" | "supporting_text" | "type">) {
  const labels = splitItems({ body: "", supporting_text: slide.supporting_text }).items;
  const sentences = splitItems({ body: slide.body, supporting_text: "" }).items;
  return { labels: labels.length, sentences: sentences.length, short: slide.headline.length <= 24 && slide.body.length <= 70 };
}

/**
 * D2 레이아웃 선택: 역할·내용 모양·이미지로 후보를 정하고, 이 시리즈에서 덜 쓴 레이아웃을 앞에 둔다(같은 레이아웃 연속 금지).
 * 넘치면 다음 후보로 바꾼다(buildCardDesign). 문구를 지워서 맞추지 않는다.
 */
export function pickLayout(input: SlideInput, total: number, previous: LayoutId | null, emphasis: DesignControls["imageEmphasis"], used: Partial<Record<LayoutId, number>> = {}): LayoutId[] {
  const { slide, index, image } = input;
  if (index === 0) return image && emphasis === "high" ? ["L03", "L01"] : ["L01"];
  if (index === total - 1 || slide.type === "cta" || slide.type === "closing") return ["L08"];
  const shape = contentShape(slide);
  const fit: LayoutId[] = [];
  if (image && emphasis !== "low") fit.push(emphasis === "high" || slide.type === "example" ? "L03" : "L04", "L04", "L02");
  if (shape.sentences >= 3 && ["list", "tip", "detail", "example", "body"].includes(slide.type)) fit.push("L06");
  if (shape.labels >= 2) fit.push("L05");
  if (slide.type === "highlight" || shape.short) fit.push("L07");
  if (["story", "intro", "body", "detail"].includes(slide.type)) fit.push("L04");
  fit.push("L02", "L04", "L07");
  if (shape.sentences >= 2) fit.push("L06");
  const unique = [...new Set(fit)].filter((id) => (id !== "L03" || image) && (id !== "L05" || shape.labels >= 2) && (id !== "L06" || shape.sentences >= 2));
  // 내용에 맞는 순서를 지키되, 이미 두 번 쓴 레이아웃과 직전 레이아웃은 뒤로.
  // 이미지가 있는 슬라이드는 이미지를 쓰는 레이아웃(L03·L04·L02)을 다양성보다 앞에 둔다.
  const imageFirst = (id: LayoutId) => (image && emphasis !== "low" && ["L03", "L04", "L02"].includes(id) ? -4 : 0);
  const rank = (id: LayoutId) => imageFirst(id) + (id === previous ? 2 : 0) + ((used[id] ?? 0) >= 2 ? 1 : 0);
  return [...unique].sort((a, b) => rank(a) - rank(b) || unique.indexOf(a) - unique.indexOf(b));
}

export type DesignInput = { project: Pick<StudioProject, "title" | "settings" | "angle" | "customTopic" | "source" | "assets" | "concept">; plan: ProductionPlan; controls?: Partial<DesignControls>; visualDna?: VisualDnaRecord | null; imageAvailable?: (assetId: string) => boolean };

/** 프로젝트 → 카드뉴스 디자인(토큰 + 프레임별 장면). 같은 입력이면 같은 결과(결정적). */
export function buildCardDesign(input: DesignInput): CardDesign {
  const controls: DesignControls = { ...defaultDesignControls, ...input.controls };
  const { project, plan } = input;
  const canvas = project.settings.aspect === "1:1" ? { width: 1080, height: 1080 } : project.settings.aspect === "9:16" ? { width: 1080, height: 1920 } : { width: 1080, height: 1350 };
  const subject = project.source.trendNames.join(" × ") || project.title;
  const dnaFeatures = input.visualDna?.result.dimensions.flatMap((dimension) => dimension.features.map((feature) => feature.label)) ?? [];
  const choice = chooseStyle({ subject, angle: `${project.angle?.title ?? ""} ${project.angle?.editorial_perspective ?? ""} ${project.customTopic ?? ""} ${project.concept?.title ?? ""}`, tone: project.settings.tone, dnaText: dnaFeatures.join(" ") });
  const styleId = controls.style === "auto" ? choice.style : controls.style;
  const style = STYLES[styleId];
  const motif = controls.style === "auto" ? choice.motif : style.motif;
  const observed = controls.palette === "auto" ? input.visualDna?.result.palette.map((item) => item.hex) ?? [] : [];
  const { colors, sources } = paletteFrom(style, controls.palette, observed);
  const mood = controls.typeMood === "auto" ? null : MOOD_FONTS[controls.typeMood];
  const fonts = { display: mood?.display ?? style.fonts.display, headline: mood?.headline ?? style.fonts.headline, body: mood?.body ?? style.fonts.body, label: style.fonts.label };
  const W = canvas.width, H = canvas.height, s = W / 1080;
  const ctx: Ctx = { W, H, s, m: Math.round(W * DENSITY[controls.density].margin), gap: DENSITY[controls.density].gap, c: colors, f: fonts, style, motif, total: plan.slides.length, tracking: style.tracking, subject };
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const usable = (assetId: string) => { const asset = assetById.get(assetId); return Boolean(asset && asset.status !== "REAL REFERENCE" && (input.imageAvailable ? input.imageAvailable(assetId) : true)); };
  // 이미지는 반드시 해당 슬라이드가 명시적으로 참조한 assetId만 쓴다.
  // 재생성 뒤 남은 이전 자산을 표지 등에 자동 배치하면 다른 슬라이드가 바뀌는 것처럼 보이므로 fallback을 두지 않는다.
  const emphasis = controls.imageEmphasis === "auto" ? (styleId === "contemporary-magazine" ? "high" : "medium") : controls.imageEmphasis;
  const notes: string[] = [];
  let previous: LayoutId | null = null;
  const used: Partial<Record<LayoutId, number>> = {};
  const frames = plan.slides.map((slide, index): SceneFrame => {
    const imageId = resolvedSlideImageAssetId(slide, project.assets);
    const ref = imageId ? assetById.get(imageId) : undefined;
    const image = ref && usable(ref.id) ? { assetId: ref.id, status: ref.status } : null;
    const reference = Boolean(ref && ref.status === "REAL REFERENCE");
    const slideInput = { slide, index, image, reference };
    const frameNotes: string[] = [];
    let chosen: { layout: LayoutId; built: Built } | null = null;
    for (const layout of pickLayout(slideInput, plan.slides.length, previous, emphasis, used)) {
      const built = buildLayout(layout, ctx, slideInput);
      if (!built.overflow) { chosen = { layout, built }; break; }
      frameNotes.push(`${layoutLabels[layout]}에서 문구가 넘쳐 다른 레이아웃을 시도`);
      if (!chosen) chosen = { layout, built };
    }
    const final = chosen!;
    const layer = (element: SceneElement) => element.name.startsWith("bg") ? 0 : element.kind === "image" ? 1 : element.name.startsWith("overlay") ? 2 : element.name.startsWith("deco") ? 3 : 4;
    final.built.elements = final.built.elements.map((element, order) => ({ element, order })).sort((a, b) => layer(a.element) - layer(b.element) || a.order - b.order).map((entry) => entry.element);
    // 그리는 순서를 정한 뒤 대비를 보정한다(글자 바로 아래 칠을 찾기 위해).
    final.built.elements = ensureContrast(final.built.elements, final.built.background);
    if (final.built.overflow) frameNotes.push("최소 글자 크기에서도 문구가 길어요 — 문구를 줄이거나 슬라이드를 나누는 것을 권장(문구는 지우지 않음)");
    if (reference) { final.built.elements.push(refChip(ctx, final.built.background === colors.background || final.built.background === colors.surface ? colors.textSecondary : "#FFFFFF")); frameNotes.push("실제 근거 이미지는 권리 정책상 복제하지 않고 링크로만 표시"); }
    // T7: AI 생성 이미지는 실제 사례가 아님을 카드 위에 표시한다.
    const aiImage = final.built.elements.find((element): element is Extract<SceneElement, { kind: "image" }> => element.kind === "image" && element.status !== "REAL REFERENCE");
    if (aiImage) { final.built.elements.push(...aiChip(ctx, aiImage)); frameNotes.push("AI 생성 이미지 — 실제 사례·인물 사진이 아님(카드에 표시)"); }
    previous = final.layout;
    used[final.layout] = (used[final.layout] ?? 0) + 1;
    const number = index + 1;
    return { id: slide.slide_id, number, name: `${String(number).padStart(2, "0")} · ${layoutLabels[final.layout]}`, layout: final.layout, width: W, height: H, background: final.built.background, elements: final.built.elements, notes: frameNotes };
  });
  if (!project.assets.some((asset) => asset.status !== "REAL REFERENCE")) notes.push("AI 이미지가 없어 색·타이포·도형 중심으로 디자인했어요. 이미지는 Studio에서 직접 생성할 때만 만들어집니다(자동 생성 안 함).");
  if (observed.length) notes.push("Visual DNA 팔레트는 실제 썸네일에서 관찰한 색이고, 어떤 색을 강조·배경에 쓸지는 규칙으로 정한 해석입니다.");
  return { version: CARD_DESIGN_VERSION, style: styleId, styleLabel: style.label, styleReason: controls.style === "auto" ? choice.reason : "사용자 선택", motif, controls, colors, colorSources: sources, fonts, canvas, frames, notes };
}
