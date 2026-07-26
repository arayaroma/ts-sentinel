import { describe, it, expect } from "vitest";
import { chain } from "../../src/sentinel/chain.js";
import type { Handler, Middleware } from "../../src/types.js";

describe("chain", () => {
  it("runs middleware outermost-first, then the final handler", async () => {
    const order: string[] = [];
    const mark =
      (name: string): Middleware =>
      (next: Handler) =>
      async (req: Request) => {
        order.push(name);
        return next(req);
      };

    const final: Handler = async () => {
      order.push("final");
      return new Response(null, { status: 200 });
    };

    const handler = chain(mark("a"), mark("b"), mark("c"))(final);
    await handler(new Request("http://x"));

    expect(order).toEqual(["a", "b", "c", "final"]);
  });
});
