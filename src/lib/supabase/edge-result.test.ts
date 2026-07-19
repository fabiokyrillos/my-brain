import { describe, expect, it } from "vitest";
import {
  requireServiceData,
  requireServiceSuccess,
} from "../../../supabase/functions/_shared/result";

describe("Edge Function Supabase result handling", () => {
  it("returns data for successful calls", () => {
    expect(requireServiceData({ data: { id: "1" }, error: null }, "load row"))
      .toEqual({ id: "1" });
    expect(() => requireServiceSuccess({ error: null }, "update row")).not.toThrow();
  });

  it("throws a safe operation and code without provider details", () => {
    const result = {
      data: null,
      error: { code: "42501", message: "sensitive database detail" },
    };

    expect(() => requireServiceData(result, "load row")).toThrow("load row failed (42501)");
    expect(() => requireServiceSuccess(result, "update row")).not.toThrow("sensitive database detail");
  });
});
