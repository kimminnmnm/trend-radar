import "server-only";
import { NextResponse } from "next/server";
import { GuardError } from "./ai-guard";
import { NaverDataLabError } from "./naver";
import { OpenAIAnalysisError } from "./openai-client";
import { MetaGraphError } from "./meta";
import { AccessError } from "./api-access";

export const noStore = { "Cache-Control": "no-store" };

export function invalidRequest(issues: unknown) {
  return NextResponse.json({ error: "INVALID_REQUEST", message: "요청 형식이 올바르지 않습니다.", issues }, { status: 400, headers: noStore });
}

export function errorResponse(error: unknown, fallback = "분석에 실패했습니다.", extra: Record<string, unknown> = {}) {
  if (error instanceof GuardError || error instanceof OpenAIAnalysisError) return NextResponse.json({ error: error.code, message: error.message, ...extra }, { status: error.status, headers: noStore });
  if (error instanceof NaverDataLabError) return NextResponse.json({ error: error.code || "NAVER_API_ERROR", message: error.message, ...extra }, { status: error.status, headers: noStore });
  if (error instanceof AccessError) return NextResponse.json({ error: error.code, message: error.message, ...extra }, { status: error.status, headers: noStore });
  if (error instanceof MetaGraphError) return NextResponse.json({ error: error.reason, message: error.message, ...extra }, { status: error.status, headers: noStore });
  return NextResponse.json({ error: "INTERNAL_ERROR", message: fallback, ...extra }, { status: 500, headers: noStore });
}
