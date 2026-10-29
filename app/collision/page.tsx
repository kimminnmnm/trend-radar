import { Collision } from "@/components/collision";
import { parseCollisionTrendParam } from "@/lib/culture-map-view";

/** Culture Map에서 `?trend=<trendId>&trend=<trendId>`로 넘긴 조합을 미리 선택한다. */
export default async function CollisionPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const initialTrendIds = parseCollisionTrendParam((await searchParams).trend);
  return <Collision initialTrendIds={initialTrendIds} />;
}
