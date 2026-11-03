import { expect, test } from "@playwright/test";
import fixture from "./fixtures/discovery-t1-t3.json";
import { buildTrendWebGraph, isTrendWebPayload, TREND_WEB_NODE_LIMIT, type TrendWebSession } from "../lib/trend-web";
import type { DiscoveryReport } from "../lib/discovery";
import { fromSavedRow, toSavedRow } from "../lib/saved-items-cloud";

type Fixture = { makeup: Omit<DiscoveryReport, "id" | "generatedAt" | "model" | "sources" | "limitations" | "excluded"> & Partial<DiscoveryReport>; connections: Record<string, unknown> };
const recorded = fixture as unknown as Fixture;
const report: DiscoveryReport = {
  id: "disc-makeup-real", keyword: recorded.makeup.keyword, window: recorded.makeup.window, signals: recorded.makeup.signals,
  excluded: recorded.makeup.excluded ?? [], limitations: recorded.makeup.limitations ?? [], sources: recorded.makeup.sources ?? { youtube: 10, web: 6, webDropped: 0 },
  ledger: recorded.makeup.ledger, model: "recorded-real-response", generatedAt: "2026-11-02T10:00:00.000Z",
};

test.describe("W1-W3 Trend Web evidence graph", () => {
  test("extracts a bounded, deduplicated graph from recorded real evidence without treating suggestions as observations", () => {
    const graph = buildTrendWebGraph(report, Date.parse("2026-11-02T12:00:00Z"));
    expect(graph.mainKeyword).toBe("메이크업");
    expect(graph.nodes.length).toBeLessThanOrEqual(TREND_WEB_NODE_LIMIT);
    expect(new Set(graph.nodes.map((node) => node.id)).size).toBe(graph.nodes.length);
    expect(graph.nodes[0]).toMatchObject({ category: "MAIN", evidenceStatus: "OBSERVED" });
    expect(graph.nodes.some((node) => node.category === "PHENOMENON" && /메이크업|GRWM/.test(node.keyword))).toBe(true);
    expect(graph.nodes.some((node) => node.category === "BEHAVIOR")).toBe(true);
    expect(graph.nodes.some((node) => node.evidenceStatus === "SUGGESTED" && node.evidenceIds.length === 0)).toBe(true);
    expect(graph.nodes.filter((node) => node.evidenceStatus !== "SUGGESTED").every((node) => node.independentSourceCount > 0 && node.evidenceScore > 0)).toBe(true);
    expect(graph.methodology).toMatch(/인기도·검색량·시장 순위가 아니며/);
  });

  test("edges distinguish observed evidence from semantic suggestions and retain source ids", () => {
    const graph = buildTrendWebGraph(report, Date.parse("2026-11-02T12:00:00Z"));
    expect(graph.edges.some((edge) => edge.type === "SHARED_PHENOMENON" && edge.evidenceIds.length > 0)).toBe(true);
    expect(graph.edges.some((edge) => edge.type === "BEHAVIORAL_CONNECTION" && edge.evidenceIds.length > 0)).toBe(true);
    expect(graph.edges.some((edge) => edge.type === "SEMANTIC_ASSOCIATION" && edge.status === "SUGGESTED" && edge.evidenceIds.length === 0)).toBe(true);
    expect(graph.edges.every((edge) => edge.strength >= .25 && edge.strength <= 1)).toBe(true);
  });

  test("saved payload keeps the graph and at most two selected nodes", () => {
    const graph = buildTrendWebGraph(report);
    const session: TrendWebSession = { id: "trend-web-disc-makeup-real", graph, selectedNodeIds: graph.nodes.slice(0, 2).map((node) => node.id), updatedAt: "2026-11-02T12:00:00Z" };
    expect(isTrendWebPayload({ kind: "trend-web", session })).toBe(true);
    expect(isTrendWebPayload({ kind: "trend-web", session: { ...session, graph: { ...graph, version: "fake" } } })).toBe(false);
    expect(isTrendWebPayload({ kind: "trend-web", session: { ...session, selectedNodeIds: ["a", "b", "c"] } })).toBe(false);
  });

  test("Workspace/Supabase row round-trip preserves the graph, selection and connection", () => {
    const graph = buildTrendWebGraph(report);
    const session: TrendWebSession = { id: "trend-web-disc-makeup-real", graph, selectedNodeIds: graph.nodes.slice(0, 2).map((node) => node.id), selectedConnectionId: "conn-1", updatedAt: "2026-11-02T12:00:00Z" };
    const item = { id: "tw-session-trend-web-disc-makeup-real", type: "insight" as const, mode: "live" as const, title: "메이크업 · TREND WEB", subtitle: "saved graph", createdAt: graph.generatedAt, updatedAt: session.updatedAt, payload: { kind: "trend-web" as const, session } };
    const encoded = toSavedRow("user-a", item);
    const restored = fromSavedRow({ id: "row-1", item_type: encoded.item_type, title: encoded.title, subtitle: encoded.subtitle, payload: encoded.payload, created_at: graph.generatedAt });
    expect(restored?.item.payload).toEqual(item.payload);
  });
});

