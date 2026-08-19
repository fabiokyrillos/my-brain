import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompanyPanel } from "./company-panel";
import { idleEntityEditState, type EntityEditState } from "./edit-state";

/**
 * `2P-PERSON-001` … `-004` — the company dialog.
 *
 * ## What only this level can answer
 *
 * The action tests prove the writes. What they cannot see is the property the
 * requirement is actually about: that **one** explicit act reaches the company,
 * that picking an existing one and creating a new one are the same flow rather
 * than two nested surfaces, that cancelling writes nothing, and that the
 * created-but-not-linked outcome sends the owner to the selector instead of
 * leaving them in front of a name field that has already worked.
 *
 * ## The dialog contract is inherited, not re-tested here
 *
 * Initial focus, the Tab cycle and Escape-restores-focus belong to
 * `ConfirmDialog` and are asserted in `command-console.test.tsx`, against the
 * same component this mounts. What is asserted here is that this consumer really
 * uses it — a dialog is present with its own `aria-labelledby` target, and the
 * panel does not hand-roll a second one — plus the two behaviours that are this
 * component's own.
 */

const ORGANIZATION_ID = "44444444-4444-4444-8444-444444444444";
const PERSON_ID = "33333333-3333-4333-8333-333333333333";

const organizations = [
  { id: ORGANIZATION_ID, name: "Acme" },
  { id: "55555555-5555-4555-8555-555555555555", name: "Beta" },
];

/**
 * An action that resolves to a fixed state, and records what it was sent.
 *
 * Typed with the real signature rather than `async () => state`: without the
 * parameters, `mock.calls[0]` is the empty tuple and the assertion that the
 * FormData carries only three keys cannot be written at all.
 */
type Action = (state: EntityEditState, formData: FormData) => Promise<EntityEditState>;

function resolvesTo(state: EntityEditState) {
  return vi.fn<Action>(async () => state);
}

function mount(overrides: Partial<Parameters<typeof CompanyPanel>[0]> = {}) {
  const createAction = overrides.createAction ?? resolvesTo(idleEntityEditState);
  const linkAction = overrides.linkAction ?? resolvesTo(idleEntityEditState);
  render(
    <CompanyPanel
      createAction={createAction}
      linkAction={linkAction}
      locale="pt-BR"
      organizationId={null}
      organizationName={null}
      organizations={organizations}
      personId={PERSON_ID}
      {...overrides}
    />,
  );
  return { createAction, linkAction };
}

