import { z } from "zod";
import type { EditorialContextLock } from "./editorial-lock";

/*
 * T7 SEMANTIC IMAGE ALIGNMENT. 이미지 프롬프트 문장(모델이 썼든 사용자가 고쳤든)과 별개로,
 * 장면의 의미 구조(주체·행동·대상·문화 맥락·시각 방향·장면 목적·금지 해석)를 항상 함께 보낸다.
 * 생성 이미지는 실제 사례의 증거가 아니라 AI 생성 이미지임을 프롬프트·카드·Figma에 표시한다.
 */
export const imageBriefSchema = z.object({
  subject: z.string().trim().max(200).default(""),
  action: z.string().trim().max(300).default(""),
  object: z.string().trim().max(200).default(""),
  culturalContext: z.string().trim().max(300).default(""),
  visualDirection: z.string().trim().max(400).default(""),
  scenePurpose: z.string().trim().max(300).default(""),
  forbidden: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
});
export type ImageBrief = z.infer<typeof imageBriefSchema>;

const VIRTUAL_TO_REAL = /virtual\s*→\s*real|가상\s*→\s*현실/i;
const INSIDE = /안에서|in-game|inside/i;
/** 어떤 이미지든 지키는 금지 해석: 생성 이미지가 실제 사례의 증거처럼 보이면 안 된다. */
export const EVIDENCE_GUARD = "a fake screenshot, video frame or candid photo that looks like documentary evidence of a real event, a real creator or a real person's result";

/** 잠금(T6)의 방향·금지 이탈을 시각적 오해 목록으로 옮긴다. */
export function forbiddenMisinterpretations(lock?: EditorialContextLock) {
  const items = [EVIDENCE_GUARD, "official brand logos, platform logos or copyrighted characters"];
  if (!lock?.enabled) return items;
  items.push(`a generic stock image about "${lock.parentKeyword}" that does not show "${lock.selectedPhenomenon}"`);
  const ids = new Set(lock.prohibitedTopicDrift.map((item) => item.id));
  if (ids.has("history")) items.push(`vintage or historical imagery about the origin of ${lock.parentKeyword}`);
  if (ids.has("purchase")) items.push("an item shop, price tag, checkout or store screen");
  if (ids.has("beginner")) items.push("a tutorial, sign-up or installation screen");
  if (ids.has("opposite") && VIRTUAL_TO_REAL.test(lock.direction)) items.push("a game character simply standing in front of a cosmetics or makeup menu UI (that is in-game item use, the opposite direction)");
  else if (ids.has("opposite") && INSIDE.test(lock.direction)) items.push("a real person's face recreating the look in real life (that is the other direction)");
  return items.slice(0, 10);
}

type SlideLike = { type?: string; headline?: string; reader_gets?: string; visual_direction?: string; specific_detail?: string; description?: string; on_screen_text?: string };
/** 슬라이드(또는 장면) 하나의 의미 구조. 슬라이드마다 자기 문구·시각 방향으로 따로 만든다(다른 슬라이드와 공유하지 않음). */
export function slideImageBrief(slide: SlideLike, input: { lock?: EditorialContextLock; title: string }): ImageBrief {
  const lock = input.lock?.enabled ? input.lock : undefined;
  const comparison = lock && VIRTUAL_TO_REAL.test(lock.direction) ? "Prefer an editorial comparison that shows the virtual look and its real-life interpretation together. " : "";
  const headline = slide.headline ?? slide.on_screen_text ?? "";
  return {
    subject: (lock?.subject || (lock ? `people doing "${lock.selectedPhenomenon}"` : input.title)).slice(0, 200),
    action: (lock?.coreBehavior ?? "").slice(0, 300),
    object: (lock?.object ?? "").slice(0, 200),
    culturalContext: (lock?.culturalContext ?? "").slice(0, 300),
    visualDirection: `${comparison}${slide.visual_direction ?? slide.description ?? ""}`.trim().slice(0, 400),
    scenePurpose: [slide.type ? `${slide.type} card` : "", headline && `headline "${headline.replace(/\s+/g, " ")}"`, slide.reader_gets || slide.specific_detail || ""].filter(Boolean).join(" — ").slice(0, 300),
    forbidden: forbiddenMisinterpretations(lock),
  };
}

/** 최종 프롬프트 앞에 붙는 의미 블록. 비어 있는 칸은 넣지 않는다. */
export function briefBlock(brief: ImageBrief) {
  const lines = [
    brief.scenePurpose && `SCENE PURPOSE: ${brief.scenePurpose}.`,
    brief.subject && `SUBJECT: ${brief.subject}.`,
    brief.action && `ACTION: ${brief.action}.`,
    brief.object && `OBJECT: ${brief.object}.`,
    brief.culturalContext && `CULTURAL CONTEXT: ${brief.culturalContext}.`,
    brief.visualDirection && `VISUAL DIRECTION: ${brief.visualDirection}.`,
    "The image must show this subject doing this action with this object — the behavior itself, not a generic picture of the topic.",
    "This is an AI-generated editorial illustration or concept, not a record of a real case: anonymous people drawn in a clearly illustrated, painterly or 3D-rendered style — never photorealistic skin, pores or camera-like portraits that could pass as a real person's photo.",
    brief.forbidden.length ? `DO NOT DEPICT (forbidden misinterpretations): ${brief.forbidden.join("; ")}.` : "",
  ];
  return lines.filter(Boolean).join(" ");
}
