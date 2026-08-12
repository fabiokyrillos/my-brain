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
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

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

describe("2K-SRC-001/003: every rendered source names what it is and links to it", () => {
  it("shows the support kind, the content and the link", () => {
    render(<SourceList timeZone={OWNER_TIME_ZONE} citations={evidenced} locale="pt-BR" sources={[entrySource]} />);
    expect(screen.getByText(copy.supportKinds.direct_record)).toBeInTheDocument();
    expect(screen.getByText("conversa com a Ana")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", `/pt-BR/app/inbox/${ENTRY}`);
  });

  it("renders a source the user can no longer read as unavailable, with no link", () => {
    render(
      <SourceList timeZone={OWNER_TIME_ZONE}
        citations={evidenced}
        locale="pt-BR"
        sources={[{ ...entrySource, card: unavailableCard("entry"), occurredAt: null }]}
      />,
    );
    expect(screen.queryByText("conversa com a Ana")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
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
    expect(screen.getByText(copy.freshnessUnknown)).toBeInTheDocument();
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
    expect(screen.getByText("conversa com a Ana")).toBeInTheDocument();
    expect(screen.queryByText(copy.reach)).not.toBeInTheDocument();
  });
});
