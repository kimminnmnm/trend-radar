import "server-only";

export function createRateLimiter(maxRequests: number, windowMs = 60_000) {
  const clients = new Map<string, { count: number; resetAt: number }>();
  return function check(key: string) {
    const now = Date.now();
    const current = clients.get(key);
    if (!current || current.resetAt <= now) {
      const next = { count: 1, resetAt: now + windowMs };
      clients.set(key, next);
      return { allowed: true, remaining: maxRequests - 1, resetAt: next.resetAt };
    }
    current.count += 1;
    if (clients.size > 500) for (const [clientKey, value] of clients) if (value.resetAt <= now) clients.delete(clientKey);
    return { allowed: current.count <= maxRequests, remaining: Math.max(0, maxRequests - current.count), resetAt: current.resetAt };
  };
}

export const checkMetaSearchRateLimit = createRateLimiter(10);

export function clientKeyFrom(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
