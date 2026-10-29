import { NextResponse } from "next/server";
import { aiUsageToday } from "@/lib/ai-guard";
import { youtubeUsageToday } from "@/lib/youtube";

export const dynamic = "force-dynamic";

/** anon 키로 테이블 존재만 확인한다. RLS 때문에 행은 반환되지 않아도 200이면 테이블이 존재한다. */
async function supabaseTablesReady(): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return null;
  try {
    const response = await fetch(`${new URL(url).origin}/rest/v1/trend_analyses?select=id&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (response.ok) return true;
    // 권한 강화(0002) 후에는 비로그인 anon 요청이 42501(권한 없음)로 거절된다. 이는 테이블이 존재한다는 뜻이다.
    // 테이블이 없을 때만 PGRST205가 온다.
    const body = await response.json().catch(() => ({})) as { code?: string };
    return body.code === "42501";
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
      youtube: { configured: Boolean(process.env.YOUTUBE_API_KEY?.trim()), usage: youtubeUsageToday() },
      googleTrends: { configured: false, implemented: false, status: "alpha_approval_required" },
      supabase: { configured: supabaseConfigured, implemented: true, tablesReady: supabaseConfigured ? await supabaseTablesReady() : null },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
