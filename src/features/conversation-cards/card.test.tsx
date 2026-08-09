/**
 * `2K-CARD-002`, `2K-CARD-008`, `2K-PRIVACY-001/002/004` — the renderer.
 *
 * The component's whole job is to render a state it did not decide. So the
 * assertions here are mostly *negative*: it does not recompute, it does not
 * reach a control it was told it may not, and it does not print content the
 * central contract masked.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ConversationCardView } from "./card";
import { CONVERSATION_CARD_STATES, readOnlyPreviewCard, unavailableCard } from "./contracts";
import { getConversationCardsCopy } from "./copy";

const copy = getConversationCardsCopy("pt-BR");

describe("2K-CARD-002: the state arrives decided and is rendered as itself", () => {
  it("renders a distinct localized outcome for every member of the vocabulary", () => {
    for (const state of CONVERSATION_CARD_STATES) {
      const { unmount } = render(
        <ConversationCardView
          card={{ ...readOnlyPreviewCard({ cardType: "entry", objectId: "e1" }), state }}
          locale="pt-BR"
        />,
      );
      expect(screen.getByTestId("conversation-card")).toHaveAttribute("data-state", state);
      expect(screen.getByText(copy.states[state])).toBeInTheDocument();
      unmount();
    }
  });
});

describe("2K-CARD-008: a read-only card type cannot reach a mutating control", () => {
  it("drops controls a caller passes for a read-only type", () => {
    render(
      <ConversationCardView
        card={readOnlyPreviewCard({ cardType: "project", objectId: "p1" })}
        locale="pt-BR"
      >
        <button type="submit">Aplicar</button>
      </ConversationCardView>,
    );
    // The caller made the mistake; the component refuses it. A rule enforced
    // only at the call site is a rule that holds until the next call site.
    expect(screen.queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
  });

  it("renders controls for a mutable type, so the refusal above is not vacuous", () => {
    render(
      <ConversationCardView
        card={{ ...unavailableCard("task"), state: "requires_confirmation" }}
        locale="pt-BR"
      >
        <button type="submit">Aplicar</button>
      </ConversationCardView>,
    );
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeInTheDocument();
  });

  it("renders no control at all on an unavailable card, whatever its type", () => {
    render(
      <ConversationCardView card={unavailableCard("task")} locale="pt-BR">
        <button type="submit">Aplicar</button>
      </ConversationCardView>,
    );
    expect(screen.queryByRole("button", { name: "Aplicar" })).not.toBeInTheDocument();
  });
});

describe("2K-PRIVACY-001/002/004: the chat surface masks in place", () => {
  it("shows a `private` snippet, because the contract shows it", () => {
    render(
      <ConversationCardView
        card={readOnlyPreviewCard({
          cardType: "entry",
          objectId: "e1",
          snippet: "reunião com a Marina",
          sensitivity: "private",
        })}
        locale="pt-BR"
      />,
    );
    expect(screen.getByText("reunião com a Marina")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.reveal })).not.toBeInTheDocument();
  });

  it("masks a `highly_sensitive` snippet and offers a local, transient reveal", async () => {
    const user = userEvent.setup();
    render(
      <ConversationCardView
        card={readOnlyPreviewCard({
          cardType: "entry",
          objectId: "e1",
          snippet: "resultado do exame",
          sensitivity: "highly_sensitive",
        })}
        locale="pt-BR"
      />,
    );
    expect(screen.queryByText("resultado do exame")).not.toBeInTheDocument();
    expect(screen.getByText(copy.masked)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: copy.reveal }));
    expect(screen.getByText("resultado do exame")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: copy.hide }));
    expect(screen.queryByText("resultado do exame")).not.toBeInTheDocument();
  });

  it("says nothing about the object on an unavailable card", () => {
    render(<ConversationCardView card={unavailableCard("person")} locale="pt-BR" />);
    expect(screen.getByText(copy.states.unavailable)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("2K-CARD-009: the card advertises only the reversal it has", () => {
  it("says nothing about undo when the reversal is `none`", () => {
    render(
      <ConversationCardView
        card={readOnlyPreviewCard({ cardType: "file", objectId: "f1" })}
        locale="pt-BR"
      />,
    );
    expect(screen.queryByText(copy.reversal.archival)).not.toBeInTheDocument();
    expect(screen.queryByText(copy.reversal.undoWindow(24))).not.toBeInTheDocument();
  });

  it("states an archival reversal in its own words, never a sibling's window", () => {
    render(
      <ConversationCardView
        card={{
          ...unavailableCard("memory"),
          state: "accepted",
          reversal: { kind: "archival" },
        }}
        locale="pt-BR"
      />,
    );
    expect(screen.getByText(copy.reversal.archival)).toBeInTheDocument();
    expect(screen.queryByText(copy.reversal.undoWindow(24))).not.toBeInTheDocument();
  });

  it("states the task window when the card truly has one", () => {
    render(
      <ConversationCardView
        card={{
          ...unavailableCard("task"),
          state: "accepted",
          reversal: { kind: "undo_window", windowHours: 24 },
        }}
        locale="pt-BR"
      />,
    );
    expect(screen.getByText(copy.reversal.undoWindow(24))).toBeInTheDocument();
  });
});