describe("CompanyPanel", () => {
  it("shows the company where it is displayed and opens in one act", async () => {
    mount({ organizationId: ORGANIZATION_ID, organizationName: "Acme" });

    // The value is on the page before anything is opened: the section answers
    // "where do they work" without the owner touching a control.
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // The shared dialog, namespaced — two dialogs open at once would otherwise
    // produce duplicate ids and silently point `aria-labelledby` at the wrong
    // heading.
    expect(dialog).toHaveAttribute("aria-labelledby", "entity-company-dialog-title");
    expect(screen.getByRole("heading", { name: "Empresa" })).toHaveAttribute(
      "id",
      "entity-company-dialog-title",
    );
  });

  it("offers picking an existing company and creating one in the same dialog", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));

    // Both halves are reachable from here, and neither opens a second dialog —
    // `2P-PERSON-002` and `2P-PERSON-004` in one assertion.
    expect(screen.getByRole("combobox", { name: "Empresa" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Criar nova empresa" }));

    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByLabelText("Nome da nova empresa")).toBeInTheDocument();
    // And back, without leaving the dialog.
    await userEvent.click(screen.getByRole("button", { name: "Escolher uma empresa existente" }));
    expect(screen.getByRole("combobox", { name: "Empresa" })).toBeInTheDocument();
  });

  it("submits the person and the chosen company, and nothing else", async () => {
    const linkAction = resolvesTo({ status: "success", message: "Empresa atualizada." });
    mount({ linkAction });

    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Empresa" }), ORGANIZATION_ID);
    await userEvent.click(screen.getByRole("button", { name: "Salvar empresa" }));

    await waitFor(() => expect(linkAction).toHaveBeenCalled());
    const submitted = linkAction.mock.calls[0]![1];
    expect(submitted.get("personId")).toBe(PERSON_ID);
    expect(submitted.get("organizationId")).toBe(ORGANIZATION_ID);
    expect(submitted.get("locale")).toBe("pt-BR");
    // The strict schema owns three keys. A name here would be this control
    // reaching a column it does not own.
    expect(submitted.get("name")).toBeNull();
    expect(submitted.get("notes")).toBeNull();
  });

  it("closes on success and keeps the outcome on the page", async () => {
    const linkAction = resolvesTo({ status: "success", message: "Empresa atualizada." });
    mount({ linkAction });

    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar empresa" }));

    // Announcing a save and then destroying the only evidence of it would leave
    // a screen-reader user with nothing to return to.
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Twice on purpose: once in the polite live region for a screen reader, once
    // visibly. `entity-edit-form.tsx` records the same pairing.
    expect(screen.getAllByText("Empresa atualizada.")).toHaveLength(2);
  });

  it("writes nothing when the dialog is cancelled", async () => {
    const { createAction, linkAction } = mount();

    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Empresa" }), ORGANIZATION_ID);
    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(linkAction).not.toHaveBeenCalled();
    expect(createAction).not.toHaveBeenCalled();
  });

  it("writes nothing when Escape closes the dialog", async () => {
    const { createAction, linkAction } = mount();

    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));
    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(linkAction).not.toHaveBeenCalled();
    expect(createAction).not.toHaveBeenCalled();
  });

  it("returns to the selector when a company was created but not linked", async () => {
    /*
     * `2P-PERSON-003`, the half that is behaviour rather than wording.
     *
     * The company exists. Leaving the create pane open would put the cursor back
     * in a name field that has just succeeded, which is an invitation to press it
     * again and end up with two companies of the same name — the duplicate the
     * requirement forbids inviting.
     */
    const createAction = resolvesTo({
      status: "error",
      message: "A empresa foi criada, mas não foi vinculada. Selecione-a na lista.",
      code: "createdButNotLinked",
    });
    mount({ createAction });

    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));
    await userEvent.click(screen.getByRole("button", { name: "Criar nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome da nova empresa"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    await waitFor(() => expect(createAction).toHaveBeenCalled());
    // Back on the selector, still inside the one dialog, with the true state
    // said and the next act named.
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Empresa" })).toBeInTheDocument());
    expect(screen.queryByLabelText("Nome da nova empresa")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A empresa foi criada, mas não foi vinculada.",
    );
    expect(screen.getByText(/já existe e está na lista/)).toBeInTheDocument();
  });

  it("stops reporting a create failure once a later link succeeds", async () => {
    /*
     * The derivation `createState.status !== "idle" ? createState : linkState`
     * looks equivalent to holding the last completed round and is not: the create
     * state stays non-idle forever, so the owner would fix the problem and go on
     * being told it was still broken.
     */
    const createAction = resolvesTo({
      status: "error",
      message: "A empresa foi criada, mas não foi vinculada. Selecione-a na lista.",
      code: "createdButNotLinked",
    });
    const linkAction = resolvesTo({ status: "success", message: "Empresa atualizada." });
    mount({ createAction, linkAction });

    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));
    await userEvent.click(screen.getByRole("button", { name: "Criar nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome da nova empresa"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Empresa" })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Empresa" }), ORGANIZATION_ID);
    await userEvent.click(screen.getByRole("button", { name: "Salvar empresa" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getAllByText("Empresa atualizada.").length).toBeGreaterThan(0);
    expect(screen.queryByText(/não foi vinculada/)).toBeNull();
  });

  it("offers no role control, because a person has no global role", async () => {
    // The owner's correction of `2P-PERSON-001`: a project role lives on
    // `person_projects`, a task role on `task_people`, each edited in its own
    // relation's context. A field here would be the synthesized global title the
    // decision forbids.
    mount({ organizationId: ORGANIZATION_ID, organizationName: "Acme" });
    await userEvent.click(screen.getByRole("button", { name: /Editar empresa/ }));

    expect(screen.queryByLabelText("Papel")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Papel|Cargo|Role/ })).toBeNull();
  });
});
