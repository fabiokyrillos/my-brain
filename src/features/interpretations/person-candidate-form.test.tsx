import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PersonCandidateForm } from "./person-candidate-form";
import type { PersonCandidateActionState } from "./person-candidate-actions";

const candidates = [
  { candidateIndex: 0, originalName: "Giovanna (Gigi)", proposedName: "Giovanna (Gigi)", evidence: "pra Giovanna", confidence: 1, role: null },
  { candidateIndex: 1, originalName: "Jaime", proposedName: "Jaime", evidence: "para Jaime", confidence: 0.9, role: null },
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

function submitted(action: unknown, call = 0): FormData {
  return vi.mocked(action as (state: unknown, formData: FormData) => unknown).mock.calls[call]?.[1] as FormData;
}

describe("PersonCandidateForm", () => {
  it("renders nothing when there are no pending candidates", () => {
    renderForm({ candidates: [] });
    expect(screen.queryByRole("list", { name: "Pessoas mencionadas" })).not.toBeInTheDocument();
  });

  it("asks one question per person, with its answers beside it and the name field at rest hidden", () => {
    renderForm();
    expect(screen.getByRole("list", { name: "Pessoas mencionadas" })).toBeInTheDocument();
    const giovanna = screen.getByRole("group", { name: "Pessoa mencionada: Giovanna (Gigi)" });
    expect(within(giovanna).getByText("Criar a pessoa “Giovanna (Gigi)”?")).toBeVisible();
    expect(within(giovanna).getByRole("button", { name: "Criar pessoa" })).toBeEnabled();
    expect(within(giovanna).getByRole("button", { name: "Ignorar" })).toBeEnabled();
    expect(within(giovanna).getByRole("button", { name: "Mudar o nome" })).toHaveAttribute("aria-expanded", "false");
    expect(within(giovanna).getByLabelText("Nome para criar: Giovanna (Gigi)")).not.toBeVisible();
    // The batch control is gone: there is nothing left to save separately.
    expect(screen.queryByRole("button", { name: /Salvar decisões/ })).toBeNull();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("writes one decision per tap, and only that person's", async () => {
    const user = userEvent.setup();
    const { action } = renderForm();
    const jaime = screen.getByRole("group", { name: "Pessoa mencionada: Jaime" });

    await user.click(within(jaime).getByRole("button", { name: "Ignorar" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    const formData = submitted(action);
    expect(JSON.parse(String(formData.get("resolutions")))).toEqual([{ candidateIndex: 1, disposition: "rejected" }]);
    // The envelope the server checks is unchanged from the form it replaced.
    expect(formData.get("entryId")).toBe("72f1f8af-8b90-4f1d-9916-ec6d983fd4c6");
    expect(formData.get("expectedInterpretationId")).toBe("94f6c9d0-2f4e-4a2e-8f2c-9b2a3c4d5e6f");
    expect(formData.get("operationKey")).toBe("6118fb25-2f80-432a-aa96-0e76d924862e");
    expect(formData.get("locale")).toBe("pt-BR");
  });

  it("creates with the name as edited, and says so in the question before it is tapped", async () => {
    const user = userEvent.setup();
    const { action } = renderForm();
    const giovanna = screen.getByRole("group", { name: "Pessoa mencionada: Giovanna (Gigi)" });

    await user.click(within(giovanna).getByRole("button", { name: "Mudar o nome" }));
    const name = within(giovanna).getByLabelText("Nome para criar: Giovanna (Gigi)");
    expect(name).toBeVisible();
    await user.clear(name);
    // An empty name cannot be created; ignoring is still possible.
    expect(within(giovanna).getByRole("button", { name: "Criar pessoa" })).toBeDisabled();
    expect(within(giovanna).getByRole("button", { name: "Ignorar" })).toBeEnabled();
    await user.type(name, "Giovanna");
    expect(within(giovanna).getByText("Criar a pessoa “Giovanna”?")).toBeVisible();
    await user.click(within(giovanna).getByRole("button", { name: "Criar pessoa" }));

    await waitFor(() => expect(action).toHaveBeenCalledOnce());
    expect(JSON.parse(String(submitted(action).get("resolutions")))).toEqual([
      { candidateIndex: 0, disposition: "confirmed", resolvedName: "Giovanna" },
    ]);
  });

  it("uses a new operation key for the next decision once one has been written", async () => {
    const user = userEvent.setup();
    const { action } = renderForm();

    await user.click(within(screen.getByRole("group", { name: "Pessoa mencionada: Jaime" })).getByRole("button", { name: "Ignorar" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await user.click(within(screen.getByRole("group", { name: "Pessoa mencionada: Giovanna (Gigi)" })).getByRole("button", { name: "Criar pessoa" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));

    expect(submitted(action, 1).get("operationKey")).not.toBe(submitted(action, 0).get("operationKey"));
  });

  it("offers to undo what a tap wrote", async () => {
    const user = userEvent.setup();
    renderForm({ undoAction: vi.fn(async () => ({ status: "success" as const, message: "Desfeito." })) });

    await user.click(within(screen.getByRole("group", { name: "Pessoa mencionada: Jaime" })).getByRole("button", { name: "Ignorar" }));

    expect(await screen.findByText("Decisões salvas.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Desfazer" })).toBeVisible();
  });

  it("uses English accessible copy", () => {
    renderForm({ locale: "en", candidates: [candidates[0]!] });
    expect(screen.getByRole("list", { name: "People mentioned" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create person" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ignore" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change the name" })).toBeInTheDocument();
  });
});

/**
 * The layout contract, asserted where CI can see it.
 *
 * The owner once reported this card at ~440px with its evidence wrapping one
 * word per line and its name field invisible. The cause was **one layout class
 * shared by two different shapes**: `.candidate-item` describes the task form's
 * `<label>` (a hidden checkbox, a 24px indicator, a copy block), and its rule
 * `.candidate-item>input{position:absolute;opacity:0;pointer-events:none}` hid
 * this component's text input.
 *
 * The card has since become a row with buttons (owner, 2026-11-17), and the
 * same contract holds for the new shape. The geometry is measured with a real
 * engine in `e2e/layout-contracts.spec.ts`; these assertions are about the
 * **declarations**, and they live here because that file does not run in CI.
 */
describe("the person-candidate row's layout contract", () => {
  const stylesheet = () =>
    readFileSync(join(__dirname, "..", "..", "app", "operations.css"), "utf8").replace(/\r\n/g, "\n");

  function ruleFor(css: string, selector: string, from = 0): string {
    const at = css.indexOf(`${selector}{`, from);
    expect(at, `${selector} has no rule in operations.css`).toBeGreaterThan(-1);
    return css.slice(at + selector.length + 1, css.indexOf("}", at));
  }

  it("emits its own classes and never the task form's layout class", () => {
    const { container } = renderForm();
    const rows = [...container.querySelectorAll(".person-candidate-item")];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.querySelectorAll(":scope > .person-candidate-question")).toHaveLength(1);
      expect(row.querySelectorAll(":scope > .person-candidate-evidence")).toHaveLength(1);
      expect(row.querySelectorAll(":scope > .person-candidate-actions")).toHaveLength(1);
      expect(row.querySelectorAll(":scope > .person-candidate-name")).toHaveLength(1);
      expect(row.querySelectorAll(".person-candidate-actions button")).toHaveLength(3);
      // The name field is a child of its own wrapper, not a bare direct child
      // of the row, which is what the hiding rule caught.
      expect(row.querySelectorAll(".person-candidate-name input[type='text']")).toHaveLength(1);
      expect(row.querySelectorAll(":scope > input")).toHaveLength(0);
    }
    expect(container.querySelectorAll(".candidate-item"), "the task form's layout class came back")
      .toHaveLength(0);
  });

  it("gives every child the main column explicitly, and lets it shrink", () => {
    const css = stylesheet();
    const row = ruleFor(css, ".person-candidate-item");
    expect(row, "the row lost its single-column grid").toContain("grid-template-columns:minmax(0,1fr)");
    expect(row, "a fixed leading track was reserved again").not.toMatch(/grid-template-columns:\s*\d/);
    expect(row, "the row is a card again").not.toContain("border-radius");
    const child = ruleFor(css, ".person-candidate-item>*");
    expect(child, "children are auto-placed again").toContain("grid-column:1");
    expect(child, "a long unbroken word can set the column's floor").toContain("min-width:0");
  });

  it("keeps the name field visible, clickable and full width when it is asked for", () => {
    const css = stylesheet();
    const rule = ruleFor(css, ".person-candidate-name input");
    expect(rule).toContain("width:100%");
    expect(rule).toContain("min-width:0");
    expect(rule).toMatch(/min-height:44px/);
    expect(rule, "the field is styled as a box-sizing:content-box control")
      .toContain("box-sizing:border-box");
    // `display:grid` on the wrapper would otherwise defeat the `hidden` attribute.
    expect(ruleFor(css, ".person-candidate-name[hidden]")).toContain("display:none");
  });

  it("gives each answer a real touch target, and lets the answers wrap", () => {
    const css = stylesheet();
    expect(ruleFor(css, ".person-candidate-actions .ui-button")).toMatch(/min-height:44px/);
    const actions = ruleFor(css, ".person-candidate-actions");
    expect(actions).toContain("display:flex");
    expect(actions, "three answers cannot fit one line at 320px").toContain("flex-wrap:wrap");
  });

  it("has no shared layout class left to borrow from", () => {
    /*
      This used to assert that `.candidate-item` — the task form's `<label>`,
      with its 24px indicator column and hidden checkbox — was left untouched,
      because the defect was reuse, not the rule. The task form has since become
      rows too and dropped the checkbox, so the class has no owner: this row
      must not emit it, and no rule may remain for a later component to pick up
      by accident. Comments are stripped first; one still quotes the old rule.
    */
    const { container } = renderForm();
    for (const element of container.querySelectorAll("[class]")) {
      expect([...element.classList], "the person row emits the retired layout class")
        .not.toContain("candidate-item");
    }
    const rules = stylesheet().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules, "a `.candidate-item` rule is back").not.toMatch(/\.candidate-item(?![\w-])/);
    expect(rules, "a `.candidate-check` rule is back").not.toMatch(/\.candidate-check(?![\w-])/);
  });
});

describe("Life Brain C.2: the role the reading gave a person", () => {
  it("is shown beside the name, and nothing is shown when there is none", () => {
    renderForm({ candidates: [{ ...candidates[0]!, originalName: "Dr. Silva", proposedName: "Dr. Silva", role: "cardiologista" }, candidates[1]!] });
    expect(screen.getByText("· cardiologista")).toBeInTheDocument();
    expect(document.querySelectorAll(".person-candidate-role")).toHaveLength(1);
  });
});
