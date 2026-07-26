// Shared across every module: the Fetch API equivalent of Go's
// `func(http.Handler) http.Handler` middleware signature. Every ts-sentinel
// middleware has this shape, so it composes with any framework built on the
// standard Request/Response (Astro, Cloudflare Workers, Deno, Bun, Node 18+).
export type Handler = (req: Request) => Response | Promise<Response>;
export type Middleware = (next: Handler) => Handler;
