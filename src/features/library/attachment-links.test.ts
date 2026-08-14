import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadLinksForAttachments, loadLinksForEntity } = await import("./attachment-links");
const { ATTACHMENT_LINK_LIMIT, PAGE_LINK_LIMIT } = await import("./link-contracts");

/**
 * `2N-SEC-002`, `2N-KNOWS-008` — the two queries, asserted as what was really
 * sent.
 *
 * The rules these loaders obey are proved in `link-contracts.test.ts`, without a
 * client. What can only be proved here is the **query shape**: that ownership is
 * left to RLS rather than to a parameter, that the probe row is asked for, and
 * that no read happens at all when there is nothing to ask about.
 */

type Result = { data: unknown; error: unknown };

/** Records the whole PostgREST chain so the query itself can be asserted. */
function linkStub(result: Result) {
  const calls: { method: string; args: unknown[] }[] = [];
  const stub: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order"]) {
    stub[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return stub;
    });
  }
  stub.limit = vi.fn((...args: unknown[]) => {
    calls.push({ method: "limit", args });
    return Promise.resolve(result);
  });
  return { stub, calls };
}

function supabase(stub: Record<string, unknown>) {
  return { from: vi.fn(() => stub) } as never;
}

describe("2N-SEC-002: ownership is RLS and the query, never a parameter", () => {
  it("neither loader accepts an owner id", () => {
    // `loadLinksForEntity`'s third parameter is the entity id, not a user id;
    // `loadLinksForAttachments` takes two. A signature that cannot be handed an
    // owner cannot be handed the wrong one.
    expect(loadLinksForAttachments.length).toBe(2);
    expect(loadLinksForEntity.length).toBe(3);
  });

  it("adds no user_id predicate that would mask an RLS failure", async () => {
    const { stub, calls } = linkStub({ data: [], error: null });
    await loadLinksForEntity(supabase(stub), "person", "person-1");
    expect(calls.filter((call) => call.method === "eq").map((call) => call.args[0])).toEqual([
      "entity_type",
      "entity_id",
    ]);
  });

  it("reads the link table and nothing that could widen the scope", async () => {
    const { stub } = linkStub({ data: [], error: null });
    const client = supabase(stub) as unknown as { from: ReturnType<typeof vi.fn> };
    await loadLinksForEntity(client as never, "project", "project-1");
    expect(client.from).toHaveBeenCalledWith("entity_attachments");
  });
});

describe("2N-KNOWS-008: the probe row is asked for", () => {
  it("asks for one row more than one subject will show", async () => {
    const { stub, calls } = linkStub({ data: [], error: null });
    await loadLinksForEntity(supabase(stub), "project", "project-1");
    expect(calls.find((call) => call.method === "limit")?.args[0]).toBe(ATTACHMENT_LINK_LIMIT + 1);
  });

  it("asks for one row more than a page of files will show", async () => {
    const { stub, calls } = linkStub({ data: [], error: null });
    await loadLinksForAttachments(supabase(stub), ["file-1"]);
    expect(calls.find((call) => call.method === "limit")?.args[0]).toBe(PAGE_LINK_LIMIT + 1);
  });

  it("orders by a stable key so the unshown row is the same one each request", async () => {
    const { stub, calls } = linkStub({ data: [], error: null });
    await loadLinksForAttachments(supabase(stub), ["file-1"]);
    expect(calls.filter((call) => call.method === "order").map((call) => call.args[0])).toEqual([
      "attachment_id",
      "created_at",
    ]);
  });
});

describe("no read happens when there is nothing to ask about", () => {
  it("returns an empty ok without querying for an empty page", async () => {
    const { stub, calls } = linkStub({ data: [], error: null });
    const outcome = await loadLinksForAttachments(supabase(stub), []);
    expect(outcome.status).toBe("ok");
    expect(outcome.status === "ok" && outcome.list.items).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("still queries for a subject, because a subject with no links is an answer", async () => {
    // The mutation control for the case above: skipping the read here would
    // make "no links" indistinguishable from "not asked", and the section would
    // render its empty state without ever having looked.
    const { stub, calls } = linkStub({ data: [], error: null });
    await loadLinksForEntity(supabase(stub), "person", "person-1");
    expect(calls.length).toBeGreaterThan(0);
  });
});

describe("a failed read reaches the caller as failed", () => {
  it("says failed rather than returning an empty list", async () => {
    const { stub } = linkStub({ data: null, error: { message: "boom" } });
    expect((await loadLinksForEntity(supabase(stub), "person", "p")).status).toBe("failed");
    const page = linkStub({ data: null, error: { message: "boom" } });
    expect((await loadLinksForAttachments(supabase(page.stub), ["file-1"])).status).toBe("failed");
  });
});

describe("the loader module ships no writer", () => {
  it("exports exactly the two reads", async () => {
    const module = await import("./attachment-links");
    expect(Object.keys(module).sort()).toEqual(["loadLinksForAttachments", "loadLinksForEntity"]);
  });
});
