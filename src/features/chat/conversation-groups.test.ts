import { describe, expect, it } from "vitest";

import { filterGroups, groupConversations, type ConversationRow } from "./conversation-groups";
import { getChatSurfaceCopy } from "./surface-copy";

const labels = getChatSurfaceCopy("pt-BR").groups;
// 16 Nov 2026, 10:00 in São Paulo (13:00 UTC).
const now = new Date("2026-11-16T13:00:00Z");
const zone = "America/Sao_Paulo";

const row = (id: string, updated_at: string, title = id): ConversationRow => ({ id, title, updated_at });

describe("the conversations menu groups by when each was last active (Life Brain E.6)", () => {
  it("uses the owner's day, not UTC's", () => {
    // 01:30 UTC on the 17th is still the 16th in São Paulo.
    const groups = groupConversations([row("late", "2026-11-17T01:30:00Z")], new Date("2026-11-17T02:00:00Z"), zone, "pt-BR", labels);
    expect(groups.map((group) => group.key)).toEqual(["today"]);
  });

  it("places today, yesterday, the week, the month, then one group per month", () => {
    const groups = groupConversations(
      [
        row("a", "2026-11-16T12:00:00Z"),
        row("b", "2026-11-15T12:00:00Z"),
        row("c", "2026-11-12T12:00:00Z"),
        row("d", "2026-10-25T12:00:00Z"),
        row("e", "2026-10-02T12:00:00Z"),
        row("f", "2025-12-20T12:00:00Z"),
      ],
      now,
      zone,
      "pt-BR",
      labels,
    );
    expect(groups.map((group) => [group.label, group.items.map((item) => item.id)])).toEqual([
      ["Hoje", ["a"]],
      ["Ontem", ["b"]],
      ["Últimos 7 dias", ["c"]],
      ["Últimos 30 dias", ["d"]],
      ["Outubro", ["e"]],
      ["Dezembro de 2025", ["f"]],
    ]);
  });

  it("keeps a row with an unreadable time instead of dropping it", () => {
    const groups = groupConversations([row("x", "not a date")], now, zone, "pt-BR", labels);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["x"]);
    // And claims no time for it.
    expect(groups[0]?.items[0]?.when).toBeUndefined();
  });

  it("gives each row one caption: the hour for today, the day for any other, in the owner's zone", () => {
    const groups = groupConversations(
      [row("a", "2026-11-16T12:05:00Z"), row("b", "2026-11-15T01:30:00Z")],
      now,
      zone,
      "pt-BR",
      labels,
    );
    expect(groups[0]?.items[0]?.when).toEqual({ at: "2026-11-16T12:05:00Z", label: "09:05" });
    // 01:30 UTC on the 15th is the evening of the 14th in São Paulo.
    expect(groups[1]?.items[0]?.when?.label).toBe("14 de nov. de 2026");
  });

  it("falls back to UTC for an unknown zone rather than throwing", () => {
    expect(() => groupConversations([row("a", "2026-11-16T12:00:00Z")], now, "Not/AZone", "en", labels)).not.toThrow();
  });

  it("searches titles without case or accents, and drops empty groups", () => {
    const groups = groupConversations(
      [row("a", "2026-11-16T12:00:00Z", "Quando fui ao Médico?"), row("b", "2026-11-15T12:00:00Z", "Viagem")],
      now,
      zone,
      "pt-BR",
      labels,
    );
    expect(filterGroups(groups, "medico").map((group) => group.key)).toEqual(["today"]);
    expect(filterGroups(groups, "  ")).toBe(groups);
    expect(filterGroups(groups, "nada")).toEqual([]);
  });
});
