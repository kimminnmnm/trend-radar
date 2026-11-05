import { z } from "zod";
import { phenomenonAnchorTerms } from "./discovery";
import type { EvidenceItem, PhenomenonContext, TrendAnalysis } from "./schemas";

/*
 * T6 EDITORIAL CONTEXT LOCK. Content Studio에 들어온 구체적인 현상이 일반 콘텐츠(키워드 역사·입문 가이드·구매 방법 등)로
 * 바뀌지 않게 프로젝트마다 잠근다. 방향 제안·제작 프롬프트·품질 게이트·편집 리뷰가 모두 같은 잠금을 쓴다.
 * 근거가 부족하면 주제를 바꾸지 않고 부족하다고 알리며 추가 조사나 사용자 자료를 요청한다.
 */
export const driftRuleIds = ["history", "beginner", "purchase", "generic", "opposite"] as const;
export const driftItemSchema = z.object({ id: z.string().trim().min(1).max(40), label: z.string().trim().min(1).max(120) });
export type DriftItem = z.infer<typeof driftItemSchema>;

export const editorialContextLockSchema = z.object({
  enabled: z.boolean().default(true),
  selectedPhenomenonId: z.string().trim().min(1).max(120),
  selectedPhenomenon: z.string().trim().min(1).max(80),
  parentKeyword: z.string().trim().min(1).max(60),
  subject: z.string().max(120).default(""),
  object: z.string().max(120).default(""),
  direction: z.string().max(60).default(""),
  coreBehavior: z.string().max(300).default(""),
  culturalContext: z.string().max(400).default(""),
  editorialFocus: z.string().max(300).default(""),
  /** 이 현상을 실제로 보여 주는 근거 ID(잠금을 만든 WHY 스냅샷 원장의 ID). 제작 때 T1: 접두어를 붙여 원장과 맞춘다. */
  observedEvidenceIds: z.array(z.string().max(40)).max(16).default([]),
  /** 사용자가 적는 창작 가설(선택). 사실로 쓰지 않고 가설로만 표시한다. */
  creativeHypothesis: z.string().max(300).default(""),
  prohibitedTopicDrift: z.array(driftItemSchema).max(10).default([]),
  /** 사용자가 직접 제공한 자료(메모·링크). 검증되지 않은 자료로 다룬다. */
  userMaterials: z.string().max(1500).default(""),
  evidenceStatus: z.enum(["OBSERVED", "EMERGING", "INSUFFICIENT EVIDENCE"]).default("EMERGING"),
  /** V3(E1) 경량 잠금: 현상 선택 없이 들어온 프로젝트에서 사용자가 고른 방향의 초점으로 만든 잠금(서버에서만, 저장하지 않음). */
  soft: z.boolean().optional(),
});
export type EditorialContextLock = z.infer<typeof editorialContextLockSchema>;

const VIRTUAL_TO_REAL = /virtual\s*→\s*real|가상\s*→\s*현실/i;
const INSIDE = /안에서|in-game|inside/i;
const esc = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 현상 맥락에서 기본 금지 이탈 목록을 만든다(사용자가 고치거나 더할 수 있음). */
export function defaultDrift(context: Pick<PhenomenonContext, "keyword" | "object" | "direction">): DriftItem[] {
  const items: DriftItem[] = [
    { id: "history", label: `${context.keyword}의 역사·기원 설명` },
    { id: "beginner", label: `${context.keyword} 입문·초보자 가이드·준비물 안내` },
    { id: "purchase", label: "아이템·상품 구매 방법이나 가격 안내" },
    { id: "generic", label: `현상과 무관한 일반적인 ${context.object || context.keyword} 방법 설명` },
  ];
  if (VIRTUAL_TO_REAL.test(context.direction)) items.push({ id: "opposite", label: "게임·가상 공간 안에서 아이템·기능을 쓰는 방법(반대 방향)" });
  else if (INSIDE.test(context.direction)) items.push({ id: "opposite", label: "현실에서 따라 하거나 재현하는 이야기(다른 방향)" });
  return items;
}

