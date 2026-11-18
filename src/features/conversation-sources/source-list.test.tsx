/**
 * `2K-SRC-001` / `2K-SRC-004` / `2K-SRC-005` / `2K-SRC-006` — the rendered
 * source block.
 *
 * The assertion that matters most is the third describe: an answer with no
 * qualifying evidence must be **visually distinct** from an evidenced one.
 * Before this slice they were byte-identical, because the block was drawn only
 * when citations existed.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { readOnlyPreviewCard, unavailableCard } from "@/features/conversation-cards/contracts";
import { getConversationCardsCopy } from "@/features/conversation-cards/copy";

import type { ParsedCitations } from "./contracts";
import { getConversationSourcesCopy } from "./copy";
import type { ResolvedSource } from "./resolve-sources";
import { SourceList } from "./source-list";


/** The owner's zone, explicit in every render (`LDC-AGENT-001`). */
const OWNER_TIME_ZONE = "America/Sao_Paulo";
// The analytics emitters reach a `"use server"` module, which cannot be
// imported from a client component under vitest. What this file tests is what
// the block renders; the producers have their own coverage in the telemetry
// guard and the pgTAP write path.
vi.mock("@/features/product-analytics/interaction-events", () => ({
  ConversationAnswerShown: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => <a href={href} {...rest}>{children}</a>,
}));
/*
 * Chat shows every level today (ADR-178), so a masked card cannot be produced
 * through the real rule. The contract is wrapped so one test can make it mask,
 * and prove the card follows whatever the contract decides.
 */
const contract = vi.hoisted(() => ({ masks: false }));
vi.mock("@/features/sensitivity/contracts", async (original) => {
  const actual = await original<typeof import("@/features/sensitivity/contracts")>();
  return {
    ...actual,
    resolveContent: (...args: Parameters<typeof actual.resolveContent>) =>
      contract.masks ? { show: false, masked: true, revealable: true } : actual.resolveContent(...args),
  };
});

const copy = getConversationSourcesCopy("pt-BR");
const ENTRY = "33333333-3333-4333-8333-333333333333";

const entrySource: ResolvedSource = {
  key: `entry:${ENTRY}`,
  support: "direct_record",
  card: readOnlyPreviewCard({
    cardType: "entry",
    objectId: ENTRY,
    snippet: "conversa com a Ana",
    sensitivity: "normal",
    href: `/pt-BR/app/inbox/${ENTRY}`,
  }),
  occurredAt: "2026-07-20T10:00:00.000Z",
};

const evidenced: ParsedCitations = {
  evidence: "evidenced",
  reach: ["entry", "memory"],
  sources: [{ id: entrySource.key, type: "entry", sourceId: ENTRY, support: "direct_record" }],
  explanation: null,
  legacy: false,
};

const source = (index: number, over: Partial<ResolvedSource> = {}): ResolvedSource => ({
  ...entrySource,
  key: `entry:${index}`,
  card: readOnlyPreviewCard({
    cardType: "entry",
    objectId: `${index}`,
    snippet: `registro ${index}`,
    sensitivity: "normal",
    href: `/pt-BR/app/inbox/${index}`,
  }),
  ...over,
});

