import { describe, expect, it } from "vitest";
import { requireSupabaseData, requireSupabaseSuccess, SupabaseQueryError } from "./result";

describe("requireSupabaseData", () => {
  it("returns successful query data", () => {
    expect(requireSupabaseData({ data: [{ id: "1" }], error: null }, "load tasks"))
      .toEqual([{ id: "1" }]);
  });

  it("throws a stable application error while retaining the provider cause", () => {
    const providerError = { message: "relation detail", code: "42P01" };
    expect(() => requireSupabaseData({ data: null, error: providerError }, "load tasks"))
      .toThrowError(SupabaseQueryError);

    try {
      requireSupabaseData({ data: null, error: providerError }, "load tasks");
    } catch (error) {
      expect(error).toMatchObject({ message: "load tasks failed", cause: providerError });
    }
  });
});

describe("requireSupabaseSuccess", () => {
  it("does nothing when the mutation succeeds", () => {
    expect(() => requireSupabaseSuccess({ error: null }, "update task")).not.toThrow();
  });

  it("throws the same stable application error for mutation failures", () => {
    const providerError = { message: "row denied", code: "42501" };

    expect(() => requireSupabaseSuccess({ error: providerError }, "update task"))
      .toThrowError(SupabaseQueryError);
  });
});