/** 금지 이탈 규칙 → 결정적 검사식. 사용자 항목은 핵심어 2개 이상(1개뿐이면 그 단어)이 함께 나오면 이탈로 본다. */
function driftMatcher(item: DriftItem, lock: Pick<EditorialContextLock, "parentKeyword" | "direction" | "object">): (text: string) => boolean {
  const keyword = esc(lock.parentKeyword);
  switch (item.id) {
    case "history": return (text) => /역사|기원|유래|탄생 배경|시초|처음 생겨난/.test(text);
    case "beginner": return (text) => /초보(자)?\s*가이드|입문\s*가이드|처음 시작하는 법|가입(하는)?\s*방법|설치(하는)?\s*방법|기초부터|입장\s*방법|예매\s*방법|(티켓|표|좌석).{0,8}예매/.test(text) || new RegExp(`(${keyword}|경기장|야구장|공연장|현장|매장).{0,10}준비물`).test(text);
    case "purchase": return (text) => /구매(하는)?\s*(방법|법|팁)|사는\s*(방법|법)|결제\s*방법|로벅스|가격\s*(정보|비교|안내)|최저가/.test(text);
    case "generic": return (text) => new RegExp(`(${keyword}|${esc(lock.object || lock.parentKeyword)})\\s*(기초|기본)\\s*(방법|순서|법|단계)|일반적인\\s*(${keyword})`).test(text);
    case "opposite": return VIRTUAL_TO_REAL.test(lock.direction)
      ? (text) => /(게임|앱|가상|아바타)\s*(안|속)에서\s*\S*\s*(아이템|도구|기능|옵션)\S*\s*(고르|쓰|사용|구매|얻|장착)/.test(text)
      : (text) => /현실에서\s*(따라|재현)|실제\s*얼굴에\s*(따라|재현)/.test(text);
    default: {
      const tokens = item.label.split(/[\s·,/()]+/).map((word) => word.replace(/(을|를|이|가|은|는|의|에|로|와|과|도)$/, "")).filter((word) => word.length >= 2);
      return (text) => tokens.length > 0 && tokens.filter((token) => text.includes(token)).length >= Math.min(2, tokens.length);
    }
  }
}
export function driftHits(text: string, lock: EditorialContextLock) {
  return lock.prohibitedTopicDrift.filter((item) => driftMatcher(item, lock)(text)).map((item) => item.label);
}
export const lockAnchorTerms = (lock: EditorialContextLock) => phenomenonAnchorTerms({ title: lock.selectedPhenomenon, object: lock.object, subject: lock.subject });
export const lockAnchored = (text: string, lock: EditorialContextLock) => { const terms = lockAnchorTerms(lock); return terms.length === 0 || terms.some((term) => text.includes(term)); };
/** 근거 충분도: 현상을 직접 보여 주는 근거 2건 미만이면 제한적 → 주제는 그대로, 추가 조사·사용자 자료 요청. */
export const lockEvidenceLimited = (lock: Pick<EditorialContextLock, "observedEvidenceIds" | "userMaterials">) => lock.observedEvidenceIds.length < 2;

/**
 * 현상 맥락(+ 그 현상의 WHY 분석이 있으면 그 결과)으로 잠금을 만든다.
 * observedEvidenceIds: 현상 WHY라면 재사용 근거 + WHAT·WHO·HOW·대표 요약이 인용한 근거(NAVER 제외). 상위 키워드 WHY만 있으면 비워 둔다(그 근거는 현상 자체를 보여 주지 않음).
 */
export function buildContextLock(context: PhenomenonContext, why?: { report?: TrendAnalysis; evidence?: EvidenceItem[] } | null): EditorialContextLock {
  const lens = why?.report?.phenomenon?.context.phenomenonId === context.phenomenonId ? why.report.phenomenon : undefined;
  const ledger = new Set((why?.evidence ?? []).filter((item) => item.kind !== "naver_series").map((item) => item.id));
  const observed = lens ? [...new Set([...lens.reusedEvidenceIds, ...(why?.report?.what?.evidenceIds ?? []), ...(why?.report?.overview?.evidenceIds ?? []), ...lens.who.evidenceIds, ...lens.how.evidenceIds])].filter((id) => ledger.has(id)) : [];
  const behavior = context.action || context.coreBehavior;
  return {
    enabled: true, selectedPhenomenonId: context.phenomenonId, selectedPhenomenon: context.title, parentKeyword: context.keyword,
    subject: context.subject, object: context.object, direction: context.direction, coreBehavior: behavior,
    culturalContext: (lens && why?.report?.context?.background.evidenceIds.length ? why.report.context.background.summary : context.culturalContext).slice(0, 400),
    editorialFocus: `"${context.title}" 자체 — ${behavior || "이 현상의 실제 행동"}`.slice(0, 300),
    observedEvidenceIds: observed.slice(0, 16), creativeHypothesis: "", prohibitedTopicDrift: defaultDrift(context), userMaterials: "", evidenceStatus: context.verificationStatus,
  };
}

/**
 * V3(E1) 경량 잠금: 키워드·Collision·Lab 경로처럼 현상을 고르지 않고 들어온 프로젝트에서, 사용자가 고른 방향의 초점(focus)으로 잠금을 만든다.
 * 고른 방향의 유형이 직접 다루는 주제(역사 방향의 역사, 입문 방향의 입문, 큐레이션의 구매)는 금지하지 않는다. 근거 상태는 방향의 evidence_fit을 따른다.
 */
