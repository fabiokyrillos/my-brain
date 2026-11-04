import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pendingEventCandidates } from "./entry-events";

const candidate = (title: string, extra: Record<string, unknown> = {}) => ({
  title,
  startsAt: "2026-12-12T15:00:00-03:00",
  endsAt: null,
  allDay: false,
  location: null,
  confidence: 0.9,
  explicit: true,
  ...extra,
});

describe("pendingEventCandidates — what a record still proposes for the agenda", () => {
  it("keeps each candidate's own index, so the confirmation names the right one", () => {
    expect(pendingEventCandidates([candidate("Dentista"), candidate("Viagem", { allDay: true })], new Set())
      .map((pending) => [pending.candidateIndex, pending.title, pending.allDay]))
      .toEqual([[0, "Dentista", false], [1, "Viagem", true]]);
  });

  it("drops a candidate that already became an event, without shifting the others", () => {
    expect(pendingEventCandidates([candidate("A"), candidate("B"), candidate("C")], new Set([1]))
      .map((pending) => pending.candidateIndex)).toEqual([0, 2]);
  });

  it("skips a malformed candidate and keeps the rest, and reads anything else as none", () => {
    expect(pendingEventCandidates([{ title: "" }, candidate("Ok")], new Set()).map((p) => p.candidateIndex)).toEqual([1]);
    expect(pendingEventCandidates(undefined, new Set())).toEqual([]);
    expect(pendingEventCandidates({}, new Set())).toEqual([]);
  });
});
