import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ConflictAttentionItemRow } from "./conflict-attention-item";
import type { ConflictAttentionItemView } from "./contracts";

/**
 * `2N-CONFLICT-002`/`006`. The row has to explain itself completely, in the
 * owner's zone and language, and leak nothing while doing it.
 */

const MEMORY_ID = "11111111-1111-4111-8111-111111111111";

function item(overrides: Partial<ConflictAttentionItemView> = {}): ConflictAttentionItemView {
  return {
    key: `${MEMORY_ID}:memory_validity_window`,
    reason: "resolve_validity_conflict",
    memoryId: MEMORY_ID,
    content: "Trabalho na Acme",
    sensitivity: "normal",
    validFrom: "2026-09-01T12:00:00.000Z",
    validUntil: "2026-08-01T12:00:00.000Z",
    action: { id: "resolve_validity_conflict", href: `/pt-BR/app/memories/${MEMORY_ID}` },
    ...overrides,
  };
}

afterEach(cleanup);

describe("ConflictAttentionItemRow", () => {
  it("says in pt-BR that the memory starts after it was supposed to end", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="America/Sao_Paulo" />);
    expect(screen.getByText("Duas datas que não podem estar certas")).toBeInTheDocument();
    expect(screen.getByText(/começa depois da data em que deveria terminar/)).toBeInTheDocument();
  });

  it("says the same thing in en", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="en" timeZone="America/Sao_Paulo" />);
    expect(screen.getByText("Two dates that cannot both be right")).toBeInTheDocument();
    expect(screen.getByText(/starts after the date it was supposed to end/)).toBeInTheDocument();
  });

  it("shows BOTH dates, so neither is silently the winner", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="America/Sao_Paulo" />);
    expect(screen.getByText("Começa em")).toBeInTheDocument();
    expect(screen.getByText("Deveria terminar em")).toBeInTheDocument();
    // 12:00 UTC is 09:00 in São Paulo, on the same calendar day.
    expect(screen.getByText(/1 de set\. de 2026, 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/1 de ago\. de 2026, 09:00/)).toBeInTheDocument();
  });

  /**
   * `LDC-DAILY-001`. The zone is the owner's, never the device's — the defect
   * this contract exists to prevent is the same row reading differently on a
   * phone in another country.
   */
  it("renders the dates in the owner's zone, not the runtime's", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="Asia/Tokyo" />);
    // 12:00 UTC is 21:00 in Tokyo, still the same calendar day.
    expect(screen.getByText(/1 de set\. de 2026, 21:00/)).toBeInTheDocument();
  });

  it("renders the dates in en with the same instants", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="en" timeZone="America/Sao_Paulo" />);
    expect(screen.getByText("Starts on")).toBeInTheDocument();
    expect(screen.getByText("Was supposed to end on")).toBeInTheDocument();
    expect(screen.getByText(/Sep 1, 2026, 09:00/)).toBeInTheDocument();
    expect(screen.getByText(/Aug 1, 2026, 09:00/)).toBeInTheDocument();
  });

  it("explains why the assistant did not choose, in both locales", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    expect(screen.getByText(/Escolher uma delas por conta própria seria inventar/)).toBeInTheDocument();
    cleanup();
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="en" timeZone="UTC" />);
    expect(screen.getByText(/Picking one of them unprompted would be inventing/)).toBeInTheDocument();
  });

  it("offers a real action that reaches the memory", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/pt-BR/app/memories/${MEMORY_ID}`);
    expect(screen.getByText("Abrir memória e corrigir")).toBeInTheDocument();
  });

  it("names the correction in en too", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="en" timeZone="UTC" />);
    expect(screen.getByText("Open memory and fix")).toBeInTheDocument();
  });

  it("never calls the memory archived — that is the silence this row ends", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      cleanup();
      const { container } = render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale={locale} timeZone="UTC" />);
      expect(container.textContent?.toLowerCase()).not.toContain("arquivada");
      expect(container.textContent?.toLowerCase()).not.toContain("archived");
    }
  });

  /**
   * `2N-PRIVACY`. Everything the row can leak, asserted at once: an id in the
   * body, a table name, the word RLS, a confidence figure, a fingerprint. The
   * href legitimately carries the id — that is a route, not a disclosure — so the
   * assertion is on rendered text.
   */
  it("shows no internal identifier, table name or confidence in its text", () => {
    const { container } = render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    const text = container.textContent ?? "";
    expect(text).not.toContain(MEMORY_ID);
    expect(text.toLowerCase()).not.toContain("memories");
    expect(text.toLowerCase()).not.toContain("valid_from");
    expect(text.toLowerCase()).not.toContain("valid_until");
    expect(text.toLowerCase()).not.toContain("rls");
    expect(text.toLowerCase()).not.toContain("fingerprint");
    expect(text.toLowerCase()).not.toContain("confidence");
    expect(text.toLowerCase()).not.toContain("confiança");
  });

  /**
   * `2J-PRIVACY-001`/`004`/`005`, applied to a row that carries the owner's own
   * words. The dates stay: they are the fault being reported, not content, and a
   * masked row that hid them could not explain itself.
   */
  it("masks a highly sensitive memory's text but keeps the dates and the action", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item({ sensitivity: "highly_sensitive" })} surface="needs_attention" locale="pt-BR" timeZone="America/Sao_Paulo" />);
    expect(screen.queryByText("Trabalho na Acme")).not.toBeInTheDocument();
    expect(screen.getByText("Conteúdo muito sensível, oculto")).toBeInTheDocument();
    expect(screen.getByText(/1 de set\. de 2026, 09:00/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toBeInTheDocument();
  });

  it("shows the memory's own words when it is not masked", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    expect(screen.getByText("Trabalho na Acme")).toBeInTheDocument();
  });

  /**
   * The row must not fire `needs_attention_item_opened`: that event validates its
   * reason against a five-member enum inside Postgres, and this reason is not one
   * of them. Asserted structurally — the component imports no analytics module,
   * so there is nothing to spy on and nothing that could regress silently.
   */
  it("carries no click handler, so it can emit no analytics event", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("onclick")).toBeNull();
  });

  /**
   * Keyboard and focus: the whole row is one anchor, so it is reachable by Tab
   * and activated by Enter with no custom handling — the same interaction model
   * `NeedsAttentionItemRow` already has.
   */
  it("is reachable by keyboard as a single focusable control", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    const link = screen.getByRole("link");
    link.focus();
    expect(document.activeElement).toBe(link);
    expect(link.getAttribute("tabindex")).toBeNull();
  });

  it("labels each date with its own term rather than burying both in prose", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    const terms = screen.getAllByRole("term");
    expect(terms.map((term) => term.textContent)).toEqual(["Começa em", "Deveria terminar em"]);
    expect(screen.getAllByRole("definition")).toHaveLength(2);
  });
});

/**
 * `2J-PRIVACY-001`. The surface decides, not the row.
 *
 * `hoje` and `attention` carry identical rules today, so this asserts the
 * *mechanism* rather than a visible difference: the row must consult the surface
 * it was given. Without it, the day the two diverge, this row would obey the
 * wrong one and nothing would fail.
 */
describe("the governing surface is the caller's, not a constant", () => {
  it("masks a highly sensitive memory on Hoje too", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item({ sensitivity: "highly_sensitive" })} surface="home" locale="pt-BR" timeZone="UTC" />);
    expect(screen.getByText("Conteúdo muito sensível, oculto")).toBeInTheDocument();
    expect(screen.queryByText("Trabalho na Acme")).not.toBeInTheDocument();
  });

  it("shows a normal memory on Hoje", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item()} surface="home" locale="pt-BR" timeZone="UTC" />);
    expect(screen.getByText("Trabalho na Acme")).toBeInTheDocument();
  });

  it("shows a private memory on both surfaces, as the contract says", () => {
    render(<ConflictAttentionItemRow agentName="Brain" item={item({ sensitivity: "private" })} surface="home" locale="pt-BR" timeZone="UTC" />);
    expect(screen.getByText("Trabalho na Acme")).toBeInTheDocument();
    cleanup();
    render(<ConflictAttentionItemRow agentName="Brain" item={item({ sensitivity: "private" })} surface="needs_attention" locale="pt-BR" timeZone="UTC" />);
    expect(screen.getByText("Trabalho na Acme")).toBeInTheDocument();
  });
});
