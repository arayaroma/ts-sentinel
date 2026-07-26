// Single import point for ts-sentinel: re-exports every middleware
// constructor and type from the underlying auth/ratelimit/resource/headers/
// validate modules, plus chain() for readable composition.
//
// See the repo README for the reference wiring example.
export { chain } from "./chain.js";
export type { Handler, Middleware } from "../types.js";

export { traceId } from "../traceid/index.js";
export type { TraceIdConfig } from "../traceid/index.js";

export { requireApiKey } from "../auth/index.js";
export type { ApiKeyConfig } from "../auth/index.js";

export {
  rateLimit,
  rateLimitGlobal,
  apiKeyOrIp,
  MemoryRateLimitStore,
} from "../ratelimit/index.js";
export type { RateLimitConfig, RateLimitStore } from "../ratelimit/index.js";

export { withTimeout, maxBodyBytes, isBodyLimitError, BodyLimitExceededError } from "../resource/index.js";

export { secureHeaders } from "../headers/index.js";
export type { SecureHeadersConfig } from "../headers/index.js";

export { nonEmpty, maxLength, oneOf, ValidationError } from "../validate/index.js";
