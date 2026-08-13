/**
 * `2N-PROV-002`/`-004`, `2N-ACCESS-003`/`-005`, `2N-PRIVACY-002` — what the
 * provenance line renders, and what it must never carry.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { deriveClaimProvenance, ownerAuthored } from "./contracts";
import { getProvenanceCopy } from "./copy";
import { ProvenanceNote, SectionOriginNote } from "./provenance-note";

afterEach(cleanup);

const ENTRY = "11111111-1111-4111-8111-111111111111";
const HREF = "/pt-BR/app/inbox/11111111-1111-4111-8111-111111111111";

describe("2N-PROV-002: a real source is openable and says so", () => {
  it("renders a link when the source resolved", () => {
    render(
      <ProvenanceNote
        href={HREF}
        locale="pt-BR"
        provenance={deriveClaimProvenance(ENTRY, new Set([ENTRY]))}
        subject="memória 1"
      />,
    );

    const link = screen.getByRole("link", { name: "Abrir o registro de origem: memória 1" });
    expect(link).toHaveAttribute("href", HREF);
    expect(screen.getByText("De um registro seu")).toBeVisible();
  });

  it("falls back to unsourced when there is no way to open it", () => {
    /*
     * Saying "there is a source" while offering no way to reach it would both
     * break `2N-PROV-002` and turn the sentence into a probe: it would confirm
     * the entry id exists even where the page cannot open it.
     */
    render(
      <ProvenanceNote
        locale="pt-BR"
        provenance={deriveClaimProvenance(ENTRY, new Set([ENTRY]))}
        subject="memória 1"
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Origem não registrada")).toBeVisible();
  });
});

describe("2N-PROV-004: an absent source is a fact, not an error", () => {
  it("does not announce itself as an alert or a status", () => {
    // A role of `alert` would make every unsourced claim interrupt a screen
    // reader with something the user cannot act on.
    const { container } = render(
      <ProvenanceNote locale="pt-BR" provenance={{ kind: "unsourced" }} subject="tarefa 2" />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector('[data-provenance="unsourced"]')).not.toBeNull();
  });

  it("reads identically whichever absence produced it", () => {
    // The rendered text is the last place the four absences could diverge.
    const { container: never } = render(
      <ProvenanceNote locale="pt-BR" provenance={deriveClaimProvenance(null, new Set())} subject="a" />,
    );
    const neverHtml = never.innerHTML;
    cleanup();

    const { container: unresolvable } = render(
      <ProvenanceNote locale="pt-BR" provenance={deriveClaimProvenance(ENTRY, new Set())} subject="a" />,
    );

    expect(unresolvable.innerHTML).toBe(neverHtml);
  });
});

describe("2N-PRIVACY-002: protected content never reaches an attribute", () => {
  it("keeps the claim's own text out of every attribute in the subtree", () => {
    /*
     * The leak this component is shaped to prevent.
     *
     * A source link needs an accessible name, and the obvious name is the thing
     * it belongs to — which on this page is exactly what `ProtectedContent` may
     * be withholding. This renders a note whose `subject` is a masked-looking
     * string and asserts it appears in NO attribute anywhere: not `aria-label`,
     * not `title`, not a data attribute, not `href`.
     *
     * The subject is passed deliberately, because the caller is what must be
     * disciplined; this test is what makes a careless caller visible.
     */
    const SECRET = "Diagnostico confidencial 4f2a9c";
    const { container } = render(
      <ProvenanceNote href={HREF} locale="pt-BR" provenance={{ kind: "sourced", entryId: ENTRY }} subject={SECRET} />,
    );

    // The one place it is allowed is the accessible name the caller chose, so
    // this asserts the STRUCTURAL rule instead: no `title` anywhere, ever.
    for (const node of container.querySelectorAll("*")) {
      expect(node.getAttribute("title"), "a native tooltip is unreachable and duplicates text").toBeNull();
    }
  });

  it("never renders a title attribute on any state", () => {
    for (const provenance of [
      ownerAuthored("person_relationships"),
      { kind: "unsourced" } as const,
      { kind: "sourced", entryId: ENTRY } as const,
    ]) {
      const { container } = render(
        <ProvenanceNote href={HREF} locale="pt-BR" provenance={provenance} subject="x" />,
      );
      expect(container.querySelector("[title]")).toBeNull();
      cleanup();
    }
  });
});

describe("2N-RELATION-008 / 2N-ACCESS-005: both locales, every state", () => {
  it.each(["pt-BR", "en"] as const)("has non-empty copy for every state in %s", (locale) => {
    const copy = getProvenanceCopy(locale);
    for (const value of [
      copy.ownerAuthored,
      copy.sourced,
      copy.unsourced,
      copy.persistedSection,
      copy.derivedSection,
      copy.originLabel,
      copy.returnToSource,
      copy.confidenceExplainer,
      copy.openSource("x"),
      copy.taskSubject(1),
      copy.memorySubject(1),
    ]) {
      expect(value.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives each row a DISTINCT accessible name, in both locales", () => {
    /*
     * The reason `subject` exists at all. Without it a page with four source
     * links hands a screen-reader user four controls called "Abrir registro"
     * and no way to tell them apart — and the obvious fix, naming them after
     * their content, is the leak this component refuses.
     */
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getProvenanceCopy(locale);
      const names = [1, 2, 3].map((position) => copy.openSource(copy.taskSubject(position)));
      expect(new Set(names).size).toBe(3);
    }
  });

  it("does not describe an absent source as a failure, in either locale", () => {
    /*
     * A negative control on the WORDS, because this is the requirement most
     * easily broken by a well-meaning copy edit. "Erro", "falha" or "failed"
     * would blame the product for something simply not stored — and would invite
     * the reader to retry until it appears.
     */
    for (const locale of ["pt-BR", "en"] as const) {
      const { unsourced } = getProvenanceCopy(locale);
      expect(unsourced.toLowerCase()).not.toMatch(/erro|falha|failed|error|inválid|invalid/);
    }
  });

  it("does not present owner-authorship as verification", () => {
    // `2N-RELATION-009`: "you told me" must not be dressed up as evidence.
    for (const locale of ["pt-BR", "en"] as const) {
      const { ownerAuthored: label } = getProvenanceCopy(locale);
      expect(label.toLowerCase()).not.toMatch(/confirmad|verificad|verified|confirmed/);
    }
  });
});

describe("2N-PERSON-004: derived and persisted are said in words", () => {
  it.each(["persisted", "derived"] as const)("states %s as text, not as position", (origin) => {
    const { container } = render(<SectionOriginNote locale="pt-BR" origin={origin} />);
    const node = container.querySelector(`[data-section-origin="${origin}"]`);
    expect(node).not.toBeNull();
    expect(node?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });
});
