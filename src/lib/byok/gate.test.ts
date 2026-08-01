import { randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { encryptCredential } from "./crypto";
import { KEY_BYTES, fromBase64, type Bytes } from "./envelope";
import { gateMessageKey, openAiGate } from "./gate";
import { Secret } from "./secret";

/**
 * The BYOK gate, against the **real** module.
 *
 * Every other suite mocks this open, because they are testing their own
 * feature. This file is where the gate itself is held to account, and the
 * assertion that matters most is matrix case 12: **a closed gate makes no
 * provider call and consults no project key.**
 */

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER_USER = "22222222-2222-4222-8222-222222222222";
const PLAINTEXT = "sk-proj-not-a-real-key-00000000000000000000";

function master(): Bytes {
  return new Uint8Array(randomBytes(KEY_BYTES)) as Bytes;
}

/** PostgREST renders `bytea` as `\x…` hex; the adapter must handle that shape. */
function toBytea(base64: string): string {
  const bytes = fromBase64(base64);
  let hex = "";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return `\\x${hex}`;
}

type RpcResult = { data: unknown; error: unknown };

function supabaseStub(result: RpcResult) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as never, rpc };
}

async function activeRow(key: Bytes, userId = USER) {
  const envelope = await encryptCredential(PLAINTEXT, key, {
    userId,
    keyVersion: 1,
    provider: "openai",
  });
  return {
    ciphertext: toBytea(envelope.ciphertext),
    iv: toBytea(envelope.iv),
    key_version: 1,
    status: "active",
    provider: "openai",
  };
}

describe("openAiGate opens on an active credential", () => {
  it("returns a Secret carrying the decrypted key", async () => {
    const key = master();
    const { client } = supabaseStub({ data: [await activeRow(key)], error: null });

    const gate = await openAiGate(client, USER, { BYOK_MASTER_KEY: Buffer.from(key).toString("base64") } as never);

    expect(gate.ok).toBe(true);
    if (!gate.ok) return;
    expect(gate.credential.secret).toBeInstanceOf(Secret);
    expect(gate.credential.secret.expose()).toBe(PLAINTEXT);
    expect(gate.credential.provider).toBe("openai");
    expect(gate.credential.keyVersion).toBe(1);
  });

  it("handles a base64 envelope as well as the PostgREST hex form", async () => {
    // The seam a wrong assumption would hide in: the crypto core speaks base64
    // because the envelope format declares it, and PostgREST speaks `\x` hex
    // because that is what it does with `bytea`. Both must open.
    const key = master();
    const envelope = await encryptCredential(PLAINTEXT, key, {
      userId: USER,
      keyVersion: 1,
      provider: "openai",
    });
    const { client } = supabaseStub({
      data: [{ ...envelope, ciphertext: envelope.ciphertext, iv: envelope.iv, key_version: 1, status: "active", provider: "openai" }],
      error: null,
    });

    const gate = await openAiGate(client, USER, { BYOK_MASTER_KEY: Buffer.from(key).toString("base64") } as never);
    expect(gate.ok).toBe(true);
  });
});

describe("matrix case 12: a closed gate reaches nothing", () => {
  it("reports credential_required when the resolver returns no row", async () => {
    const { client, rpc } = supabaseStub({ data: [], error: null });

    const gate = await openAiGate(client, USER, { BYOK_MASTER_KEY: Buffer.from(master()).toString("base64") } as never);

    expect(gate).toEqual({ ok: false, reason: "credential_required" });
    // Exactly one call, and it is the resolver. Nothing reached a provider.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("resolve_own_ai_credential");
  });

  it("reports credential_unavailable when the resolver itself errors", async () => {
    const { client } = supabaseStub({ data: null, error: { message: "boom" } });
    const gate = await openAiGate(client, USER, { BYOK_MASTER_KEY: Buffer.from(master()).toString("base64") } as never);
    expect(gate).toEqual({ ok: false, reason: "credential_unavailable" });
  });

  it("reports credential_unreadable when the envelope will not open", async () => {
    // Sealed for this user, opened under a different master key.
    const { client } = supabaseStub({ data: [await activeRow(master())], error: null });
    const gate = await openAiGate(client, USER, { BYOK_MASTER_KEY: Buffer.from(master()).toString("base64") } as never);
    expect(gate).toEqual({ ok: false, reason: "credential_unreadable" });
  });

  it("BYOK-CRYPTO-004: a row sealed for another owner does not open here", async () => {
    // The AAD is doing the enforcing. Even with the right master key and a row
    // the resolver handed over, the wrong owner cannot read it — which is what
    // makes cross-user substitution a cryptographic failure rather than only an
    // RLS-prevented one.
    const key = master();
    const env = { BYOK_MASTER_KEY: Buffer.from(key).toString("base64") } as never;

    // Positive control first, or the refusal below proves nothing.
    const own = supabaseStub({ data: [await activeRow(key, USER)], error: null });
    expect((await openAiGate(own.client, USER, env)).ok).toBe(true);

    const foreign = supabaseStub({ data: [await activeRow(key, OTHER_USER)], error: null });
    expect(await openAiGate(foreign.client, USER, env)).toEqual({
      ok: false,
      reason: "credential_unreadable",
    });
  });

  it("never returns a usable credential for a non-active status", async () => {
    const key = master();
    const env = { BYOK_MASTER_KEY: Buffer.from(key).toString("base64") } as never;

    for (const status of ["invalid", "removed", "something-else"]) {
      const row = { ...(await activeRow(key)), status };
      const { client } = supabaseStub({ data: [row], error: null });
      const gate = await openAiGate(client, USER, env);
      expect(gate.ok, `status ${status} must not open the gate`).toBe(false);
    }
  });
});

describe("the gated failure never leaks", () => {
  it("carries a declared code and nothing else", async () => {
    const { client } = supabaseStub({ data: [await activeRow(master())], error: null });
    const gate = await openAiGate(client, USER, { BYOK_MASTER_KEY: Buffer.from(master()).toString("base64") } as never);

    // The whole failure value, serialized. A field that grew a ciphertext, an
    // owner id or a provider message would show up here.
    const rendered = JSON.stringify(gate);
    expect(rendered).toBe('{"ok":false,"reason":"credential_unreadable"}');
    expect(rendered).not.toContain(PLAINTEXT);
    expect(rendered).not.toContain(USER);
  });

  it("maps every code to a message key, and the two unreadable codes to one", () => {
    // "You have no key" is actionable and names the fix. "Your key could not be
    // read" is the other two, and it is deliberately vague about which:
    // BYOK-CRYPTO-005 forbids reporting whether key, tag or AAD failed, and the
    // owner cannot act on the difference anyway.
    expect(gateMessageKey("credential_required")).toBe("credentialRequired");
    expect(gateMessageKey("credential_unavailable")).toBe("credentialUnreadable");
    expect(gateMessageKey("credential_unreadable")).toBe("credentialUnreadable");
  });
});
