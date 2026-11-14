import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { birthdayProposals, loadEntryBirthdayProposals, statedBirthdays } from "./entry-birthdays";

const person = (name: string, birthday: unknown) => ({ name, confidence: 0.9, evidence: name, inferred: false, role: null, birthday });

describe("statedBirthdays — the dates a reading states", () => {
  it("keeps each candidate's index and only real dates", () => {
    expect(statedBirthdays([
      person("Ana", { month: 5, day: 5, year: null }),
      person("Bruno", null),
      person("Caio", { month: 4, day: 31, year: null }),
      person("Duda", { month: 2, day: 29, year: 2000 }),
    ])).toEqual([
      { candidateIndex: 0, name: "Ana", month: 5, day: 5, year: null },
      { candidateIndex: 3, name: "Duda", month: 2, day: 29, year: 2000 },
    ]);
  });

  it("reads a reading from before the field, or anything else, as none", () => {
    expect(statedBirthdays([{ name: "Ana", confidence: 0.9 }])).toEqual([]);
    expect(statedBirthdays(null)).toEqual([]);
    expect(statedBirthdays("Ana")).toEqual([]);
  });
});

describe("birthdayProposals — whose birthday, and only when they have none", () => {
  const rawPeople = [person("Ana", { month: 5, day: 5, year: null }), person("Bruno", { month: 1, day: 2, year: 1990 })];

  it("follows the owner's decision on the candidate first", () => {
    expect(birthdayProposals({
      rawPeople,
      resolutions: [{ candidate_index: 0, disposition: "confirmed", person_id: "p-ana" }],
      links: [],
      people: [{ id: "p-ana", name: "Ana Souza", birthday_month: null }],
    })).toEqual([{ personId: "p-ana", name: "Ana Souza", day: 5, month: 5, year: null }]);
  });

  it("falls back to a person link of the same reading, by mention or by name", () => {
    expect(birthdayProposals({
      rawPeople,
      resolutions: [],
      links: [{ entity_id: "p-ana", mention: "ana" }, { entity_id: "p-bruno", mention: "o irmão" }],
      people: [{ id: "p-ana", name: "Ana Souza", birthday_month: null }, { id: "p-bruno", name: "Bruno", birthday_month: null }],
    }).map((proposal) => proposal.personId)).toEqual(["p-ana", "p-bruno"]);
  });

  it("never offers one to a person who already has a birthday", () => {
    expect(birthdayProposals({
      rawPeople,
      resolutions: [{ candidate_index: 0, disposition: "confirmed", person_id: "p-ana" }],
      links: [],
      people: [{ id: "p-ana", name: "Ana", birthday_month: 7 }],
    })).toEqual([]);
  });

  it("ignores a rejected candidate, an unlinked one and a person it cannot read", () => {
    expect(birthdayProposals({
      rawPeople,
      resolutions: [{ candidate_index: 0, disposition: "rejected", person_id: null }],
      links: [{ entity_id: "p-gone", mention: "Bruno" }],
      people: [],
    })).toEqual([]);
  });

  it("offers each person once", () => {
    expect(birthdayProposals({
      rawPeople: [person("Ana", { month: 5, day: 5, year: null }), person("ana", { month: 5, day: 5, year: null })],
      resolutions: [],
      links: [{ entity_id: "p-ana", mention: "Ana" }],
      people: [{ id: "p-ana", name: "Ana", birthday_month: null }],
    })).toHaveLength(1);
  });
});

type Result = { data: unknown; error: unknown };

function fakeClient(tables: Record<string, Result>) {
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        const call = { table, filters: [] as [string, unknown][] };
        calls.push(call);
        const result = tables[table] ?? { data: [], error: null };
        const builder = {
          select: () => builder,
          eq: (column: string, value: unknown) => { call.filters.push([column, value]); return builder; },
          in: (column: string, value: unknown) => { call.filters.push([column, value]); return builder; },
          maybeSingle: () => Promise.resolve(result),
          then: (resolve: (value: Result) => unknown) => Promise.resolve(result).then(resolve),
        };
        return builder;
      },
    },
  };
}

describe("loadEntryBirthdayProposals", () => {
  const input = { userId: "u1", entryId: "e1", interpretationId: "i1" };

  it("reads the current reading, its decisions and links, and the people, under the owner", async () => {
    const { client, calls } = fakeClient({
      entry_interpretations: { data: { raw_output: { people: [person("Ana", { month: 5, day: 5, year: null })] } }, error: null },
      entry_person_candidate_resolutions: { data: [{ candidate_index: 0, disposition: "confirmed", person_id: "p-ana" }], error: null },
      entry_entities: { data: [], error: null },
      people: { data: [{ id: "p-ana", name: "Ana", birthday_month: null }], error: null },
    });
    const proposals = await loadEntryBirthdayProposals(client as never, input);
    expect(proposals).toEqual([{ personId: "p-ana", name: "Ana", day: 5, month: 5, year: null }]);
    for (const table of ["entry_person_candidate_resolutions", "entry_entities", "people"]) {
      expect(calls.find((call) => call.table === table)?.filters).toContainEqual(["user_id", "u1"]);
    }
  });

  it("stops before any other read when the reading states no birthday", async () => {
    const { client, calls } = fakeClient({
      entry_interpretations: { data: { raw_output: { people: [person("Ana", null)] } }, error: null },
    });
    expect(await loadEntryBirthdayProposals(client as never, input)).toEqual([]);
    expect(calls.map((call) => call.table)).toEqual(["entry_interpretations"]);
  });

  /*
   * Life Brain D.3 (ADR-167): "não, obrigado" is remembered. A decline is an
   * audit row naming the person and the date; the same date is not offered
   * again, on any device. A different date (a later record) still is.
   */
  it("does not offer a date the owner declined for that person", async () => {
    const { client, calls } = fakeClient({
      entry_interpretations: { data: { raw_output: { people: [person("Ana", { month: 5, day: 5, year: null }), person("Bia", { month: 6, day: 1, year: null })] } }, error: null },
      entry_person_candidate_resolutions: { data: [{ candidate_index: 0, disposition: "confirmed", person_id: "p-ana" }, { candidate_index: 1, disposition: "confirmed", person_id: "p-bia" }], error: null },
      entry_entities: { data: [], error: null },
      people: { data: [{ id: "p-ana", name: "Ana", birthday_month: null }, { id: "p-bia", name: "Bia", birthday_month: null }], error: null },
      audit_logs: { data: [
        { entity_id: "p-ana", after_state: { day: 5, month: 5 } },
        { entity_id: "p-bia", after_state: { day: 2, month: 6 } },
      ], error: null },
    });
    const proposals = await loadEntryBirthdayProposals(client as never, input);
    expect(proposals.map((proposal) => proposal.name)).toEqual(["Bia"]);
    const audit = calls.find((call) => call.table === "audit_logs")!;
    expect(audit.filters).toEqual(expect.arrayContaining([["user_id", "u1"], ["action_type", "birthday_offer_declined"], ["entity_type", "person"]]));
  });

  it("offers nothing when a read fails", async () => {
    const { client } = fakeClient({
      entry_interpretations: { data: { raw_output: { people: [person("Ana", { month: 5, day: 5, year: null })] } }, error: null },
      entry_person_candidate_resolutions: { data: null, error: { message: "boom" } },
    });
    expect(await loadEntryBirthdayProposals(client as never, input)).toEqual([]);
  });
});
