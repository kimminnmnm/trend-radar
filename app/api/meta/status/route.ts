import { getMetaConnectionStatus } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getMetaConnectionStatus();
  return Response.json(status, {
    status: status.configured && !status.tokenValid ? 401 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
