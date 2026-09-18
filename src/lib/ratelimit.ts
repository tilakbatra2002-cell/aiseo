// Simple in-memory rate limiter (per serverless instance / process).
// For multi-instance production, swap with an external store (Upstash/Redis).
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > 5000) {
    // opportunistic cleanup
    for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
  }
  return b.count <= limit;
}

export function clientIp(req: Request): string {
  const h = req.headers.get('x-forwarded-for');
  return h ? h.split(',')[0].trim() : 'local';
}
