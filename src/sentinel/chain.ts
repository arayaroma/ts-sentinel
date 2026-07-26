import type { Handler, Middleware } from "../types.js";

/**
 * Composes middleware in the order given: the first middleware in the list
 * is the outermost (runs first on the way in, last on the way out).
 * chain(a, b, c)(h) is equivalent to a(b(c(h))).
 */
export function chain(...mws: Middleware[]): Middleware {
  return (final: Handler): Handler => {
    let h = final;
    for (let i = mws.length - 1; i >= 0; i--) {
      h = mws[i](h);
    }
    return h;
  };
}
