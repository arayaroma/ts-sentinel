import { describe, it, expect } from "vitest";
import { nonEmpty, maxLength, oneOf } from "../../src/validate/index.js";

describe("nonEmpty", () => {
  it.each([
    ["hello", false],
    ["", true],
    ["   ", true],
  ])("nonEmpty(%j) -> error? %s", (value, wantErr) => {
    expect(nonEmpty("field", value) !== null).toBe(wantErr);
  });
});

describe("maxLength", () => {
  it.each([
    ["abc", 5, false],
    ["abcde", 5, false],
    ["abcdef", 5, true],
  ])("maxLength(%j, %i) -> error? %s", (value, max, wantErr) => {
    expect(maxLength("field", value, max) !== null).toBe(wantErr);
  });
});

describe("oneOf", () => {
  it("passes for a member of the allowed list", () => {
    expect(oneOf("field", "b", ["a", "b", "c"])).toBeNull();
  });
  it("fails for a non-member", () => {
    expect(oneOf("field", "z", ["a", "b", "c"])).not.toBeNull();
  });
  it("fails against an empty allowed list", () => {
    expect(oneOf("field", "a", [])).not.toBeNull();
  });
});
