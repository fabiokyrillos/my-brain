import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { AREA_KINDS, LIFE_AREA_LIMIT, loadLifeAreas } = await import("./life-areas");

type Answer = { data: unknown; error: unknown };

function client(answer: Answer) {
  const calls: { method: string; args: unknown[] }[] = [];
  const chain = {
    select: (...args: unknown[]) => (calls.push({ method: "select", args }), chain),
    in: (...args: unknown[]) => (calls.push({ method: "in", args }), chain),
    order: (...args: unknown[]) => (calls.push({ method: "order", args }), chain),
    limit: (...args: unknown[]) => (calls.push({ method: "limit", args }), Promise.resolve(answer)),
  };
  const supabase = { from: (table: string) => (calls.push({ method: "from", args: [table] }), chain) };
  return { calls, supabase: supabase as unknown as Parameters<typeof loadLifeAreas>[0] };
}

describe("loadLifeAreas — the owner's areas of life, in the product's order", () => {
  it("asks for the area kinds only, never `other` and never the legacy kinds", async () => {
    const { calls, supabase } = client({ data: [], error: null });
    await loadLifeAreas(supabase);
    expect(calls[0]).toEqual({ method: "from", args: ["contexts"] });
    expect(calls.find((call) => call.method === "select")?.args[0]).toBe("id,name,kind");
    const kinds = calls.find((call) => call.method === "in")?.args[1] as string[];
    expect(kinds).toEqual([...AREA_KINDS]);
    expect(kinds).not.toContain("other");
    expect(kinds).not.toContain("personal");
    expect(kinds).not.toContain("custom");
    expect(kinds).toContain("work");
    expect(calls.find((call) => call.method === "limit")?.args[0]).toBe(LIFE_AREA_LIMIT + 1);
  });

  it("orders by area first (Saúde before Viagens before Ideias), then by name", async () => {
    const { supabase } = client({
      data: [
        { id: "i", name: "Ideias", kind: "ideas" },
        { id: "t", name: "Viagens", kind: "travel" },
        { id: "h2", name: "Terapia", kind: "health" },
        { id: "h1", name: "Saúde", kind: "health" },
      ],
      error: null,
    });
    const result = await loadLifeAreas(supabase);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.areas.map((area) => area.id)).toEqual(["h1", "h2", "t", "i"]);
    expect(result.bounded).toBe(false);
  });

  it("drops a row whose kind is not an area, whatever the database returned", async () => {
    const { supabase } = client({ data: [{ id: "x", name: "Pessoal", kind: "personal" }], error: null });
    const result = await loadLifeAreas(supabase);
    expect(result).toEqual({ status: "ok", areas: [], bounded: false });
  });

  it("says it is bounded when the read returned more than it shows", async () => {
    const data = Array.from({ length: LIFE_AREA_LIMIT + 1 }, (_, index) => ({ id: `c${index}`, name: `Área ${index}`, kind: "home" }));
    const { supabase } = client({ data, error: null });
    const result = await loadLifeAreas(supabase);
    expect(result.status === "ok" && result.areas.length).toBe(LIFE_AREA_LIMIT);
    expect(result.status === "ok" && result.bounded).toBe(true);
  });

  it("reports a failed read as failed, never as no areas", async () => {
    const { supabase } = client({ data: null, error: { code: "42501" } });
    expect(await loadLifeAreas(supabase)).toEqual({ status: "failed" });
  });
});
