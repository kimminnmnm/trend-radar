import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { mergeIgPulseReports, pushIgPulseReport } from "../lib/ig-pulse-cloud";
import type { IgPulseReport } from "../lib/types";
import { createStore, fakeSupabase, rowCount } from "./helpers/fake-supabase";

const report = (generatedAt: string, id?: string): IgPulseReport => ({
  id,
  generatedAt,
  promptVersion: "ig-pulse-v1",
  model: null,
  items: [{ tag: "existing_tag", hashtagId: "123", origin: "tracked", sources: [], collectedAt: generatedAt, found: true, sampled: 1, pagesFetched: 1, complete: true, posts24h: 1, oldestAt: generatedAt, spanHours: 1, perHour: 1, rateBasis: "24h-full", samplePosts: [], usedQuota: false, searchKind: "refresh" }],
  deferred: [], failed: [], droppedUnverified: 0, searchedSources: 0,
  quota: { limit: 30, reserve: 6, usedBefore: 23, usedAfter: 23, source: "meta_api", checkedAt: generatedAt, recent: [{ tag: "existing_tag", hashtagId: "123" }] },
  methodology: ["existing hashtag ID refresh"],
});

test("Pulse merge deduplicates by report ID or generated time and keeps newest first", () => {
  const older = report("2026-10-28T00:00:00.000Z", "older");
  const newer = report("2026-10-29T00:00:00.000Z", "newer");
  const cloudCopy = { ...older, cloudSavedAt: "2026-10-30T00:00:00.000Z" };
  const merged = mergeIgPulseReports([older, newer], [cloudCopy]);
  expect(merged).toHaveLength(2);
  expect(merged.map((item) => item.id)).toEqual(["newer", "older"]);
  expect(merged[1].cloudSavedAt).toBeTruthy();
});

test("Pulse push is confirmed by a database row and isolated by user", async () => {
  const store = createStore();
  const a = fakeSupabase(store, { id: "user-a" });
  const b = fakeSupabase(store, { id: "user-b" });
  const saved = await pushIgPulseReport(report("2026-10-29T12:00:00.000Z", "pulse-a"), a);
  expect(saved.ok).toBe(true);
  expect(rowCount(store, "instagram_pulse_reports", "user-a")).toBe(1);
  // 보고서 저장은 추적 설정 행을 만들거나 덮어쓰지 않는다(빈 목록 덮어쓰기 방지).
  expect(rowCount(store, "instagram_pulse_preferences", "user-a")).toBe(0);
  const visibleToB = await b.from("instagram_pulse_reports").select("report_id");
  expect(visibleToB.data).toEqual([]);
});

test("migration creates separate Pulse and manual-search tables with RLS", () => {
  const sql = fs.readFileSync("supabase/migrations/202610300007_instagram_pulse_cloud.sql", "utf8");
  expect(sql).toContain("create table if not exists public.instagram_pulse_reports");
  expect(sql).toContain("unique (user_id, report_id)");
  expect(sql).toContain("create table if not exists public.instagram_pulse_preferences");
  expect(sql).toContain("create table if not exists public.instagram_manual_search_history");
  expect(sql.match(/enable row level security/g)).toHaveLength(3);
  expect(sql).toContain("users read own instagram pulse reports");
});