export function lockFromAngle(angle: { angle_id: string; title: string; focus?: string; angle_type?: string; evidence_ids: string[]; evidence_fit: "grounded" | "partial" | "needs_research" }, keyword: string): EditorialContextLock | undefined {
  const focus = angle.focus?.trim();
  if (!focus) return undefined;
  const allowed = new Set(angle.angle_type === "history" ? ["history"] : angle.angle_type === "guide" || angle.angle_type === "howto" ? ["beginner"] : angle.angle_type === "curation" ? ["purchase"] : []);
  return {
    enabled: true, soft: true, selectedPhenomenonId: `angle:${angle.angle_id}`.slice(0, 120), selectedPhenomenon: focus.slice(0, 80), parentKeyword: keyword.slice(0, 60),
    subject: "", object: "", direction: "", coreBehavior: focus.slice(0, 300), culturalContext: "", editorialFocus: `"${angle.title}" — ${focus}`.slice(0, 300),
    observedEvidenceIds: angle.evidence_ids.filter((id) => id.startsWith("T1:")).map((id) => id.slice(3)).slice(0, 16), creativeHypothesis: "",
    prohibitedTopicDrift: defaultDrift({ keyword, object: "", direction: "" }).filter((item) => !allowed.has(item.id)), userMaterials: "",
    evidenceStatus: angle.evidence_fit === "grounded" ? "OBSERVED" : angle.evidence_fit === "partial" ? "EMERGING" : "INSUFFICIENT EVIDENCE",
  };
}

/** 제작·방향 제안 프롬프트에 넣는 잠금 지시. */
export function lockInstructions(lock: EditorialContextLock, stage: "angles" | "production") {
  const limited = lockEvidenceLimited(lock);
  return [
    lock.soft
      ? `ANGLE FOCUS LOCK (from the angle the user picked): the piece is about ONE specific thing inside "${lock.parentKeyword}": "${lock.selectedPhenomenon}". Do not widen it into an introduction of ${lock.parentKeyword} in general.`
      : `CONTEXT LOCK (highest priority — above the angle, the research and the parent keyword): the piece is about ONE selected phenomenon: "${lock.selectedPhenomenon}" (parent keyword: ${lock.parentKeyword}). Core behavior: ${lock.coreBehavior || "(see phenomenon)"}.${lock.direction ? ` Direction: ${lock.direction}.` : ""}${lock.culturalContext ? ` Cultural context: ${lock.culturalContext}` : ""}`,
    `EDITORIAL FOCUS: ${lock.editorialFocus || lock.selectedPhenomenon}.`,
    stage === "angles"
      ? "Every angle must be a different way to tell THIS phenomenon (e.g. comparisons inside it, how people actually do it, the creators and their content, how the cultures connect, what readers can try or watch). An angle about the parent keyword in general is not allowed. Use angle_type freely but never history of the parent keyword or a beginner guide to it."
      : "Every slide/scene must stay on this phenomenon — its behavior, how people do it, the creators, the culture it connects. The cover and title must name the phenomenon's behavior, not just the parent keyword. image_prompt must depict the subject doing the core action with the object (the behavior itself), never a generic picture of the parent keyword or a character standing in front of an interface.",
    `PROHIBITED TOPIC DRIFT — never ${stage === "angles" ? "propose angles" : "write slides"} about: ${lock.prohibitedTopicDrift.map((item) => item.label).join(" / ") || "(none listed)"}.`,
    lock.creativeHypothesis ? `CREATIVE HYPOTHESIS from the user: "${lock.creativeHypothesis}". It is a hypothesis — present it as an idea or question, never as a fact.` : "",
    lock.userMaterials ? "USER_MATERIALS are notes the user provided. They are unverified: use them as leads and mark any fact taken from them for verification." : "",
    limited
      ? `EVIDENCE IS LIMITED (${lock.observedEvidenceIds.length} item(s) directly show this phenomenon; status ${lock.evidenceStatus}). Do NOT switch to another topic or to general facts about the parent keyword to fill space. Stay on the phenomenon, keep claims modest, mark unsupported facts for verification${stage === "production" ? ", and list in editor_notes.research_gaps exactly what research or user-provided material is needed — never write those gaps or caveats in the publishing copy" : ", and put the missing facts in research_requirements"}.`
      : `OBSERVED EVIDENCE for this phenomenon: ${lock.observedEvidenceIds.join(", ")} — prefer these for details. Status ${lock.evidenceStatus}${lock.evidenceStatus === "EMERGING" ? " (an early, limited signal — never call it a trend, popular or viral)" : ""}.`,
  ].filter(Boolean).join(" ");
}

/** 슬라이드 단위 잠금 검사(품질 게이트용). 이탈 규칙에 걸린 슬라이드, 현상 핵심어가 없는 슬라이드(마지막 CTA 제외). */
export function checkLockUnits(units: Array<{ n: number; text: string }>, lock: EditorialContextLock) {
  const drift = units.map((unit) => ({ n: unit.n, hits: driftHits(unit.text, lock) })).filter((unit) => unit.hits.length);
  const unanchored = units.slice(0, -1).filter((unit) => !lockAnchored(unit.text, lock)).map((unit) => unit.n);
  return { drift, unanchored, pass: drift.length === 0 && unanchored.length <= 1 };
}