describe("2K-SRC-001/003: every rendered source is a card that says what it is and opens it", () => {
  it("is a card — what the source says, its kind and date — whose whole is the link (owner, 18 Nov 2026)", () => {
    const { container } = render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[entrySource]} />);
    const card = screen.getByRole("link");
    expect(card).toHaveAttribute("href", `/pt-BR/app/inbox/${ENTRY}`);
    expect(card).toHaveClass("conversation-source-card");
    expect(card.querySelector(".conversation-source-title")?.textContent).toBe("conversa com a Ana");
    expect(card.textContent).toMatch(/^conversa com a AnaVocê escreveu isto: Registro · De \d/);
    // Visible by default: no disclosure stands between the answer and its sources.
    expect(card.closest("details")).toBeNull();
    expect(container.querySelector(".conversation-sources-used")).toBeNull();
  });

  it("titles a source that carries no content by its kind, and dates it", () => {
    const task: ResolvedSource = {
      key: "task:t1",
      support: "product_state",
      card: readOnlyPreviewCard({ cardType: "task", objectId: "t1", href: "/pt-BR/app/work/t1" }),
      occurredAt: "2026-07-20T10:00:00.000Z",
    };
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[task]} />);
    const card = screen.getByRole("link");
    expect(card.querySelector(".conversation-source-title")?.textContent).toBe("Tarefa");
    expect(card.querySelector(".conversation-source-caption")?.textContent).toMatch(/^O que eu guardo como verdadeiro: De \d/);
  });

  it("names a cited task by its title and says a passed deadline in the accent (ADR-190)", () => {
    const task: ResolvedSource = {
      key: "task:t2",
      support: "product_state",
      card: readOnlyPreviewCard({
        cardType: "task",
        objectId: "t2",
        snippet: "Responder a Ana sobre o orçamento",
        sensitivity: "normal",
        href: "/pt-BR/app/work/t2",
      }),
      occurredAt: "2026-07-01T10:00:00.000Z",
      when: { kind: "overdue", at: "2026-07-20T15:00:00.000Z" },
    };
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[task]} />);
    const card = screen.getByRole("link");
    expect(card.querySelector(".conversation-source-title")?.textContent).toBe("Responder a Ana sobre o orçamento");
    const when = card.querySelector('[data-when="overdue"]');
    expect(when?.textContent).toMatch(/atrasada desde \d/);
    expect(card.querySelector("button, input, select")).toBeNull();
  });

  it("says a cited reminder's day and hour, and a done task without a date", () => {
    const reminder: ResolvedSource = {
      key: "reminder:r1",
      support: "product_state",
      card: readOnlyPreviewCard({ cardType: "reminder", objectId: "r1", snippet: "Comprar o presente da Ana", sensitivity: "normal", href: "/pt-BR/app/reminders/r1" }),
      occurredAt: null,
      when: { kind: "remind", at: "2027-04-28T12:00:00.000Z" },
    };
    const done: ResolvedSource = {
      key: "task:t3",
      support: "product_state",
      card: readOnlyPreviewCard({ cardType: "task", objectId: "t3", snippet: "Pagar o condomínio", sensitivity: "normal", href: "/pt-BR/app/work/t3" }),
      occurredAt: null,
      when: { kind: "done" },
    };
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[reminder, done]} />);
    const [first, second] = screen.getAllByRole("link");
    expect(first?.querySelector('[data-when="remind"]')?.textContent).toMatch(/· .*09:00/);
    expect(second?.querySelector(".conversation-source-caption")?.textContent).toMatch(/concluída$/);
  });

  it("does not print the time beside a masked task title", () => {
    contract.masks = true;
    try {
      const task: ResolvedSource = {
        key: "task:t4",
        support: "product_state",
        card: readOnlyPreviewCard({ cardType: "task", objectId: "t4", snippet: "Exame", sensitivity: "highly_sensitive", href: "/pt-BR/app/work/t4" }),
        occurredAt: null,
        when: { kind: "due", at: "2026-07-20T15:00:00.000Z" },
      };
      render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[task]} />);
      const card = screen.getByRole("link");
      expect(card.textContent).not.toContain("Exame");
      expect(card.querySelector("[data-when]")).toBeNull();
    } finally {
      contract.masks = false;
    }
  });

  it("draws at most three cards, and the rest behind one quiet \"Mais N fontes\" line", () => {
    const { container } = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[1, 2, 3, 4, 5].map((index) => source(index))} />,
    );
    const shown = container.querySelectorAll(".conversation-sources > .conversation-sources-list > li > a.conversation-source-card");
    expect(shown).toHaveLength(3);
    expect([...shown].map((node) => node.getAttribute("href"))).toEqual(["/pt-BR/app/inbox/1", "/pt-BR/app/inbox/2", "/pt-BR/app/inbox/3"]);
    const more = container.querySelector("details.conversation-sources-more");
    expect(more).not.toHaveAttribute("open");
    expect(more?.querySelector("summary")?.textContent).toBe(copy.moreSources(2));
    expect(more?.querySelectorAll("a.conversation-source-card")).toHaveLength(2);
  });

  it("draws no \"Mais\" line for three sources or fewer", () => {
    const { container } = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[1, 2, 3].map((index) => source(index))} />,
    );
    expect(container.querySelectorAll("a.conversation-source-card")).toHaveLength(3);
    expect(container.querySelector(".conversation-sources-more")).toBeNull();
  });

  it("says the rest in the singular, in both locales", () => {
    expect(copy.moreSources(1)).toBe("Mais 1 fonte");
    expect(copy.moreSources(4)).toBe("Mais 4 fontes");
    expect(getConversationSourcesCopy("en").moreSources(1)).toBe("1 more source");
    expect(getConversationSourcesCopy("en").moreSources(3)).toBe("3 more sources");
  });

  it("keeps masked content masked on a card: the contract's sentence, never the text", () => {
    contract.masks = true;
    try {
      render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[entrySource]} />);
      const title = screen.getByRole("link").querySelector(".conversation-source-title");
      expect(title).toHaveAttribute("data-masked", "true");
      expect(title?.textContent).toBe(getConversationCardsCopy("pt-BR").masked);
      expect(screen.queryByText(/conversa com a Ana/)).not.toBeInTheDocument();
    } finally {
      contract.masks = false;
    }
  });

  it("puts no control on a source card: one link, no button, no form (2K-CARD-008)", () => {
    const { container } = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[1, 2, 3].map((index) => source(index))} />,
    );
    for (const card of container.querySelectorAll(".conversation-source-card")) {
      expect(card.querySelector("button, form, input, select, textarea")).toBeNull();
      expect(card.querySelectorAll("a")).toHaveLength(0);
    }
    expect(container.querySelector("button, form")).toBeNull();
  });

  it("renders a source the user can no longer read as one quiet line, not a card, with no link", () => {
    const { container } = render(
      <SourceList timeZone={OWNER_TIME_ZONE}
        citations={evidenced}
        locale="pt-BR"
        sources={[{ ...entrySource, card: unavailableCard("entry"), occurredAt: null }]}
      />,
    );
    expect(screen.queryByText("conversa com a Ana")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector(".conversation-source-card")).toBeNull();
    expect(container.querySelector(".conversation-source-chip[data-unavailable]")?.textContent)
      .toContain(getConversationCardsCopy("pt-BR").states.unavailable);
  });
});

