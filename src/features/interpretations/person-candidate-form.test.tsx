import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonCandidateForm } from "./person-candidate-form";
import type { PersonCandidateActionState } from "./person-candidate-actions";

const candidates = [
  { candidateIndex: 0, originalName: "Giovanna (Gigi)", proposedName: "Giovanna (Gigi)", evidence: "pra Giovanna", confidence: 1 },
  { candidateIndex: 1, originalName: "Jaime", proposedName: "Jaime", evidence: "para Jaime", confidence: 0.9 },
];
const idle: PersonCandidateActionState = { status: "idle", message: "", undoId: null };

function renderForm(overrides: Partial<React.ComponentProps<typeof PersonCandidateForm>> = {}) {
  const action = overrides.action ?? vi.fn(async () => ({
    status: "success" as const,
    code: "resolved" as const,
    message: "Decisões salvas.",
    undoId: "undo-1",
    retryable: false,
  }));
  return {
    action,
    ...render(<PersonCandidateForm
      action={action}
      candidates={candidates}
      entryId="72f1f8af-8b90-4f1d-9916-ec6d983fd4c6"
      interpretationId="94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f"
      locale="pt-BR"
      operationKey="6118fb25-2f80-432a-aa96-0e76d924862e"
      initialState={idle}
      {...overrides}
    />),
  };
}

