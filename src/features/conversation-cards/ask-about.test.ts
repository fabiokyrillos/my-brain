/**
 * `2P-CHAT-005` — the subject handle, and what it refuses.
 *
 * The property is not "does the link work". It is that a query parameter cannot
 * become a table selector, cannot carry the owner's content, and cannot be
 * hand-edited into something the resolver will act on.
 */

import { describe, expect, it } from "vitest";

import { locales } from "@/lib/preferences";

import {
  ASK_ABOUT_PARAM,
  ASK_ABOUT_TYPES,
  askAboutCopy,
  askAboutHref,
  askAboutSourceHref,
  parseAskAbout,
  serializeAskAbout,
  type AskAboutSubject,
} from "./ask-about";

const ID = "11111111-1111-4111-8111-111111111111";
const person: AskAboutSubject = { type: "person", id: ID };

describe("the handle round-trips and nothing else does", () => {
  it("accepts every declared type", () => {
    for (const type of ASK_ABOUT_TYPES) {
      const subject: AskAboutSubject = { type, id: ID };
      expect(parseAskAbout(serializeAskAbout(subject)), type).toEqual(subject);
    }
    // Non-vacuous: the loop is worthless if the vocabulary is empty.
    expect(ASK_ABOUT_TYPES).toHaveLength(4);
  });

  it("refuses a type outside the closed list", () => {
    // The defect this prevents is `supabase.from(subject.type)` — a link that
    // names its own table. `entries`, `memories` and `audit_logs` are all real
    // tables and none of them is a subject.
    for (const type of ["entries", "memories", "audit_logs", "profiles", "", "person "]) {
      expect(parseAskAbout(`${type}:${ID}`), type).toBeNull();
    }
  });

  it("refuses an id that is not a uuid", () => {
    for (const id of ["1", "abc", "'; drop table people; --", `${ID}x`, ""]) {
      expect(parseAskAbout(`person:${id}`), id).toBeNull();
    }
  });

  it("refuses a malformed handle rather than throwing", () => {
    for (const raw of [
      undefined,
      "",
      "person",
      `person:${ID}:extra`,
      ":",
      "::",
      // Next hands over an array when a parameter repeats. The first value wins
      // and a bad first value is still refused.
      ["person"],
      [`bogus:${ID}`],
      // A length far past anything legitimate must not reach the regex work.
      `person:${"a".repeat(500)}`,
    ] as (string | string[] | undefined)[]) {
      expect(parseAskAbout(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("takes the first value when the parameter repeats", () => {
    expect(parseAskAbout([serializeAskAbout(person), "project:nonsense"])).toEqual(person);
  });
});

describe("the URL carries two opaque tokens and no content", () => {
  it("builds a conversation href with only the handle", () => {
    const href = askAboutHref("pt-BR", person);
    expect(href).toBe(`/pt-BR/app/chat?${ASK_ABOUT_PARAM}=person%3A${ID}`);
    // The one thing that must never be here is a name or a question.
    expect(href).not.toMatch(/[?&][a-z]+=.*%20/);
    expect(href.split("?")[1]!.split("&")).toHaveLength(1);
  });

  it("points the way back at the subject's own page", () => {
    expect(askAboutSourceHref("en", person)).toBe(`/en/app/people/${ID}`);
    expect(askAboutSourceHref("en", { type: "project", id: ID })).toBe(`/en/app/projects/${ID}`);
    expect(askAboutSourceHref("en", { type: "organization", id: ID }))
      .toBe(`/en/app/organizations/${ID}`);
    expect(askAboutSourceHref("en", { type: "context", id: ID })).toBe(`/en/app/contexts/${ID}`);
  });

  it("gives every type a distinct route, so no subject returns to the wrong page", () => {
    const routes = ASK_ABOUT_TYPES.map((type) => askAboutSourceHref("en", { type, id: ID }));
    expect(new Set(routes).size).toBe(ASK_ABOUT_TYPES.length);
  });
});

describe("the copy is complete, localized and a seed rather than a question", () => {
  it("answers in both locales and differs between them", () => {
    for (const locale of locales) {
      const copy = askAboutCopy(locale);
      expect(copy.action.length).toBeGreaterThan(4);
      expect(copy.asking("Ana")).toContain("Ana");
      expect(copy.back("Ana")).toContain("Ana");
      expect(copy.seed("Ana")).toContain("Ana");
    }
    expect(askAboutCopy("pt-BR").action).not.toBe(askAboutCopy("en").action);
    expect(askAboutCopy("pt-BR").seed("Ana")).not.toBe(askAboutCopy("en").seed("Ana"));
  });

  it("seeds a question the owner can edit, not an instruction to the model", () => {
    // A seed that reads as a command would make the composer look like it had
    // already decided what to ask. Both locales end in a question mark.
    for (const locale of locales) {
      expect(askAboutCopy(locale).seed("Ana"), locale).toMatch(/\?$/);
    }
  });
});
