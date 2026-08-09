import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireUser } from "@/lib/auth/require-user";

import { serializeContinuityHandle, type ContinuityHandle } from "./continuity";
import { resumeConversationCard } from "./resume";

/**
 * `2K-CONT-004` … `2K-CONT-008` — what a return actually produces.
 *
 * The guard proves the module's *shape*: no mutations, three tables, an
 * explicit owner predicate, a freshly minted clock. This proves the
 * **behaviour** ADR-100 requires, and in particular the two branches that are
 * easiest to get wrong:
 *
 *   - an **unchanged** object still requires a fresh confirmation, and is
 *     rendered as normal rather than as an error;
 *   - the three unreadable causes produce **byte-identical** output.
 */

// The module is `server-only` deliberately (it is not a Server Action and must
// not become a client-callable endpoint), so the marker is stubbed here the way
// every other server-only module in this repository is tested.
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONVERSATION = "22222222-2222-4222-8222-222222222222";
const MESSAGE = "33333333-3333-4333-8333-333333333333";
const OBJECT = "44444444-4444-4444-8444-444444444444";

const handle: ContinuityHandle = {
  v: "2026-08-09.1",
  c: CONVERSATION,
  m: MESSAGE,
  t: "entry",
  o: OBJECT,
};

type Row = { data: unknown; error: { message: string } | null };

/** One stub per table, each answering `maybeSingle` with what the test set. */
function client(rows: Record<string, Row>) {
  const predicates: Record<string, Array<[string, unknown]>> = {};
  const mutations: string[] = [];
  return {
    supabase: {
      from: vi.fn((table: string) => {
        predicates[table] ??= [];
        const stub: Record<string, unknown> = {};
        stub.select = vi.fn(() => stub);
        stub.eq = vi.fn((column: string, value: unknown) => {
          predicates[table]!.push([column, value]);
          return stub;
        });
        for (const write of ["insert", "update", "upsert", "delete"]) {
          stub[write] = vi.fn(() => { mutations.push(`${table}.${write}`); return stub; });
        }
        stub.maybeSingle = vi.fn(async () => rows[table] ?? { data: null, error: null });
        return stub;
      }),
      rpc: vi.fn(() => { mutations.push("rpc"); return { data: null, error: null }; }),
    },
    user: { id: USER_ID },
    predicates,
    mutations,
  };
}

const presentMessage: Row = { data: { id: MESSAGE }, error: null };

beforeEach(() => vi.mocked(requireUser).mockReset());

describe("2K-CONT-004/005: returning re-derives, with a new clock", () => {
  it("returns a freshly derived card and a fresh clock", async () => {
    const stub = client({
      conversation_messages: presentMessage,
      entries: { data: { id: OBJECT, original_content: "o contrato da Aurora", sensitivity: "private" }, error: null },
    });
    vi.mocked(requireUser).mockResolvedValue(stub as never);

    const before = Date.now();
    const resumed = await resumeConversationCard(serializeContinuityHandle(handle), "pt-BR");
    expect(resumed).not.toBeNull();
    if (resumed === null) return;

    expect(resumed.card.state).toBe("previewed");
    expect(resumed.card.snippet).toBe("o contrato da Aurora");
    expect(resumed.card.sensitivity).toBe("private");
    expect(resumed.card.href).toBe(`/pt-BR/app/inbox/${OBJECT}`);
    // The clock is minted on the return. Nothing carried it across the
    // navigation, and nothing could: the handle has no field for one.
    expect(Date.parse(resumed.issuedAt)).toBeGreaterThanOrEqual(before);
  });

  it("always requires a fresh confirmation, in every branch", async () => {
    /*
     * ADR-100: there is no "unchanged object" shortcut. Asserted across the
     * three shapes a return can take — object readable, object unreadable, and
     * a memory rather than an entry — because "always" is the requirement and a
     * single case would only prove "sometimes".
     *
     * The field's *type* is the literal `true`, so no branch could set it false
     * and still compile; these assertions are what proves the branches exist
     * and reach it.
     */
    const cases: Array<Record<string, Row>> = [
      {
        conversation_messages: presentMessage,
        entries: { data: { id: OBJECT, original_content: "x", sensitivity: "normal" }, error: null },
      },
      { conversation_messages: presentMessage, entries: { data: null, error: null } },
      {
        conversation_messages: presentMessage,
        memories: { data: { id: OBJECT, content: "x", sensitivity: "normal" }, error: null },
      },
    ];
    for (const [index, rows] of cases.entries()) {
      const stub = client(rows);
      vi.mocked(requireUser).mockResolvedValue(stub as never);
      const resumed = await resumeConversationCard(
        serializeContinuityHandle(index === 2 ? { ...handle, t: "memory" } : handle),
        "pt-BR",
      );
      expect(resumed?.requiresFreshConfirmation, `case ${index}`).toBe(true);
    }
  });

  it("reads under the owner's own predicate on every table it touches", async () => {
    const stub = client({
      conversation_messages: presentMessage,
      entries: { data: { id: OBJECT, original_content: "x", sensitivity: "normal" }, error: null },
    });
    vi.mocked(requireUser).mockResolvedValue(stub as never);
    await resumeConversationCard(serializeContinuityHandle(handle), "pt-BR");

    for (const table of ["conversation_messages", "entries"]) {
      expect(stub.predicates[table], table).toContainEqual(["user_id", USER_ID]);
    }
  });

  it("writes nothing at all", async () => {
    const stub = client({
      conversation_messages: presentMessage,
      entries: { data: { id: OBJECT, original_content: "x", sensitivity: "normal" }, error: null },
    });
    vi.mocked(requireUser).mockResolvedValue(stub as never);
    await resumeConversationCard(serializeContinuityHandle(handle), "pt-BR");
    expect(stub.mutations).toEqual([]);
  });
});