describe("PersonCandidateForm", () => {
  it("renders no form when there are no pending candidates", () => {
    renderForm({ candidates: [] });
    expect(screen.queryByRole("group", { name: "Pessoas mencionadas" })).not.toBeInTheDocument();
  });

  it("starts with no decision selected and keeps name editing disabled", () => {
    renderForm();
    expect(screen.getByRole("group", { name: "Pessoas mencionadas" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio").every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByLabelText("Nome para criar: Giovanna (Gigi)")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Salvar decisões sobre pessoas" })).toBeDisabled();
  });

  it("submits independent create and ignore decisions with an edited name", async () => {
    const user = userEvent.setup();
    const { action } = renderForm();
    const giovanna = screen.getByRole("group", { name: "Pessoa mencionada: Giovanna (Gigi)" });
    const jaime = screen.getByRole("group", { name: "Pessoa mencionada: Jaime" });

    await user.click(within(giovanna).getByRole("radio", { name: "Criar pessoa" }));
    const name = within(giovanna).getByLabelText("Nome para criar: Giovanna (Gigi)");
    await user.clear(name);
    await user.type(name, "Giovanna");
    await user.click(within(jaime).getByRole("radio", { name: "Ignorar menção" }));
    await user.click(screen.getByRole("button", { name: "Salvar decisões sobre pessoas" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const submitted = vi.mocked(action).mock.calls[0]?.[1] as FormData;
    expect(JSON.parse(String(submitted.get("resolutions")))).toEqual([
      { candidateIndex: 0, disposition: "confirmed", resolvedName: "Giovanna" },
      { candidateIndex: 1, disposition: "rejected" },
    ]);
  });

  it("uses English accessible copy", () => {
    renderForm({ locale: "en", candidates: [candidates[0]] });
    expect(screen.getByRole("group", { name: "People mentioned" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Create person" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Ignore mention" })).toBeInTheDocument();
  });
});

/**
 * The layout contract, asserted where CI can see it.
 *
 * The owner reported this card at ~440px: the evidence in an extremely narrow
 * column wrapping one word per line, `Criar pessoa` colliding with it, the form
 * illegible. The cause was **one layout class shared by two different shapes**.
 *
 * `.candidate-item` describes the task form's `<label>` — a visually hidden
 * checkbox, a 24px check indicator, a copy block — so it declares
 * `grid-template-columns:24px 1fr auto` together with
 * `.candidate-item>input{position:absolute;opacity:0;pointer-events:none}`.
 * This component put that class on a `<fieldset>` whose children are a legend,
 * an evidence paragraph, two radio options, a name label and a text input.
 * Measured at a 440px viewport before the fix: the evidence occupied a **24px**
 * column at **1.00 word per line**, the name label likewise, and the text input
 * was `position:absolute; opacity:0; pointer-events:none` — **invisible and
 * unreachable**, a functional defect and not only a visual one.
 *
 * The geometry is measured with a real engine in `e2e/layout-contracts.spec.ts`
 * (four widths, long evidence, long name, several candidates, both decision
 * states, keyboard, print) — jsdom implements no grid algorithm. These
 * assertions are about the **declarations**, and they live here because that
 * Playwright file does not run in CI.
 */
describe("the person-candidate card's layout contract", () => {
  const stylesheet = () =>
    readFileSync(join(__dirname, "..", "..", "app", "operations.css"), "utf8").replace(/\r\n/g, "\n");

  function ruleFor(css: string, selector: string, from = 0): string {
    const at = css.indexOf(`${selector}{`, from);
    expect(at, `${selector} has no rule in operations.css`).toBeGreaterThan(-1);
    return css.slice(at + selector.length + 1, css.indexOf("}", at));
  }

  it("emits its own classes and never the task form's layout class", () => {
    const { container } = renderForm();
    const cards = [...container.querySelectorAll(".person-candidate-item")];
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.querySelectorAll(":scope > .person-candidate-evidence")).toHaveLength(1);
      expect(card.querySelectorAll(":scope > .person-candidate-options")).toHaveLength(1);
      expect(card.querySelectorAll(":scope > .person-candidate-name")).toHaveLength(1);
      // The two options are grouped, not scattered across the fieldset.
      expect(card.querySelectorAll(".person-candidate-options input[type='radio']")).toHaveLength(2);
      // And the name field is a real child of its own wrapper, not a bare
      // direct child of the fieldset, which is what the hiding rule caught.
      expect(card.querySelectorAll(".person-candidate-name input[type='text']")).toHaveLength(1);
      expect(card.querySelectorAll(":scope > input")).toHaveLength(0);
    }
    expect(container.querySelectorAll(".candidate-item"), "the task form's layout class came back")
      .toHaveLength(0);
  });

  it("gives every child the main column explicitly, and lets it shrink", () => {
    const css = stylesheet();
    const card = ruleFor(css, ".person-candidate-item");
    expect(card, "the card lost its single-column grid").toContain("grid-template-columns:minmax(0,1fr)");
    expect(card, "a fixed leading track was reserved again").not.toMatch(/grid-template-columns:\s*\d/);
    const child = ruleFor(css, ".person-candidate-item>*");
    expect(child, "children are auto-placed again").toContain("grid-column:1");
    expect(child, "a long unbroken word can set the column's floor").toContain("min-width:0");
  });

  it("keeps the name field visible, clickable and full width", () => {
    // The exact three properties the shared rule had imposed on it.
    const rule = ruleFor(stylesheet(), ".person-candidate-name input");
    expect(rule).toContain("width:100%");
    expect(rule).toContain("min-width:0");
    expect(rule).toMatch(/min-height:44px/);
    expect(rule, "the field is styled as a box-sizing:content-box control")
      .toContain("box-sizing:border-box");
  });

  it("gives each option a real touch target", () => {
    const rule = ruleFor(stylesheet(), ".person-candidate-options label");
    expect(rule).toMatch(/min-height:44px/);
    expect(rule, "the radio and its text are not on one line").toContain("display:flex");
  });

  it("splits the options on the container's width, not the viewport's", () => {
    // The card renders in the decision column, which is wide on desktop and
    // full width on a phone — the viewport does not describe it.
    const css = stylesheet();
    expect(ruleFor(css, ".person-candidate-item"), "the card is not a query container")
      .toMatch(/container:\s*person-candidate\/inline-size/);
    const query = css.indexOf("@container person-candidate (min-width:380px)");
    expect(query, "the two-column state is gone").toBeGreaterThan(-1);
    expect(ruleFor(css, ".person-candidate-options", query)).toContain("grid-template-columns:repeat(2,minmax(0,1fr))");
    // Stacked is the base, so a browser without container queries is readable.
    expect(ruleFor(css, ".person-candidate-options"), "stacked is not the base")
      .not.toContain("grid-template-columns");
  });

  it("leaves the task form's own rules untouched", () => {
    /*
      The regression this fix must not cause. `.candidate-item` still belongs to
      `task-candidate-form.tsx`, and its 24px indicator column and hidden
      checkbox are correct **there** — the defect was reuse, not the rule.
    */
    const css = stylesheet();
    expect(ruleFor(css, ".candidate-item")).toContain("grid-template-columns:24px 1fr auto");
    expect(ruleFor(css, ".candidate-item>input")).toContain("position:absolute");
    expect(ruleFor(css, ".candidate-check")).toContain("width:21px");
  });
});