describe("Editorial calmo: under the cards, one quiet line of closed disclosures", () => {
  it("files the reach sentence, and what the host adds, behind a closed line of its own", () => {
    const { container } = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[entrySource]}>
        <p>Modelo: gpt-5-mini</p>
      </SourceList>,
    );
    const where = container.querySelector("details.conversation-sources-where");
    expect(where).not.toHaveAttribute("open");
    expect(where?.querySelector("summary")?.textContent).toBe(copy.reachSummary);
    expect(where?.textContent).toContain(copy.reach);
    expect(where?.textContent).toContain("Modelo: gpt-5-mini");
  });

  it("draws no sources line when retrieval found something and the answer cited none", () => {
    const { container } = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={{ ...evidenced, sources: [] }} locale="pt-BR" sources={[]} />,
    );
    expect(container.querySelector(".conversation-source-card")).toBeNull();
    expect(container.querySelector(".conversation-sources-where")).not.toBeNull();
  });

  it("keeps the honest \"I had nothing\" in the open, never behind a disclosure", () => {
    const { container } = render(
      <SourceList
        timeZone={OWNER_TIME_ZONE}
        citations={{ evidence: "no_qualifying_evidence", reach: ["entry", "memory"], sources: [], explanation: null, legacy: false }}
        locale="pt-BR"
        sources={[]}
      />,
    );
    const sentence = container.querySelector(".conversation-sources-insufficient");
    expect(sentence?.textContent).toBe(copy.insufficient);
    expect(sentence?.closest("details")).toBeNull();
  });
});

describe("2K-SRC-004: freshness renders, and is absent rather than fabricated", () => {
  it("renders the date the source is from, as a machine-readable instant", () => {
    const { container } = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[entrySource]} />,
    );
    const freshness = container.querySelector(".conversation-source-freshness");
    expect(freshness?.textContent).toContain(copy.freshnessLabel);
    // `<time datetime>` rather than only a formatted string: the formatted form
    // is for the reader, and the attribute is what keeps the instant honest
    // under any locale.
    expect(container.querySelector("time")).toHaveAttribute("datetime", "2026-07-20T10:00:00.000Z");
  });

  it("says it has no date rather than inventing one", () => {
    render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[{ ...entrySource, occurredAt: null }]} />,
    );
    expect(screen.getByRole("link").textContent).toContain(`Registro · ${copy.freshnessUnknown}`);
    expect(screen.queryByRole("time")).not.toBeInTheDocument();
  });
});