test.describe("W4-W7 Trend Web UI", () => {
  test("selects two nodes, keeps selection through filters, reuses the connection API flow and saves the graph", async ({ page }) => {
    await page.addInitScript((value) => {
      localStorage.clear();
      localStorage.setItem("trend-radar-onboarded", "1");
      localStorage.setItem("trend-radar-discoveries", JSON.stringify([value]));
    }, report);
    let calls = 0;
    await page.route("**/api/discover/connections", async (route) => { calls += 1; await route.fulfill({ json: { cached: true, ...recorded.connections } }); });
    page.on("dialog", (dialog) => void dialog.accept());
    await page.goto("/");
    const web = page.getByTestId("trend-web");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("trend-radar-discoveries") ?? "[]").map((item: { id?: string }) => item.id))).toEqual([report.id]);
    await page.evaluate(() => window.dispatchEvent(new Event("trend-radar:storage")));
    await expect(web).toContainText("Explore Connected Signals");
    await expect(web.getByTestId("trend-web-canvas").locator(".react-flow__node")).toHaveCount(Math.min(INITIAL_NODE_COUNT, buildTrendWebGraph(report).nodes.length));
    await web.getByRole("radio", { name: "SELECT TWO MODE" }).click();
    const nodeButtons = web.getByTestId("trend-web-node-picker").getByRole("button");
    await nodeButtons.nth(0).click(); await nodeButtons.nth(1).click();
    await expect(web.getByTestId("trend-web-selection")).toContainText("A:");
    await expect(web.getByTestId("trend-web-selection")).toContainText("B:");
    await web.getByLabel("Category filter").selectOption("ENTITY");
    await expect(web.getByTestId("trend-web-selection")).toContainText("선택은 유지됩니다");
    await web.getByLabel("Category filter").selectOption("ALL");
    await web.getByRole("button", { name: /ANALYZE CONNECTION/ }).click();
    await expect(web.getByTestId("hn-connections")).toBeVisible();
    expect(calls).toBe(1);
    await web.getByTestId("hn-connection").first().getByRole("button", { name: "SELECT RELATION" }).click();
    await expect(web.getByTestId("hn-connection").first()).toHaveAttribute("data-selected", "true");
    await web.getByRole("button", { name: /SAVE TREND WEB/ }).click();
    const saved = await page.evaluate(() => ({ workspace: JSON.parse(localStorage.getItem("trend-radar-workspace") ?? "[]"), sessions: JSON.parse(localStorage.getItem("trend-radar-trend-web-sessions") ?? "[]") }));
    expect(saved.workspace[0].payload.kind).toBe("trend-web");
    expect(saved.sessions[0].selectedNodeIds).toHaveLength(2);
    expect(saved.sessions[0].selectedConnectionId).toBeTruthy();
  });
});

const INITIAL_NODE_COUNT = 16;
