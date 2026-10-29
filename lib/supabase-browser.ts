"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

function normalizeProjectUrl(value: string) {
  const url = new URL(value);
  return url.origin;
}

export function getSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const url = configuredUrl ? normalizeProjectUrl(configuredUrl) : null;
  browserClient = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
  return browserClient;
}
