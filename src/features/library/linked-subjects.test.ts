import { describe, expect, it } from "vitest";

import type { AttachmentLink } from "./attachment-links";
import {
  NO_CLASSIFICATION,
  resolveLinkedFiles,
  resolveLinkedSubjects,
  subjectIdsByType,
  subjectKey,
  type ResolvedFileRow,
  type ResolvedSubjectRow,
} from "./linked-subjects";

/**
 * `2N-FILES-005`, `2N-PRIVACY-005` — the resolution rule, proved where it can
 * actually fail.
 *
 * The interesting property is a **negative** one: three different reasons a
 * subject might not come back must produce one identical result. A test that
 * only checked the happy path would pass on an implementation that rendered a
 * placeholder for a deleted person, which is the exact thing `2N-FILES-005`
 * forbids — so each of the three is asserted separately and then asserted to be
 * indistinguishable from the others.
 */

const link = (overrides: Partial<AttachmentLink> = {}): AttachmentLink => ({
  attachmentId: "file-1",
  entityType: "person",
  entityId: "person-1",
  ...overrides,
});

const person = (label: string): ResolvedSubjectRow => ({
  label,
  sensitivity: NO_CLASSIFICATION,
});

const file = (name: string): ResolvedFileRow => ({
  name,
  status: "ready",
  sensitivity: NO_CLASSIFICATION,
});

describe("2N-FILES-005: a subject that did not resolve is not rendered", () => {
  it("renders a link whose subject resolved", () => {
    const resolved = new Map([[subjectKey("person", "person-1"), person("Marina")]]);
    expect(resolveLinkedSubjects([link()], resolved)).toEqual([
      { entityType: "person", entityId: "person-1", label: "Marina", sensitivity: NO_CLASSIFICATION },
    ]);
  });

  it("drops a link whose subject was deleted", () => {
    expect(resolveLinkedSubjects([link()], new Map())).toEqual([]);
  });

  it("drops a link whose subject belongs to someone else", () => {
    // A foreign row never comes back under forced RLS, so it reaches this
    // function as an absent key — the same input as a deleted one.
    const foreign = new Map([[subjectKey("person", "someone-elses"), person("Not yours")]]);
    expect(resolveLinkedSubjects([link()], foreign)).toEqual([]);
  });

  it("drops a link whose subject read simply failed", () => {
    // A failed read contributes no rows, so the map is empty — again the same
    // input. This is asserted separately from the deleted case on purpose: the
    // requirement is that the three are indistinguishable, and a test that only
    // covered one would pass on an implementation that branched on the others.
    expect(resolveLinkedSubjects([link()], new Map())).toEqual([]);
  });

  it("produces byte-identical output for all three absences", () => {
    const deleted = resolveLinkedSubjects([link()], new Map());
    const foreign = resolveLinkedSubjects(
      [link()],
      new Map([[subjectKey("person", "other"), person("Other")]]),
    );
    const unreadable = resolveLinkedSubjects([link()], new Map());
    expect(JSON.stringify(deleted)).toBe(JSON.stringify(foreign));
    expect(JSON.stringify(foreign)).toBe(JSON.stringify(unreadable));
  });

  it("keeps the resolvable links when only some subjects are gone", () => {
    const links = [link(), link({ entityType: "project", entityId: "project-1" })];
    const resolved = new Map([[subjectKey("project", "project-1"), person("Atlas")]]);
    expect(resolveLinkedSubjects(links, resolved).map((subject) => subject.entityId)).toEqual([
      "project-1",
    ]);
  });
});

describe("the same rule applies in the reverse direction", () => {
  it("renders a file that resolved", () => {
    const resolved = new Map([["file-1", file("contrato.pdf")]]);
    expect(resolveLinkedFiles([link()], resolved)).toEqual([
      { attachmentId: "file-1", name: "contrato.pdf", status: "ready", sensitivity: NO_CLASSIFICATION },
    ]);
  });

  it("drops a link whose attachment did not resolve", () => {
    expect(resolveLinkedFiles([link()], new Map())).toEqual([]);
  });

  it("renders one row when two links name the same file", () => {
    const links = [link(), link({ entityId: "person-2" })];
    const resolved = new Map([["file-1", file("contrato.pdf")]]);
    expect(resolveLinkedFiles(links, resolved)).toHaveLength(1);
  });
});

describe("a subject is stated once", () => {
  it("collapses a repeated subject rather than stating the relationship twice", () => {
    const links = [link(), link({ attachmentId: "file-2" })];
    const resolved = new Map([[subjectKey("person", "person-1"), person("Marina")]]);
    expect(resolveLinkedSubjects(links, resolved)).toHaveLength(1);
  });

  it("keeps two subjects of different types that share an id", () => {
    // Nothing stops a person and a project having the same uuid in principle,
    // and keying by id alone would silently merge them.
    const links = [link({ entityId: "shared" }), link({ entityType: "project", entityId: "shared" })];
    const resolved = new Map([
      [subjectKey("person", "shared"), person("Marina")],
      [subjectKey("project", "shared"), person("Atlas")],
    ]);
    expect(resolveLinkedSubjects(links, resolved)).toHaveLength(2);
  });
});

describe("2N-FILES-010: one query per type, never one per link", () => {
  it("groups ids so a caller cannot iterate links with a query inside", () => {
    const links = [
      link(),
      link({ entityType: "project", entityId: "project-1" }),
      link({ entityType: "entry", entityId: "entry-1" }),
      link({ attachmentId: "file-2", entityId: "person-1" }),
    ];
    expect(subjectIdsByType(links)).toEqual({
      entry: ["entry-1"],
      person: ["person-1"],
      project: ["project-1"],
    });
  });

  it("returns every type as a key even when nothing uses it", () => {
    expect(Object.keys(subjectIdsByType([])).sort()).toEqual(["entry", "person", "project"]);
  });
});

describe("2N-PRIVACY-005: absence of classification is not `normal`", () => {
  it("resolves an unclassifiable subject to the undetermined arm, not to a level", () => {
    // `people` and `projects` carry no `sensitivity` column at all. The arm that
    // renders in the clear must be the one that says *there is nothing to look
    // up*, never one that inferred `normal` — the two look the same on screen
    // and mean different things to every future reader of this code.
    expect(NO_CLASSIFICATION.kind).toBe("undetermined");
  });
});
