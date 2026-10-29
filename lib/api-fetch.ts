"use client";

import { getSupabaseBrowserClient } from "./supabase-browser";

/** 비용이 드는 API 호출. 로그인한 경우 Supabase 액세스 토큰을 붙여 서버가 사용자를 확인할 수 있게 한다. */
export async function apiFetch(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const supabase = getSupabaseBrowserClient();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
