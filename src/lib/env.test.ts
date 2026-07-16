import { describe, expect, it } from "vitest";
import { parsePublicEnv } from "./env";

describe("public environment", () => {
  it("rejects missing Supabase configuration", () => {
    expect(() => parsePublicEnv({})).toThrow("Supabase");
  });

  it("accepts a valid local Supabase configuration", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-anon-key-with-enough-length",
      }),
    ).toMatchObject({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321" });
  });

  it("accepts the current Supabase publishable key name", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_key_with_enough_length",
      }),
    ).toMatchObject({
      NEXT_PUBLIC_SUPABASE_KEY: "sb_publishable_key_with_enough_length",
    });
  });
});
