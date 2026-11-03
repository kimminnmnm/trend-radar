import { Collision } from "@/components/collision";
import { parseCollisionTrendParam } from "@/lib/culture-map-view";

/** Culture Map에서 `?trend=<trendId>&trend=<trendId>`로 넘긴 조합을 미리 선택한다. */
export default async function CollisionPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const query = await searchParams;
  const initialTrendIds = parseCollisionTrendParam(query.trend);
  const one = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
  const mode = one(query.mode) === "creative" ? "creative" as const : null;
  const connectionId = one(query.connection);
  const evidenceIds = one(query.evidence).split(",").map((item) => item.trim()).filter(Boolean).slice(0, 24);
  const selectedConnection = connectionId ? { id: connectionId.slice(0, 160), title: one(query.title || query.context).slice(0, 200), subject: one(query.subject).slice(0, 80), action: one(query.action).slice(0, 80), object: one(query.object).slice(0, 120), direction: one(query.direction).slice(0, 100), context: one(query.context).slice(0, 500), evidenceIds, verificationStatus: one(query.status).slice(0, 60) || "TREND WEB SELECTED CONNECTION", evidenceCount: evidenceIds.length } : null;
  return <Collision initialTrendIds={initialTrendIds} initialMode={mode} selectedConnection={selectedConnection} />;
}