describe("2K-SRC-005: an answer with no evidence says so, and looks different", () => {
  const insufficient: ParsedCitations = {
    evidence: "no_qualifying_evidence",
    reach: ["entry", "memory"],
    sources: [],
    explanation: null,
  legacy: false,
  };

  it("says it found nothing", () => {
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={insufficient} locale="pt-BR" sources={[]} />);
    expect(screen.getByText(copy.insufficient)).toBeInTheDocument();
  });

  it("is visually distinct from an evidenced answer", () => {
    const { container, unmount } = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={insufficient} locale="pt-BR" sources={[]} />,
    );
    expect(container.querySelector(".conversation-sources")).toHaveAttribute("data-evidence", "insufficient");
    unmount();

    const evidencedRender = render(
      <SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[entrySource]} />,
    );
    expect(evidencedRender.container.querySelector(".conversation-sources"))
      .toHaveAttribute("data-evidence", "evidenced");
  });

  it("does not claim insufficiency when retrieval found something the model cited none of", () => {
    // The ambiguity slice 2K.0 measured. `sources` is empty and the evidence
    // state is `evidenced`, so the honest output is **not** the "I had nothing"
    // sentence.
    const citedNone: ParsedCitations = { ...evidenced, sources: [] };
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={citedNone} locale="pt-BR" sources={[]} />);
    expect(screen.queryByText(copy.insufficient)).not.toBeInTheDocument();
    expect(screen.getByText(copy.reach)).toBeInTheDocument();
  });
});

describe("2K-SRC-006: the reach is disclosed on both branches", () => {
  it("states the reach beside an evidenced answer", () => {
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[entrySource]} />);
    expect(screen.getByText(copy.reach)).toBeInTheDocument();
  });

  it("states it beside an answer that found nothing, which is when it matters most", () => {
    render(
      <SourceList timeZone={OWNER_TIME_ZONE}
        citations={{ evidence: "no_qualifying_evidence", reach: ["entry", "memory"], sources: [], explanation: null, legacy: false }}
        locale="pt-BR"
        sources={[]}
      />,
    );
    expect(screen.getByText(copy.reach)).toBeInTheDocument();
  });
});

describe("Life Brain B.1: an agenda answer says where IT looked", () => {
  const agenda = (evidence: ParsedCitations["evidence"]): ParsedCitations => ({
    evidence,
    reach: ["task"],
    sources: [],
    explanation: null,
    legacy: false,
  });

  it("names the agenda, never 'records and memories only', beside an agenda answer", () => {
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={agenda("evidenced")} locale="pt-BR" sources={[]} />);
    expect(screen.getByText(copy.agendaReach)).toBeInTheDocument();
    expect(screen.queryByText(copy.reach)).not.toBeInTheDocument();
  });

  it("says the agenda was empty, not that the records and memories were", () => {
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={agenda("no_qualifying_evidence")} locale="en" sources={[]} />);
    const en = getConversationSourcesCopy("en");
    expect(screen.getByText(en.agendaInsufficient)).toBeInTheDocument();
    expect(screen.queryByText(en.insufficient)).not.toBeInTheDocument();
  });
});

describe("2K-PRIVACY-004: a legacy row says less rather than guessing", () => {
  const legacy: ParsedCitations = { evidence: "unknown", reach: [], sources: [], explanation: null, legacy: true };

  it("claims neither evidence nor insufficiency nor reach", () => {
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={legacy} locale="pt-BR" sources={[]} />);
    expect(screen.getByText(copy.legacyUnknown)).toBeInTheDocument();
    expect(screen.queryByText(copy.insufficient)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.reach)).not.toBeInTheDocument();
  });

  it("still renders a legacy row's sources, re-read rather than quoted", () => {
    // The references survive; the stored excerpt does not. What renders is the
    // card `resolve-sources.ts` built from the row **as it is now**.
    render(
      <SourceList timeZone={OWNER_TIME_ZONE}
        citations={{ ...legacy, sources: evidenced.sources }}
        locale="pt-BR"
        sources={[entrySource]}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", `/pt-BR/app/inbox/${ENTRY}`);
    expect(screen.queryByText(copy.reach)).not.toBeInTheDocument();
  });
});

describe("Life Brain E.8 (ADR-178): nothing is marked as withheld or sensitive", () => {
  it("draws no sensitivity note, even for an older answer whose envelope carries the flag", () => {
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={{ ...evidenced, readSensitive: true }} locale="pt-BR" sources={[entrySource]} />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});
