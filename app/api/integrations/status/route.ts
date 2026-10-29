import { NextResponse } from "next/server";
import { aiUsageToday } from "@/lib/ai-guard";

export const dynamic = "force-dynamic";

/** anon 키로 테이블 존재만 확인한다. RLS 때문에 행은 반환되지 않아도 200이면 테이블이 존재한다. */
async function supabaseTablesReady(): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  try {
    const response = await fetch(`${new URL(url).origin}/rest/v1/trend_analyses?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  return NextResponse.json(
    {
      openai: { configured: Boolean(process.env.OPENAI_API_KEY?.trim()), usage: aiUsageToday() },
      naver: { configured: Boolean(process.env.NAVER_CLIENT_ID?.trim() && process.env.NAVER_CLIENT_SECRET?.trim()) },
      supabase: { configured: supabaseConfigured, implemented: true, tablesReady: supabaseConfigured ? await supabaseTablesReady() : null },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