describe("2K-CONT-008: the three unreadable causes are byte-identical", () => {
  async function resumeWith(entries: Row) {
    const stub = client({ conversation_messages: presentMessage, entries });
    vi.mocked(requireUser).mockResolvedValue(stub as never);
    const resumed = await resumeConversationCard(serializeContinuityHandle(handle), "pt-BR");
    return resumed === null ? null : JSON.stringify(resumed.card);
  }

  it("produces one shape for deleted, foreign and unreadable", async () => {
    // Deleted → no row. Foreign → RLS filters it, which is also no row. A read
    // that errored → an error. All three must be the same output, because a
    // difference between them is an existence oracle.
    const deleted = await resumeWith({ data: null, error: null });
    const foreign = await resumeWith({ data: null, error: null });
    const errored = await resumeWith({ data: null, error: { message: "permission denied" } });

    expect(deleted).toBe(foreign);
    expect(deleted).toBe(errored);
    expect(deleted).toContain('"state":"unavailable"');
    expect(deleted).toContain('"objectId":null');
    expect(deleted).toContain('"snippet":null');
    expect(deleted).toContain('"href":null');
  });

  it("still restores the position, because the position is the user's own", async () => {
    const stub = client({ conversation_messages: presentMessage, entries: { data: null, error: null } });
    vi.mocked(requireUser).mockResolvedValue(stub as never);
    const resumed = await resumeConversationCard(serializeContinuityHandle(handle), "pt-BR");
    expect(resumed?.anchor).toBe(`message-${MESSAGE}`);
  });
});

describe("2K-CONT-002: a handle that names no real position restores nothing", () => {
  it("returns null when the message is not in the conversation it claims", async () => {
    const stub = client({ conversation_messages: { data: null, error: null } });
    vi.mocked(requireUser).mockResolvedValue(stub as never);
    expect(await resumeConversationCard(serializeContinuityHandle(handle), "pt-BR")).toBeNull();
  });

  it("returns null for a malformed handle, without reading anything", async () => {
    const stub = client({});
    vi.mocked(requireUser).mockResolvedValue(stub as never);
    expect(await resumeConversationCard("not-a-handle", "pt-BR")).toBeNull();
    // Parsed before authenticating: a mangled link costs no round trip.
    expect(stub.supabase.from).not.toHaveBeenCalled();
  });
});

describe("2K-CONT-004: a memory reference resumes read-only", () => {
  it("carries no mutating control even though a memory card may mutate", async () => {
    const stub = client({
      conversation_messages: presentMessage,
      memories: { data: { id: OBJECT, content: "prefiro manhãs", sensitivity: "normal" }, error: null },
    });
    vi.mocked(requireUser).mockResolvedValue(stub as never);
    const resumed = await resumeConversationCard(
      serializeContinuityHandle({ ...handle, t: "memory" }),
      "en",
    );
    expect(resumed?.card.mutability).toBe("read_only");
    expect(resumed?.card.href).toBe(`/en/app/memories/${OBJECT}`);
  });
});
