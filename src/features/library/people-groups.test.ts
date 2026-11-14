import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { groupPeopleByArea, loadPeopleAreaMentions } from "./people-groups";

/**
 * Life Brain D.2 (T3, V2 0:50: "as pessoas deveriam estar mais organizadas ou
 * categorizadas. Assim só tá uma lista grande"). Grouped by the area of life
 * the owner's own records file them under — data the product already has.
 */

const person = (id: string, name: string) => ({ id, name });
const FAMILIA = { id: "a-fam", name: "Família", kind: "family" };
const SAUDE = { id: "a-sau", name: "Saúde", kind: "health" };

describe("groupPeopleByArea", () => {
  it("files each person under the area they are mentioned in most, keeping the list's order inside a group", () => {
    const groups = groupPeopleByArea(
      [person("p1", "Camila"), person("p2", "Dr. Paulo"), person("p3", "Ana"), person("p4", "Zé")],
      {
        areas: [FAMILIA, SAUDE],
        mentions: [
          { personId: "p1", areaId: "a-fam" }, { personId: "p1", areaId: "a-fam" }, { personId: "p1", areaId: "a-sau" },
          { personId: "p2", areaId: "a-sau" },
          { personId: "p3", areaId: "a-fam" },
        ],
      },
    );
    expect(groups.map((group) => [group.area?.name ?? null, group.people.map((p) => p.name)])).toEqual([
      ["Família", ["Camila", "Ana"]],
      ["Saúde", ["Dr. Paulo"]],
      [null, ["Zé"]],
    ]);
  });

  it("breaks a tie by the area's name, so the same data always groups the same way", () => {
    const groups = groupPeopleByArea([person("p1", "Camila")], {
      areas: [SAUDE, FAMILIA],
      mentions: [{ personId: "p1", areaId: "a-sau" }, { personId: "p1", areaId: "a-fam" }],
    });
    expect(groups[0].area?.name).toBe("Família");
  });

  it("orders groups by size, and the people with no area always last", () => {
    const groups = groupPeopleByArea(
      [person("p1", "A"), person("p2", "B"), person("p3", "C"), person("p4", "D")],
      { areas: [FAMILIA, SAUDE], mentions: [{ personId: "p2", areaId: "a-sau" }, { personId: "p3", areaId: "a-sau" }, { personId: "p4", areaId: "a-fam" }] },
    );
    expect(groups.map((group) => group.area?.name ?? null)).toEqual(["Saúde", "Família", null]);
  });

  it("is one ungrouped list when nothing could be read", () => {
    const groups = groupPeopleByArea([person("p1", "A")], null);
    expect(groups).toEqual([{ area: null, people: [person("p1", "A")] }]);
  });
});

/** A recording fake: each `from(table)` answers the next queued result. */
function fake(results: Record<string, unknown[]>) {
  const calls: Array<[string, string, unknown[]]> = [];
  let table = "";
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "in", "is", "limit"]) {
    chain[name] = (...args: unknown[]) => {
      calls.push([table, name, args]);
      return chain;
    };
  }
  const client = {
    from: (name: string) => {
      table = name;
      calls.push([name, "from", []]);
      return chain;
    },
  };
  const queue = Object.fromEntries(Object.entries(results).map(([key, value]) => [key, [...value]]));
  (chain as { then: unknown }).then = (resolve: (value: unknown) => void) => {
    const key = calls.filter(([, name]) => name === "from").at(-1)![0] + ":" + (calls.filter(([t, name, args]) => t === table && name === "eq" && args[0] === "entity_type").at(-1)?.[2][1] ?? "");
    const next = (queue[key] ?? queue[table] ?? []).shift();
    resolve(next ?? { data: [], error: null });
  };
  return { client: client as never, calls };
}

describe("loadPeopleAreaMentions", () => {
  it("counts only current readings, never a highly sensitive record, and only area contexts", async () => {
    const { client, calls } = fake({
      "entry_entities:person": [{ data: [
        { entity_id: "p1", entry_id: "e1", interpretation_id: "i1" },
        { entity_id: "p1", entry_id: "e2", interpretation_id: "i2-old" },
        { entity_id: "p2", entry_id: "e3", interpretation_id: "i3" },
      ], error: null }],
      entries: [{ data: [
        { id: "e1", current_interpretation_id: "i1", sensitivity: "normal" },
        { id: "e2", current_interpretation_id: "i2-new", sensitivity: "normal" },
        { id: "e3", current_interpretation_id: "i3", sensitivity: "highly_sensitive" },
      ], error: null }],
      "entry_entities:context": [{ data: [{ interpretation_id: "i1", entity_id: "a-fam" }, { interpretation_id: "i1", entity_id: "c-project-ish" }], error: null }],
      person_contexts: [{ data: [], error: null }],
      contexts: [{ data: [{ id: "a-fam", name: "Família", kind: "family" }], error: null }],
    });

    const result = await loadPeopleAreaMentions(client, "u1", ["p1", "p2"]);
    expect(result).toEqual({ areas: [{ id: "a-fam", name: "Família", kind: "family" }], mentions: [{ personId: "p1", areaId: "a-fam" }] });
    // Every read names the owner.
    for (const table of ["entry_entities", "entries", "contexts", "person_contexts"]) {
      expect(calls.some(([t, name, args]) => t === table && name === "eq" && args[0] === "user_id" && args[1] === "u1"), `${table} not owner-scoped`).toBe(true);
    }
  });

  it("answers null when a read fails, so the page shows the plain list", async () => {
    const { client } = fake({ "entry_entities:person": [{ data: null, error: { message: "x" } }] });
    expect(await loadPeopleAreaMentions(client, "u1", ["p1"])).toBeNull();
  });
});
