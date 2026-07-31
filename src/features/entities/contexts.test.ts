import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { loadContextOptions, loadContexts } = await import("./contexts");
const { loadOrganizationOptions, loadOrganizations } = await import("./organizations");

/**
 * The two loaders' **opposite failure contracts**, asserted rather than assumed.
 *
 * `loadContexts`/`loadOrganizations` back a list page, so a failed read must
 * throw: a page that renders "no contexts yet" because the query broke tells the
 * owner their data is gone. `loadContextOptions`/`loadOrganizationOptions` back
 * one optional control on somebody else's page, so a failed read degrades to an
 * empty list and the rest of the page keeps working.
 *
 * The pair is easy to get backwards, and getting it backwards is invisible until
 * the day the query fails — which is why both directions are tested here rather
 * than only the happy path.
 */

type Result = { data: unknown; error: unknown };

/** The list-page chain: `select → order → range`. */
function rangeStub(result: Result) {
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.order = vi.fn(() => stub);
  stub.range = vi.fn(async () => result);
  return stub as Record<string, ReturnType<typeof vi.fn>>;
}

/** The options chain: `select → order → limit`. */
function limitStub(result: Result) {
  const stub: Record<string, unknown> = {};
  stub.select = vi.fn(() => stub);
  stub.order = vi.fn(() => stub);
  stub.limit = vi.fn(async () => result);
  return stub as Record<string, ReturnType<typeof vi.fn>>;
}

function supabase(stub: Record<string, ReturnType<typeof vi.fn>>) {
  return { from: vi.fn(() => stub) } as never;
}

const row = (id: string, name: string) => ({
  id,
  name,
  description: null,
  kind: "work",
  updated_at: "2026-07-31T00:00:00.000Z",
});

describe("loadContexts", () => {
  it("returns the page's rows and whether another page exists", async () => {
    // 51 rows for a page size of 50: the 51st is the probe that answers
    // "is there a next page", and it must not be rendered as a row.
    const rows = Array.from({ length: 51 }, (_, index) => row(`c${index}`, `Context ${index}`));
    const stub = rangeStub({ data: rows, error: null });

    const result = await loadContexts(supabase(stub), 1);

    expect(result.items).toHaveLength(50);
    expect(result.hasNext).toBe(true);
    expect(stub.range).toHaveBeenCalledWith(0, 50);
  });

  it("asks for the requested page rather than always the first", async () => {
    const stub = rangeStub({ data: [], error: null });
    await loadContexts(supabase(stub), 3);
    expect(stub.range).toHaveBeenCalledWith(100, 150);
  });

  it("orders by name, because a context is looked up and not scanned", async () => {
    const stub = rangeStub({ data: [], error: null });
    await loadContexts(supabase(stub), 1);
    expect(stub.order).toHaveBeenCalledWith("name", { ascending: true });
  });

  it("throws on a failed read instead of rendering an empty list", async () => {
    const stub = rangeStub({ data: null, error: { message: "boom" } });
    await expect(loadContexts(supabase(stub), 1)).rejects.toThrow();
  });
});

describe("loadOrganizations", () => {
  it("returns the page's rows and whether another page exists", async () => {
    const rows = Array.from({ length: 51 }, (_, index) => row(`o${index}`, `Org ${index}`));
    const stub = rangeStub({ data: rows, error: null });

    const result = await loadOrganizations(supabase(stub), 1);

    expect(result.items).toHaveLength(50);
    expect(result.hasNext).toBe(true);
  });

  it("throws on a failed read instead of rendering an empty list", async () => {
    const stub = rangeStub({ data: null, error: { message: "boom" } });
    await expect(loadOrganizations(supabase(stub), 1)).rejects.toThrow();
  });
});

describe("the bounded options loaders", () => {
  it("carry the kind alongside the name, so two contexts sharing a name stay distinguishable", async () => {
    const stub = limitStub({
      data: [
        { id: "c1", name: "Pessoal", kind: "personal" },
        { id: "c2", name: "Pessoal", kind: "custom" },
      ],
      error: null,
    });

    const options = await loadContextOptions(supabase(stub));

    expect(options).toEqual([
      { id: "c1", name: "Pessoal", kind: "personal" },
      { id: "c2", name: "Pessoal", kind: "custom" },
    ]);
  });

  it("bound the option list at 200 rows, the same ceiling every other selector uses", async () => {
    const contexts = limitStub({ data: [], error: null });
    await loadContextOptions(supabase(contexts));
    expect(contexts.limit).toHaveBeenCalledWith(200);

    const organizations = limitStub({ data: [], error: null });
    await loadOrganizationOptions(supabase(organizations));
    expect(organizations.limit).toHaveBeenCalledWith(200);
  });

  it("degrade to an empty list rather than take a detail page down with them", async () => {
    const contexts = limitStub({ data: null, error: { message: "boom" } });
    await expect(loadContextOptions(supabase(contexts))).resolves.toEqual([]);

    const organizations = limitStub({ data: null, error: { message: "boom" } });
    await expect(loadOrganizationOptions(supabase(organizations))).resolves.toEqual([]);
  });
});
