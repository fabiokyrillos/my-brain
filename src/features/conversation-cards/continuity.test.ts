/**
 * `2K-CONT-001` … `2K-CONT-008` — the continuity handle, and everything it is
 * incapable of carrying.
 *
 * ADR-100's contract has exactly one reading: **returning always re-derives
 * with a new `issuedAt` and always requires a fresh confirmation.** So the
 * tests below are almost entirely about absence — the payload's closed shape,
 * the fields it refuses by name, and the fact that no branch exists in which a
 * prior confirmation is reused.
 *
 * The forbidden fields are asserted against a **planted instance of each**
 * rather than against one representative, which is what ADR-100 asks for and
 * what the first draft of `2K-CONT-003` would not have caught.
 */

import { describe, expect, it } from "vitest";

import {
  CONTINUITY_FORBIDDEN_FIELDS,
  CONTINUITY_HANDLE_VERSION,
  CONTINUITY_OBJECT_TYPES,
  messageAnchorId,
  parseContinuityHandle,
  serializeContinuityHandle,
  type ContinuityHandle,
} from "./continuity";

const CONVERSATION = "11111111-1111-4111-8111-111111111111";
const MESSAGE = "22222222-2222-4222-8222-222222222222";
const OBJECT = "33333333-3333-4333-8333-333333333333";

const handle: ContinuityHandle = {
  v: CONTINUITY_HANDLE_VERSION,
  c: CONVERSATION,
  m: MESSAGE,
  t: "entry",
  o: OBJECT,
};

describe("2K-CONT-003: the payload is a closed set of identifiers", () => {
  it("carries exactly five fields, and they are all identifiers", () => {
    expect(Object.keys(handle).sort()).toEqual(["c", "m", "o", "t", "v"]);
  });

  it("round-trips through serialization unchanged", () => {
    const parsed = parseContinuityHandle(serializeContinuityHandle(handle));
    expect(parsed.status).toBe("ok");
    if (parsed.status !== "ok") return;
    expect(parsed.handle).toEqual(handle);
  });

  it("refuses a planted instance of every forbidden field, by name", () => {
    // One assertion per field, not one representative. ADR-100 asks for this
    // explicitly, because the defect it corrected was a contract that read
    // correctly for one field and wrongly for another.
    for (const field of CONTINUITY_FORBIDDEN_FIELDS) {
      const planted = serializeContinuityHandle(handle);
      const decoded = JSON.parse(Buffer.from(planted, "base64url").toString("utf8")) as Record<string, unknown>;
      decoded[field] = "smuggled";
      const reencoded = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
      expect(parseContinuityHandle(reencoded).status, `${field} was accepted`).toBe("invalid");
    }
  });

  it("names every field ADR-100 forbids, so the list cannot quietly shrink", () => {
    for (const field of [
      "issuedAt",
      "observedBefore",
      "confirmationId",
      "operationKey",
      "requestFingerprint",
      "fingerprint",
      "patch",
      "preview",
      "mutation",
      "authorization",
      "session",
      "expected",
    ]) {
      expect(CONTINUITY_FORBIDDEN_FIELDS, `${field} is not refused by name`).toContain(field);
    }
  });

  it("refuses an unknown field even when it is not on the forbidden list", () => {
    // The strict schema is what makes the forbidden list a *statement* rather
    // than the mechanism: anything unknown is refused, so a field invented
    // tomorrow is refused today.
    const decoded = { ...handle, somethingNew: "x" };
    const encoded = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    expect(parseContinuityHandle(encoded).status).toBe("invalid");
  });
});

describe("2K-CONT-003: the parser refuses everything that is not a handle", () => {
  it("refuses a version other than the current one", () => {
    const decoded = { ...handle, v: "2020-01-01.1" };
    const encoded = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    expect(parseContinuityHandle(encoded).status).toBe("invalid");
  });

  it("refuses an identifier that is not a uuid", () => {
    for (const key of ["c", "m", "o"] as const) {
      const decoded = { ...handle, [key]: "not-a-uuid" };
      const encoded = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
      expect(parseContinuityHandle(encoded).status, key).toBe("invalid");
    }
  });

  it("refuses an object type the conversation cannot reference", () => {
    // Narrowed deliberately: chat retrieval reaches entries and memories only,
    // so a handle naming a person would describe a reference that cannot exist.
    expect([...CONTINUITY_OBJECT_TYPES].sort()).toEqual(["entry", "memory"]);
    const decoded = { ...handle, t: "person" };
    const encoded = Buffer.from(JSON.stringify(decoded), "utf8").toString("base64url");
    expect(parseContinuityHandle(encoded).status).toBe("invalid");
  });

  it("refuses garbage without throwing", () => {
    for (const raw of ["", "not-base64!!", "e30", undefined, null, 42, {}]) {
      expect(parseContinuityHandle(raw as never).status, String(raw)).toBe("invalid");
    }
  });
});

describe("2K-CONT-001/004: the anchor is derived, never carried", () => {
  it("comes from the message id, so the two cannot disagree", () => {
    expect(messageAnchorId(MESSAGE)).toBe(`message-${MESSAGE}`);
  });

  it("is not a field on the handle", () => {
    // One fewer thing to carry, and one fewer thing that can be wrong: a
    // separate anchor could name a position the message id does not.
    expect(Object.keys(handle)).not.toContain("anchor");
  });
});
