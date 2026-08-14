/**
 * `2N-PRIVACY-001` … `2N-PRIVACY-011` — the derivation's own proofs.
 *
 * Structured around the three failures the requirements name, rather than around
 * the module's functions: absence read as `normal`, an interface that
 * distinguishes *why* a row is missing, and a list and a detail drifting apart.
 */

import { describe, expect, it } from "vitest";

import { GOVERNED_SURFACES, presentationFor, type SensitivityLevel } from "./contracts";
import {
  deriveFreeTextSensitivity,
  deriveSubjectSensitivity,
  readableLevelsOf,
  resolveFileContent,
  resolveGraphContent,
  resolveMemoryContent,
  resolvePersonContent,
  resolveProjectContent,
} from "./subject-derivation";
import { deriveTaskSensitivity, isDerivedLevel } from "./task-derivation";

const RESOLVERS = {
  person: resolvePersonContent,
  project: resolveProjectContent,
  memory: resolveMemoryContent,
  file: resolveFileContent,
} as const;

const SURFACES = ["person", "project", "memory", "file"] as const;

describe("2N-PRIVACY-001: the four contextual surfaces are governed", () => {
  it.each(SURFACES)("%s is in GOVERNED_SURFACES", (surface) => {
    expect(GOVERNED_SURFACES).toContain(surface);
  });

  it("masks highly_sensitive and shows the other two on every one of them", () => {
    for (const surface of SURFACES) {
      expect(presentationFor(surface, "normal").outcome).toBe("show");
      expect(presentationFor(surface, "private").outcome).toBe("show");
      expect(presentationFor(surface, "highly_sensitive").outcome).toBe("mask");
    }
  });

  it("never drops a row — mask is the only withholding outcome these surfaces use", () => {
    // `2N-PRIVACY-005`: masked in position, not dropped. `omit` would remove the
    // row, which is the posture only a notification payload is allowed.
    for (const surface of SURFACES) {
      for (const level of ["normal", "private", "highly_sensitive"] as const) {
        expect(presentationFor(surface, level).outcome).not.toBe("omit");
      }
    }
  });

  it("admits `graph`, and only because slice 2N.6 ships its consumer with it", () => {
    /*
     * Inverted rather than deleted, which is the move this repository already
     * uses when a reserved thing arrives (`phase-2n-declarations.test.ts` was
     * inverted the same way at 2N's implementation gate).
     *
     * Until 2N.6 this asserted the **absence** of `graph`, because
     * `2N-PRIVACY-001` admits a surface only in the change that ships its first
     * governed consumer, and a governed surface nobody reads is the
     * producer-with-no-consumer failure. 2N.6 ships that consumer — a
     * relationship's own sentence, resolved by `resolveGraphContent` — so the
     * assertion becomes the positive half, and the negative half is asserted by
     * naming the resolver rather than by trusting the surface list.
     */
    expect(GOVERNED_SURFACES).toContain("graph");
    expect(resolveGraphContent(deriveFreeTextSensitivity(), "k")).toEqual({
      show: false,
      masked: true,
      revealable: true,
    });
  });

  it("keeps `graph` masking free text by default, and revealing it only on request", () => {
    // The whole reason `graph` needed a rule: `person_relationships.description`
    // has no classification and no classifiable source, so it takes ADR-110
    // Decision 4's posture — protective by default, local and explicit reveal.
    expect(resolveGraphContent(deriveFreeTextSensitivity(), "k", { revealed: new Set(["k"]) })).toEqual({
      show: true,
      masked: false,
      revealable: true,
    });
  });
});

