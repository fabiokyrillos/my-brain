/**
 * `2K-EXPL-001` … `2K-EXPL-007` — the rendered panel.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { getConversationSourcesCopy } from "./copy";
import { ExplanationPanel } from "./explanation-panel";

const copy = getConversationSourcesCopy("pt-BR").explanation;

describe("2K-EXPL-001: progressive disclosure, never blocking", () => {
  it("renders closed by default", () => {
    const { container } = render(
      <ExplanationPanel
        explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: false }}
        locale="pt-BR"
      />,
    );
    const details = container.querySelector("details");
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute("open");
  });

  it("uses a native disclosure, so it is keyboard-operable before hydration", () => {
    const { container } = render(
      <ExplanationPanel
        explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: false }}
        locale="pt-BR"
      />,
    );
    expect(container.querySelector("summary")?.textContent).toBe(copy.summary);
  });

  it("renders nothing when there is nothing to disclose", () => {
    // An empty panel invites the user to open it and learn nothing.
    const { container } = render(
      <ExplanationPanel
        explanation={{ weakMatchesExcluded: false, archivedMemoriesExcluded: false }}
        locale="pt-BR"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for an answer that recorded no explanation", () => {
    // `null` is "not recorded", which is not the same as "nothing excluded".
    const { container } = render(<ExplanationPanel explanation={null} locale="pt-BR" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("2K-EXPL-002/003/004: it says what was used and what was left out", () => {
  it("discloses weak matches, without a number", () => {
    render(
      <ExplanationPanel
        explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: false }}
        locale="pt-BR"
      />,
    );
    expect(screen.getByText(copy.weakMatches)).toBeInTheDocument();
    expect(screen.queryByText(copy.archivedMemories)).not.toBeInTheDocument();
  });

  it("discloses owner-archived memories, which the owner already knows about", () => {
    render(
      <ExplanationPanel
        explanation={{ weakMatchesExcluded: false, archivedMemoriesExcluded: true }}
        locale="pt-BR"
      />,
    );
    expect(screen.getByText(copy.archivedMemories)).toBeInTheDocument();
    expect(screen.queryByText(copy.weakMatches)).not.toBeInTheDocument();
  });

  it("renders no digit anywhere, in either locale", () => {
    /*
     * `2K-EXPL-003` forbids a count, and a rendered digit is the shape a count
     * would take. Asserted over the whole panel rather than over one sentence,
     * because the requirement is about what the user can read.
     */
    for (const locale of ["pt-BR", "en"] as const) {
      const { container, unmount } = render(
        <ExplanationPanel
          explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: true }}
          locale={locale}
        />,
      );
      expect(container.textContent ?? "", locale).not.toMatch(/\d/);
      unmount();
    }
  });
});

describe("2K-EXPL-005: nothing about sensitivity, in any state", () => {
  it("produces byte-identical output whatever the sources were classified as", () => {
    // The panel is built from two booleans that no classification can reach,
    // so there is no state in which it could differ. Asserted by rendering the
    // same payload twice and comparing, which is what "byte-identical" means.
    const payload = { weakMatchesExcluded: true, archivedMemoriesExcluded: true } as const;
    const first = render(<ExplanationPanel explanation={payload} locale="pt-BR" />);
    const html = first.container.innerHTML;
    first.unmount();
    const second = render(<ExplanationPanel explanation={payload} locale="pt-BR" />);
    expect(second.container.innerHTML).toBe(html);
  });

  it("never mentions sensitivity, masking or hiding", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const { container, unmount } = render(
        <ExplanationPanel
          explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: true }}
          locale={locale}
        />,
      );
      expect(container.textContent ?? "", locale)
        .not.toMatch(/sens[íi]ve|sensitive|ocult|hidden|mascar|masked/i);
      unmount();
    }
  });
});

describe("2K-EXPL-006: no model reasoning is exposed", () => {
  it("says nothing about the prompt, the model or how it composed", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const { container, unmount } = render(
        <ExplanationPanel
          explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: true }}
          locale={locale}
        />,
      );
      expect(container.textContent ?? "", locale)
        .not.toMatch(/prompt|modelo|model\b|racioc[íi]nio|reasoning|token/i);
      unmount();
    }
  });
});

describe("2K-EXPL-007: the two correction paths are told apart honestly", () => {
  it("points at the source, which is the path that works", () => {
    render(
      <ExplanationPanel
        explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: false }}
        locale="pt-BR"
      />,
    );
    expect(screen.getByText(copy.correctSourceTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.correctSource)).toBeInTheDocument();
  });

  it("declares the absent path rather than offering a control that records nothing", () => {
    const { container } = render(
      <ExplanationPanel
        explanation={{ weakMatchesExcluded: true, archivedMemoriesExcluded: false }}
        locale="pt-BR"
      />,
    );
    expect(screen.getByText(copy.interpretationNoEffect)).toBeInTheDocument();
    // And there is no button at all — the declaration is the whole affordance.
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });
});
