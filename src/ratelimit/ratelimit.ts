// Token-bucket rate limiting middleware, keyed by API key (if present) or
// client IP (best-effort, via forwarded headers — the Fetch API's Request
// has no built-in remote-address field). TS sibling of go-sentinel's
// ratelimit package.
import type { Handler, Middleware } from "../types.js";

/**
 * Abstracts the rate-limit bucket backend so the default in-memory
 * implementation can later be swapped for a distributed store (e.g. Redis)
 * without changing the rateLimit middleware's public signature.
 */
export interface RateLimitStore {
  /** Reports whether a request identified by `key` is permitted right now, consuming a token if so. */
  allow(key: string): boolean;
}

export interface RateLimitConfig {
  /** Sustained requests-per-second rate allowed per key. */
  rps: number;
  /** Maximum number of requests allowed in a burst above rps. */
  burst: number;
  /** Derives the rate-limit key from a request. Defaults to apiKeyOrIp. */
  keyFunc?: (req: Request) => string;
  /** Bucket backend. Defaults to a new in-memory store. */
  store?: RateLimitStore;
}

/**
 * Returns middleware enforcing a token-bucket rate limit per client key.
 * Requests over the limit receive 429 Too Many Requests with a Retry-After
 * header and a JSON body {"error": "..."}.
 */
export function rateLimit(cfg: RateLimitConfig): Middleware {
  const keyFunc = cfg.keyFunc ?? apiKeyOrIp;
  return rateLimitWithKeyFunc(cfg, keyFunc);
}

/** Constant bucket key used by rateLimitGlobal — one shared bucket for the whole service. */
const GLOBAL_KEY = "__global__";

/**
 * Returns middleware enforcing a single, shared token-bucket rate limit
 * across all callers, independent of caller identity. Place it before the
 * per-key rateLimit in the chain so the aggregate flood is rejected before
 * per-key bookkeeping runs.
 */
export function rateLimitGlobal(cfg: RateLimitConfig): Middleware {
  return rateLimitWithKeyFunc(cfg, () => GLOBAL_KEY);
}

function rateLimitWithKeyFunc(
  cfg: RateLimitConfig,
  keyFunc: (req: Request) => string
): Middleware {
  const store = cfg.store ?? new MemoryRateLimitStore(cfg.rps, cfg.burst);

  return (next: Handler): Handler => {
    return async (req: Request): Promise<Response> => {
      const key = keyFunc(req);
      if (!store.allow(key)) {
        return tooManyRequestsResponse(cfg.rps);
      }
      return next(req);
    };
  };
}

/**
 * Derives the rate-limit key from the X-API-Key header if present, falling
 * back to a forwarded-for header (X-Forwarded-For, first entry) since the
 * Fetch API's Request carries no remote-address field of its own — the
 * runtime/framework (Vercel, Cloudflare, etc.) is responsible for setting
 * one of these on incoming requests. Falls back to a constant key
 * ("unknown") when neither is present, still rate-limited, just bucketed
 * together.
 */
export function apiKeyOrIp(req: Request): string {
  const apiKey = req.headers.get("X-API-Key");
  if (apiKey) {
    return "key:" + apiKey;
  }
  const forwardedFor = req.headers.get("X-Forwarded-For");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) {
      return "ip:" + first;
    }
  }
  const realIp = req.headers.get("X-Real-IP");
  if (realIp) {
    return "ip:" + realIp;
  }
  return "ip:unknown";
}

function tooManyRequestsResponse(rps: number): Response {
  let retryAfter = 1;
  if (rps > 0 && rps < 1) {
    retryAfter = Math.max(1, Math.round(1 / rps));
  }
  return new Response(JSON.stringify({ error: "rate limit exceeded" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfter),
    },
  });
}

/** A single token bucket. */
class Bucket {
  private tokens: number;
  private lastFill: number;

  constructor(
    private readonly rps: number,
    private readonly burst: number
  ) {
    this.tokens = burst;
    this.lastFill = Date.now();
  }

  allow(): boolean {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastFill) / 1000;
    this.lastFill = now;

    this.tokens = Math.min(this.burst, this.tokens + elapsedSeconds * this.rps);

    if (this.tokens < 1) {
      return false;
    }
    this.tokens -= 1;
    return true;
  }
}

/**
 * In-memory, single-process rate limit store backed by a token bucket per
 * key. Suitable for a single active instance; swap in a distributed store
 * (implementing RateLimitStore) for multi-instance deployments.
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly rps: number,
    private readonly burst: number
  ) {}

  allow(key: string): boolean {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = new Bucket(this.rps, this.burst);
      this.buckets.set(key, bucket);
    }
    return bucket.allow();
  }
}
