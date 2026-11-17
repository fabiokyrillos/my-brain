/**
 * `2K-CARD-007` — the read-only preview, for the five object types OD-2K-B
 * keeps out of mutation.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { READ_ONLY_CONVERSATION_CARD_TYPES, readOnlyPreviewCard } from "./contracts";
import { getConversationCardsCopy } from "./copy";
import { ReadOnlyPreview } from "./read-only-preview";

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const copy = getConversationCardsCopy("pt-BR");

describe("2K-CARD-007: every read-only type renders a label, a link and its source", () => {
  for (const cardType of READ_ONLY_CONVERSATION_CARD_TYPES) {
    it(`renders a ${cardType} preview with its type label and link`, () => {
      const { unmount } = render(
        <ReadOnlyPreview
          card={readOnlyPreviewCard({
            cardType,
            objectId: "o1",
            snippet: "trecho",
            sensitivity: "normal",
            href: `/pt-BR/app/${cardType}/o1`,
          })}
          locale="pt-BR"
        />,
      );
      expect(screen.getByText(copy.types[cardType])).toBeInTheDocument();
      expect(screen.getByRole("link", { name: copy.open })).toHaveAttribute(
        "href",
        `/pt-BR/app/${cardType}/o1`,
      );
      expect(screen.getByText("trecho")).toBeInTheDocument();
      unmount();
    });
  }

  it("renders no link when there is nowhere safe to send the user", () => {
    render(
      <ReadOnlyPreview
        card={readOnlyPreviewCard({ cardType: "file", objectId: "f1", href: null })}
        locale="pt-BR"
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing where a snippet would go when there is no snippet", () => {
    render(
      <ReadOnlyPreview
        card={readOnlyPreviewCard({ cardType: "person", objectId: "p1" })}
        locale="pt-BR"
      />,
    );
    expect(screen.queryByTestId("conversation-card-snippet")).not.toBeInTheDocument();
  });
});

describe("2K-CARD-008: the read-only preview exposes no mutating control", () => {
  it("renders no form, no submit and no button of any kind", () => {
    const { container } = render(
      <ReadOnlyPreview
        card={readOnlyPreviewCard({
          cardType: "project",
          objectId: "p1",
          snippet: "Aurora",
          sensitivity: "normal",
          href: "/pt-BR/app/projects/p1",
        })}
        locale="pt-BR"
      />,
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });

  it("renders no control at all for a highly sensitive snippet", () => {
    // Life Brain E.8 (ADR-178): the snippet is shown in the clear, so not even
    // a reveal control is drawn.
    const { container } = render(
      <ReadOnlyPreview
        card={readOnlyPreviewCard({
          cardType: "entry",
          objectId: "e1",
          snippet: "resultado do exame",
          sensitivity: "highly_sensitive",
        })}
        locale="pt-BR"
      />,
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(container.textContent).toContain("resultado do exame");
  });
});
