/**
 * `2P-CHAT-005` — the rendered contract, at the component boundary.
 *
 * ## What this proves and what it does not
 *
 * The evidence hierarchy in `PHASE_2P_TRACEABILITY_CONTRACT.md` is explicit:
 * unit tests prove deterministic logic, **browser journeys prove rendered
 * flows**, and no lower boundary substitutes for a higher one. This file is the
 * lower boundary. It proves the seeding rule, the accessible names and the
 * return link exist and behave, against a real DOM.
 *
 * It does **not** prove the flow on a rendered page, and slice 2P.2's acceptance
 * record does not claim it does — the Playwright journey is written and its live
 * execution is recorded as NOT EXECUTED.
 *
 * ## The rule most worth a test
 *
 * `initialText` is seeded on the `idle` route only. Get that wrong and the
 * composer either refills a field the owner deliberately emptied, or — worse —
 * overwrites the text a failed turn just restored from `echo`, which is the exact
 * defect `2O` recorded as "a form action resets uncontrolled input": React
 * cannot tell a failed save from a successful one, so the failure silently eats
 * what the user typed.
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AssistantComposer } from "@/features/assistant/assistant-composer";
import { idleAssistantComposerState } from "@/features/assistant/composer-state";

import { AskAboutLink } from "./ask-about-link";
import { AskingAboutBanner } from "./asking-about-banner";

/*
 * The same two mocks `assistant-composer.test.tsx` needs, for the same reasons.
 *
 * `MemoryProposalCard` emits a product event through a `"use server"` module,
 * which `server-only` refuses to load into a client graph under vitest. The
 * producer has its own coverage in `phase-2k-telemetry-guard.test.ts` and in the
 * pgTAP write path; nothing here tests it.
 *
 * `next/link` is stubbed so `href` is assertable as a plain anchor attribute.
 */
vi.mock("@/features/product-analytics/interaction-events", () => ({
  ConversationMemoryResolved: () => null,
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const ID = "11111111-1111-4111-8111-111111111111";
const noop = vi.fn();

/**
 * Renders the composer, with the turn it will resolve to.
 *
 * `useActionState` seeds from `idleAssistantComposerState` and only moves when
 * the action actually runs, so a non-idle route cannot be reached by rendering:
 * the first draft of this file passed a state in and asserted against it, and it
 * was asserting the idle render three times over. Reaching `knowledge_failed`
 * means submitting, which is what `turn` below does.
 */
function composer(initialText?: string, resolvesTo = idleAssistantComposerState) {
  return render(
    <AssistantComposer
      action={vi.fn(async () => resolvesTo)}
      agentName="Brain"
      initialText={initialText}
      locale="pt-BR"
      memoryAction={noop}
      memoryUndoAction={noop}
    />,
  );
}

/** Types something and submits, so the action runs and the route moves. */
async function turn(typed: string) {
  const user = userEvent.setup();
  const field = screen.getByRole("textbox");
  await user.clear(field);
  await user.type(field, typed);
  await user.click(screen.getByRole("button", { name: "Enviar" }));
}

describe("the contextual affordance", () => {
  it("names the subject in its accessible label, not just 'ask about this'", () => {
    render(<AskAboutLink about={{ type: "person", id: ID }} locale="pt-BR" name="Ana Torres" />);
    // A page can render several of these. "Perguntar sobre isto" four times
    // tells a screen-reader user nothing about which one they are on.
    const link = screen.getByRole("link", { name: "Perguntando sobre Ana Torres" });
    expect(link).toHaveAttribute("href", `/pt-BR/app/chat?about=person%3A${ID}`);
    expect(link).toHaveTextContent("Perguntar sobre isto");
  });

  it("puts no owner content in the href beyond the id the page already shows", () => {
    render(<AskAboutLink about={{ type: "project", id: ID }} locale="en" name="Q4 migration" />);
    const href = screen.getByRole("link").getAttribute("href")!;
    expect(href).not.toContain("Q4");
    expect(href).not.toContain("migration");
  });
});

describe("the banner keeps the source context", () => {
  it("says what the conversation is about and offers the way back", () => {
    render(
      <AskingAboutBanner
        locale="pt-BR"
        resolved={{ name: "Ana Torres", subject: { type: "person", id: ID } }}
      />,
    );
    expect(screen.getByText("Perguntando sobre Ana Torres")).toBeInTheDocument();
    // The requirement's harder half: an affordance that drops the owner on a
    // bare composer has lost the context even though it carried the subject.
    expect(screen.getByRole("link", { name: "Voltar para Ana Torres" }))
      .toHaveAttribute("href", `/pt-BR/app/people/${ID}`);
  });

  it("returns each subject type to its own page", () => {
    for (const [type, route] of [
      ["project", "projects"],
      ["organization", "organizations"],
      ["context", "contexts"],
    ] as const) {
      const view = render(
        <AskingAboutBanner locale="en" resolved={{ name: "X", subject: { type, id: ID } }} />,
      );
      expect(screen.getByRole("link", { name: "Back to X" }))
        .toHaveAttribute("href", `/en/app/${route}/${ID}`);
      view.unmount();
    }
  });
});

describe("the composer is seeded, never submitted", () => {
  it("seeds the field on the idle route", () => {
    composer("O que eu registrei sobre Ana Torres?");
    expect(screen.getByRole("textbox")).toHaveValue("O que eu registrei sobre Ana Torres?");
  });

  it("leaves the field empty when there is nothing to seed", () => {
    composer();
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("does not overwrite the text a failed turn restored", async () => {
    /*
     * The one that matters. `knowledge_failed` hands back `echo` — the owner's
     * own words — and the seed must lose to it. If the ordering were reversed, a
     * conversation reached from a person's page would answer a failure by
     * deleting what the owner had written and replacing it with a suggestion.
     */
    composer("O que eu registrei sobre Ana Torres?", {
      ...idleAssistantComposerState,
      route: "knowledge_failed",
      echo: "quanto a Ana me deve?",
      notice: { heading: "h", detail: "d", nextStep: null },
    });
    await turn("quanto a Ana me deve?");
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("quanto a Ana me deve?");
    });
  });

  it("does not re-seed after a turn resolved on another route", async () => {
    // `command` carries no echo, so the field must come back empty rather than
    // refilled — the turn happened, and the suggestion is spent.
    composer("O que eu registrei sobre Ana Torres?", {
      ...idleAssistantComposerState,
      route: "command",
    });
    await turn("marcar o relatório como feito");
    await waitFor(() => {
      expect(screen.getByRole("textbox")).toHaveValue("");
    });
  });

  it("keeps the field required, so a seed cannot become a silent submission", () => {
    composer("seeded");
    expect(screen.getByRole("textbox")).toBeRequired();
  });
});
