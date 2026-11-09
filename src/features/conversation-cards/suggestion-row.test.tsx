/**
 * `2K-SUGG-003/004/005` and Life Brain B.7 — what the row draws, and what it
 * refuses to draw.
 *
 * The two properties that changed on 5 November 2026 are both here: a chip is
 * now a **control that fills** (and still never one that sends), and six new
 * categories have sentences in both locales.
 */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComposerSeedProvider, useRegisterComposerSeed } from "@/features/capture/composer-seed";

const shown = vi.fn();
const shownSource = vi.fn();
vi.mock("@/features/product-analytics/interaction-events", () => ({
  ConversationSuggestionsShown: (props: { categories: readonly string[]; source?: string }) => {
    shown(props.categories);
    shownSource(props.source);
    return null;
  },
}));

const { SuggestionRow } = await import("./suggestion-row");
const { getConversationCardsCopy } = await import("./copy");
const { SUGGESTION_CATEGORIES } = await import("./suggestions");

afterEach(() => {
  cleanup();
  shown.mockClear();
  shownSource.mockClear();
});

function suggestion(category: string, id: string, name: string) {
  return { category, id, name } as never;
}

/** The composer, reduced to the one thing a chip needs from it. */
function Field() {
  const node = useRef<HTMLTextAreaElement | null>(null);
  useRegisterComposerSeed((text) => {
    if (node.current !== null) node.current.value = text;
  });
  return <textarea aria-label="field" ref={node} />;
}

function renderRow(suggestions: readonly ReturnType<typeof suggestion>[], locale: "pt-BR" | "en" = "pt-BR") {
  return render(
    <ComposerSeedProvider>
      <Field />
      <SuggestionRow locale={locale} suggestions={suggestions} />
    </ComposerSeedProvider>,
  );
}

describe("SuggestionRow: nothing, when there is nothing to say", () => {
  it("renders no label, no list and no event for an empty derivation", () => {
    const { container } = render(<SuggestionRow locale="pt-BR" suggestions={[]} />);
    expect(container.querySelector(".conversation-suggestions")).toBeNull();
    expect(shown).not.toHaveBeenCalled();
  });
});

describe("SuggestionRow: every category has a sentence, in both locales", () => {
  it("renders a question for each of the eight categories", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const copy = getConversationCardsCopy(locale).suggestions;
      for (const category of SUGGESTION_CATEGORIES) {
        cleanup();
        renderRow([suggestion(category, "x1", "Ana")], locale);
        const question = copy.byCategory[category]("Ana");
        expect(question.length, `${locale}:${category}`).toBeGreaterThan(0);
        expect(screen.getByRole("button", { name: copy.fill(question) })).toBeInTheDocument();
      }
    }
  });

  it("names the subject where naming helps, and does not where it does not", () => {
    const copy = getConversationCardsCopy("pt-BR").suggestions;
    expect(copy.byCategory.overdue_task("Pagar a escola")).toContain("Pagar a escola");
    expect(copy.byCategory.due_today("Levar o carro")).toContain("Levar o carro");
    expect(copy.byCategory.reminder_soon("Consulta")).toContain("Consulta");
    // The owner's own wording, and a question about the week rather than about
    // a person.
    expect(copy.byCategory.birthday_soon("Ana")).toBe("Tem algum aniversário próximo?");
    expect(copy.byCategory.open_question("Qual escola?")).not.toContain("Qual escola?");
    expect(copy.byCategory.unreviewed_entry("Fui ao mercado")).not.toContain("Fui ao mercado");
  });

  it("tags each row with its category, so a surface can style or find one", () => {
    const { container } = renderRow([suggestion("overdue_task", "t1", "Pagar a escola")]);
    expect(container.querySelector('[data-category="overdue_task"]')).not.toBeNull();
  });
});

describe("LB-SUGG-004: the chip fills the field", () => {
  it("puts its question in the composer when tapped", async () => {
    renderRow([suggestion("person", "p1", "Ana")]);
    const copy = getConversationCardsCopy("pt-BR").suggestions;
    const question = copy.byCategory.person("Ana");

    await userEvent.click(screen.getByRole("button", { name: copy.fill(question) }));
    expect(screen.getByLabelText("field")).toHaveValue(question);
  });

  it("is a button, not a submit, and sits in no form", () => {
    const { container } = renderRow([suggestion("person", "p1", "Ana")]);
    const chip = screen.getByRole("button");
    expect(chip).toHaveAttribute("type", "button");
    expect(chip.closest("form")).toBeNull();
    expect(container.querySelector("form")).toBeNull();
  });

  it("announces what it does, rather than reading as a question being asked", () => {
    renderRow([suggestion("person", "p1", "Ana")]);
    // `2K-SUGG-004`: the sentence is what the owner *could* type. The control's
    // accessible name says it goes in the field, so a screen reader user is not
    // told the product is about to ask it.
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/^Escrever no campo: /);
  });

  it("degrades to plain text when no composer is listening", () => {
    const { container } = render(
      <SuggestionRow locale="pt-BR" suggestions={[suggestion("person", "p1", "Ana")]} />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".conversation-suggestion-text")?.textContent)
      .toBe(getConversationCardsCopy("pt-BR").suggestions.byCategory.person("Ana"));
  });
});

describe("2K-SUGG-005: every category reaches telemetry, and no name does", () => {
  it("reports person and project", () => {
    renderRow([suggestion("person", "p1", "Ana"), suggestion("project", "j1", "Aurora")]);
    expect(shown).toHaveBeenCalledWith(["person", "project"]);
  });

  it("reports the six dated categories too, in the order they were shown", () => {
    /*
      This case was its own inverse until `202611060108` was spent. It read
      "withholds the six categories `record_product_event` would refuse", and it
      was true: the database validated this property against
      `array['person','project']`, the writer is fail-open, so a dated category
      would have been swallowed and the surface would have looked instrumented
      while reporting nothing.

      The owner authorized the migration (ADR-161) and it landed first, in the
      same pull request. The assertion is the full list now, so a narrowing that
      came back would red here rather than quietly stop reporting six
      categories again.
    */
    renderRow([
      suggestion("overdue_task", "t1", "Pagar a escola"),
      suggestion("birthday_soon", "p9", "Ana"),
      suggestion("person", "p1", "Ana"),
    ]);
    expect(shown).toHaveBeenCalledWith(["overdue_task", "birthday_soon", "person"]);
  });

  it("reports who chose them — the date rules by default, the model when it did (B.8)", () => {
    renderRow([suggestion("person", "p1", "Ana")]);
    expect(shownSource).toHaveBeenLastCalledWith("derived");
    cleanup();
    render(
      <ComposerSeedProvider>
        <SuggestionRow locale="pt-BR" source="model" suggestions={[suggestion("person", "p1", "Ana")]} />
      </ComposerSeedProvider>,
    );
    expect(shownSource).toHaveBeenLastCalledWith("model");
  });

  it("carries no name, in any category", () => {
    renderRow([suggestion("person", "p1", "Marina"), suggestion("overdue_task", "t1", "Biópsia")]);
    expect(JSON.stringify(shown.mock.calls)).not.toContain("Marina");
    expect(JSON.stringify(shown.mock.calls)).not.toContain("Biópsia");
  });
});
