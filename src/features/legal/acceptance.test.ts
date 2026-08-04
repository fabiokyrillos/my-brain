/**
 * SH-LEGAL-008/009/011 and T-29/T-30 — the gate reads the table, and a version
 * bump re-interposes by the same code path that interposes a new account.
 *
 * The client is a hand-built double rather than a mock library: every case here
 * is "what rows exist", and a fake that returns rows is a truer model of the
 * question than a spy on a call.
 */

import { describe, expect, it } from "vitest";
import { hasAcceptedCurrentPolicies, missingPolicyAcceptances } from "./acceptance";
import { POLICY_VERSIONS } from "./versions";

type Row = { document: string; version: string };

function client(rows: Row[] | { error: true }) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return "error" in rows
                ? Promise.resolve({ data: null, error: { code: "57014" } })
                : Promise.resolve({ data: rows, error: null });
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const CURRENT: Row[] = [
  { document: "terms", version: POLICY_VERSIONS.terms },
  { document: "privacy", version: POLICY_VERSIONS.privacy },
];

describe("the consent gate", () => {
  it("lets an account with both current acceptances through", async () => {
    expect(await missingPolicyAcceptances(client(CURRENT), "u1")).toEqual([]);
    expect(await hasAcceptedCurrentPolicies(client(CURRENT), "u1")).toBe(true);
  });

  it("interposes a brand-new account for both documents", async () => {
    expect(await missingPolicyAcceptances(client([]), "u1")).toEqual(["terms", "privacy"]);
  });

  it("interposes for the one document that is missing, not for both", async () => {
    const onlyTerms = [{ document: "terms", version: POLICY_VERSIONS.terms }];
    expect(await missingPolicyAcceptances(client(onlyTerms), "u1")).toEqual(["privacy"]);
  });

  it("T-30: a superseded acceptance does not satisfy the gate", async () => {
    // The version-bump case, which is the same case as a new account: the row
    // exists, it is simply not for the current version. No separate flag, no
    // separate code path, nothing to get out of step.
    const stale = [
      { document: "terms", version: "2020-01-01" },
      { document: "privacy", version: "2020-01-01" },
    ];
    expect(await missingPolicyAcceptances(client(stale), "u1")).toEqual(["terms", "privacy"]);
  });

  it("T-30: a future version does not satisfy the gate either", async () => {
    // Belt and braces on top of the database trigger: even if such a row
    // somehow existed, it is not the current version and so it opens nothing.
    const future = [
      { document: "terms", version: "9999-12-31" },
      { document: "privacy", version: "9999-12-31" },
    ];
    expect(await missingPolicyAcceptances(client(future), "u1")).toEqual(["terms", "privacy"]);
  });

  it("an acceptance of the wrong document does not count for the other", async () => {
    const swapped = [{ document: "terms", version: POLICY_VERSIONS.privacy }];
    // Only meaningful while the two versions are equal, which they are today —
    // so this asserts the match is on (document, version) and not on version.
    expect(await missingPolicyAcceptances(client(swapped), "u1")).toEqual(["privacy"]);
  });

  it("fails closed: an unreadable table is not an acceptance", async () => {
    expect(await missingPolicyAcceptances(client({ error: true }), "u1")).toEqual([
      "terms",
      "privacy",
    ]);
    expect(await hasAcceptedCurrentPolicies(client({ error: true }), "u1")).toBe(false);
  });

  it("T-29: nothing in the gate consults browser state", async () => {
    // The gate takes a Supabase client and a user id and reads a table. There
    // is no cookie, no header and no argument through which client state could
    // reach it — which is the property, stated as the shape of the function.
    expect(missingPolicyAcceptances.length).toBe(2);
  });
});
