import { describe, expect, it, vi } from "vitest";

// The repository idiom for a `server-only` module under jsdom. The guard is
// load-bearing in the build and inert here.
vi.mock("server-only", () => ({}));

import { ABSENT_CREDENTIAL, loadCredentialMetadata } from "./credential-view";

/**
 * The read path returns metadata, and the fingerprint it returns is **parsed**.
 *
 * `formatFingerprint` shipped with BYOK.1 carrying the parse-don't-trust
 * guarantee — a stored value outside the closed `prefix:6-hex` shape renders as
 * `unknown` rather than being echoed onto the page. It had no production
 * consumer until the C11 Settings journey observed the panel rendering the raw
 * stored token, so the guarantee was written and not in force. These cases hold
 * it in force.
 */

type Row = Record<string, unknown> | null;

function supabaseReturning(data: Row, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn((columns: string) => {
    void columns;
    return { eq };
  });
  const from = vi.fn(() => ({ select }));
  // The shape the module actually uses; the cast keeps the test honest about
  // that rather than pulling the whole generated client type into a stub.
  return { client: { from } as never, from, select };
}

const activeRow = {
  status: "active",
  provider: "openai",
  fingerprint: "sk-proj:a3f9c1",
  validated_at: "2026-08-02T12:00:00+00:00",
  last_failure_code: null,
  updated_at: "2026-08-02T12:00:00+00:00",
};

describe("loadCredentialMetadata", () => {
  it("returns the fingerprint in display form, not the stored token", async () => {
    const { client } = supabaseReturning(activeRow);

    const metadata = await loadCredentialMetadata(client, "user-1");

    expect(metadata.fingerprint).toBe("sk-proj · a3f9c1");
  });

  it.each([
    ["a shape past the CHECK constraint", "sk-proj:NOTHEX"],
    ["an injected fragment", "<script>alert(1)</script>"],
    ["an undeclared prefix", "openai:a3f9c1"],
    ["an over-long digest", "sk-proj:a3f9c1a3f9c1"],
  ])("renders %s as unknown rather than echoing it", async (_label, stored) => {
    const { client } = supabaseReturning({ ...activeRow, fingerprint: stored });

    const metadata = await loadCredentialMetadata(client, "user-1");

    expect(metadata.fingerprint).toBe("unknown");
    expect(metadata.fingerprint).not.toContain(stored);
  });

  it("leaves an absent fingerprint absent rather than inventing one", async () => {
    const { client } = supabaseReturning({ ...activeRow, fingerprint: null });

    expect((await loadCredentialMetadata(client, "user-1")).fingerprint).toBeNull();
  });

  it("never selects the key material", async () => {
    const { client, select } = supabaseReturning(activeRow);

    await loadCredentialMetadata(client, "user-1");

    const columns = select.mock.calls[0][0];
    expect(columns).not.toContain("ciphertext");
    expect(columns).not.toContain("iv");
  });

  it("reports a missing row as absent rather than as a failure", async () => {
    const { client } = supabaseReturning(null);

    expect(await loadCredentialMetadata(client, "user-1")).toEqual(ABSENT_CREDENTIAL);
  });

  it("treats an undeclared status as absent, so AI stays gated", async () => {
    const { client } = supabaseReturning({ ...activeRow, status: "something_new" });

    const metadata = await loadCredentialMetadata(client, "user-1");

    expect(metadata.status).toBe("absent");
    expect(metadata.configured).toBe(false);
  });
});
