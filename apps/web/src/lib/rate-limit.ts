type Bucket = {
  count: number;
  resetAt: number;
};

const globalForRateLimit = globalThis as unknown as {
  docRateBuckets?: Map<string, Bucket>;
};

const buckets = globalForRateLimit.docRateBuckets ?? new Map<string, Bucket>();

if (!globalForRateLimit.docRateBuckets) {
  globalForRateLimit.docRateBuckets = buckets;
}

export function consumeRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || now > current.resetAt) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs
    });
    return true;
  }

  if (current.count >= maxRequests) {
    return false;
  }

  current.count += 1;
  buckets.set(key, current);
  return true;
}