describe("2N-PRIVACY-005: absence is never read as `normal`", () => {
  it("resolves an unreadable subject to the most protective level", () => {
    const derived = deriveSubjectSensitivity("entry-1", new Map());
    expect(derived).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("resolves a subject with no classified row at all to `undetermined`", () => {
    for (const absent of [null, undefined, ""]) {
      expect(deriveSubjectSensitivity(absent, new Map())).toEqual({ kind: "undetermined" });
    }
  });

  it("gives `undetermined` no level field to misread", () => {
    const value = deriveSubjectSensitivity(null, new Map());
    expect(isDerivedLevel(value)).toBe(false);
    expect(value).not.toHaveProperty("level");
  });

  it("fails closed on a null classification on a row it DID read", () => {
    // The row came back; its column is null. That is not `normal`.
    const levels = new Map<string, string | null>([["memory-1", null]]);
    expect(deriveSubjectSensitivity("memory-1", levels)).toEqual({
      kind: "derived",
      level: "highly_sensitive",
    });
  });

  it("fails closed on a value outside the closed vocabulary", () => {
    const levels = new Map<string, string | null>([["file-1", "confidential"]]);
    expect(deriveSubjectSensitivity("file-1", levels)).toEqual({
      kind: "derived",
      level: "highly_sensitive",
    });
  });

  it.each(["normal", "private", "highly_sensitive"] as const)(
    "carries a readable level through unchanged: %s",
    (level) => {
      const levels = new Map<string, string | null>([["entry-1", level]]);
      expect(deriveSubjectSensitivity("entry-1", levels)).toEqual({ kind: "derived", level });
    },
  );
});

describe("2N-PRIVACY-005: removed, foreign and unreadable are indistinguishable", () => {
  it("produces byte-identical answers for all three, because all three are one input", () => {
    // The three cases cannot be constructed differently: each is *absent from
    // the map*. This asserts the property by showing there is no third thing to
    // pass — a branch that could tell them apart would need an input this
    // signature cannot express.
    const removed = deriveSubjectSensitivity("was-deleted", new Map());
    const foreign = deriveSubjectSensitivity("belongs-to-someone-else", new Map());
    const unreadable = deriveSubjectSensitivity("read-failed", new Map());
    expect(removed).toEqual(foreign);
    expect(foreign).toEqual(unreadable);
  });

  it("renders the same for all three, on every surface", () => {
    for (const surface of SURFACES) {
      const resolve = RESOLVERS[surface];
      const outcomes = ["was-deleted", "belongs-to-someone-else", "read-failed"].map((id) =>
        resolve(deriveSubjectSensitivity(id, new Map()), id),
      );
      expect(outcomes[0]).toEqual(outcomes[1]);
      expect(outcomes[1]).toEqual(outcomes[2]);
      expect(outcomes[0]).toEqual({ show: false, masked: true, revealable: true });
    }
  });
});

describe("2N-PRIVACY-009: people.notes is masked by default and cannot be inferred", () => {
  it("resolves to the most protective level", () => {
    expect(deriveFreeTextSensitivity()).toEqual({ kind: "derived", level: "highly_sensitive" });
  });

  it("is NOT `undetermined`, which is the arm that renders in the clear", () => {
    // The negative control that matters most in this file. `undetermined` and
    // "masked by default" are both absences, and picking the wrong one publishes
    // the note.
    const notes = deriveFreeTextSensitivity();
    expect(notes).not.toEqual({ kind: "undetermined" });
    expect(isDerivedLevel(notes)).toBe(true);
    expect(resolvePersonContent(notes, "notes")).toEqual({
      show: false,
      masked: true,
      revealable: true,
    });
  });

  it("accepts no argument, so no caller can hand it the note's text", () => {
    // ADR-110 Decision 7 forbids inferring a level from a note's text. A rule
    // enforced by a signature that cannot accept the text is stronger than one
    // enforced by callers remembering not to pass it.
    expect(deriveFreeTextSensitivity.length).toBe(0);
  });

  it("answers the same for every note, because the fact is constant", () => {
    expect(deriveFreeTextSensitivity()).toEqual(deriveFreeTextSensitivity());
  });

  it("stays masked after a reveal of a DIFFERENT key", () => {
    // One reveal must not leak into another item.
    const revealed = { revealed: new Set(["some-other-item"]) };
    expect(resolvePersonContent(deriveFreeTextSensitivity(), "notes", revealed)).toEqual({
      show: false,
      masked: true,
      revealable: true,
    });
  });

  it("is revealable locally by its own key, and only its own", () => {
    const revealed = { revealed: new Set(["notes"]) };
    expect(resolvePersonContent(deriveFreeTextSensitivity(), "notes", revealed)).toEqual({
      show: true,
      masked: false,
      revealable: true,
    });
  });
});

describe("2N-PRIVACY-001: listing and detail converge by construction", () => {
  it("gives one subject the same answer on every surface that renders it", () => {
    // A memory appears on the person page, on the memories list and on its own
    // detail. `2N-PRIVACY-002` requires the same posture in all three; the rule
    // is data, so this is true by construction rather than by inspection.
    const levels = new Map<string, string | null>([["memory-1", "highly_sensitive"]]);
    const sensitivity = deriveSubjectSensitivity("memory-1", levels);
    const answers = SURFACES.map((surface) => RESOLVERS[surface](sensitivity, "memory-1"));
    for (const answer of answers) expect(answer).toEqual(answers[0]);
  });

  it("gives a task and a subject the same answer for the same level on one surface", () => {
    // The person page renders both kinds. Two derivations feeding one rule must
    // not produce two postures for one level.
    const task = deriveTaskSensitivity("entry-1", new Map([["entry-1", "highly_sensitive"]]));
    const subject = deriveSubjectSensitivity("entry-1", new Map([["entry-1", "highly_sensitive"]]));
    expect(resolvePersonContent(task, "k")).toEqual(resolvePersonContent(subject, "k"));
  });

  it("shows `undetermined` without ever consulting a rule for `normal`", () => {
    for (const surface of SURFACES) {
      expect(RESOLVERS[surface]({ kind: "undetermined" }, "k")).toEqual({
        show: true,
        masked: false,
        revealable: false,
      });
    }
  });
});

describe("readableLevelsOf builds the map one way for every surface", () => {
  it("keeps a row it read, including a null classification", () => {
    const map = readableLevelsOf([{ id: "a", sensitivity: "private" }, { id: "b", sensitivity: null }]);
    expect(map.get("a")).toBe("private");
    expect(map.has("b")).toBe(true);
    expect(map.get("b")).toBeNull();
  });

  it("does NOT default a missing classification to normal on the way in", () => {
    // The quiet fail-open this helper exists to prevent: a surface assembling
    // the map inline could write `?? "normal"` and every guard downstream would
    // still pass.
    const map = readableLevelsOf([{ id: "a" }]);
    expect(map.get("a")).not.toBe("normal");
    expect(deriveSubjectSensitivity("a", map)).toEqual({
      kind: "derived",
      level: "highly_sensitive",
    });
  });

  it("skips a row with no usable id, leaving it absent and therefore protected", () => {
    const map = readableLevelsOf([{ id: null, sensitivity: "normal" }, { id: "", sensitivity: "normal" }]);
    expect(map.size).toBe(0);
  });

  it("treats null and undefined row sets as empty rather than throwing", () => {
    expect(readableLevelsOf(null).size).toBe(0);
    expect(readableLevelsOf(undefined).size).toBe(0);
  });
});

describe("mutation controls: the assertions above fail when the rule is wrong", () => {
  /*
   * Each of these executes the failure the guard above is meant to catch, on a
   * local stand-in, and proves the comparison rejects it. Without these, a test
   * that asserted the wrong thing would pass forever.
   */

  it("a fail-OPEN derivation would be caught by the unreadable-subject assertion", () => {
    const failOpen = (
      id: string | null,
      levels: ReadonlyMap<string, string | null>,
    ): { kind: "derived"; level: SensitivityLevel } | { kind: "undetermined" } =>
      id && levels.has(id)
        ? { kind: "derived", level: (levels.get(id) as SensitivityLevel) ?? "normal" }
        : { kind: "derived", level: "normal" };
    const wrong = failOpen("entry-1", new Map());
    expect(wrong).not.toEqual(deriveSubjectSensitivity("entry-1", new Map()));
    expect(wrong.kind === "derived" ? wrong.level : null).toBe("normal");
  });

  it("collapsing `undetermined` into `normal` would be caught", () => {
    const collapsed = { kind: "derived", level: "normal" } as const;
    expect(collapsed).not.toEqual(deriveSubjectSensitivity(null, new Map()));
  });

  it("treating notes as `undetermined` would be caught", () => {
    const wrong = { kind: "undetermined" } as const;
    expect(wrong).not.toEqual(deriveFreeTextSensitivity());
    // And the rendered consequence differs, which is the part that matters.
    expect(resolvePersonContent(wrong, "notes").show).toBe(true);
    expect(resolvePersonContent(deriveFreeTextSensitivity(), "notes").show).toBe(false);
  });

  it("a surface that dropped sensitive rows would produce a count the mask does not", () => {
    // `2N-PRIVACY-004`. Masking keeps the row; excluding it changes the length.
    const rows = [
      { id: "a", sensitivity: "normal" },
      { id: "b", sensitivity: "highly_sensitive" },
    ];
    const levels = readableLevelsOf(rows);
    const masked = rows.filter((row) => {
      const answer = resolvePersonContent(deriveSubjectSensitivity(row.id, levels), row.id);
      return answer.show || answer.masked;
    });
    const dropped = rows.filter(
      (row) => resolvePersonContent(deriveSubjectSensitivity(row.id, levels), row.id).show,
    );
    expect(masked).toHaveLength(2);
    expect(dropped).toHaveLength(1);
  });
});
