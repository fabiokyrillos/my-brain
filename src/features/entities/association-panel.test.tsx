import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssociationPanel, type AssociationTarget } from "./association-panel";
import type { EntityEditState } from "./edit-state";
import type { EntityEditAction } from "./entity-edit-form";

afterEach(cleanup);

const PERSON_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const CONTEXT_ID = "33333333-3333-4333-8333-333333333333";

const idle: EntityEditState = { status: "idle", message: "" };

function resolvesTo(state: EntityEditState) {
  return vi.fn<EntityEditAction>(async () => state);
}

function panel(
  target: AssociationTarget,
  overrides: Partial<Parameters<typeof AssociationPanel>[0]> = {},
) {
  return (
    <AssociationPanel
      addAction={resolvesTo(idle)}
      endAction={resolvesTo(idle)}
      heading="Seção"
      locale="pt-BR"
      options={[]}
      rows={[]}
      target={target}
      {...overrides}
    />
  );
}

const personContext: AssociationTarget = { kind: "person-context", personId: PERSON_ID };
const personProject: AssociationTarget = { kind: "person-project", personId: PERSON_ID };
const projectPerson: AssociationTarget = { kind: "project-person", projectId: PROJECT_ID };

describe("AssociationPanel", () => {
  it("explains an empty option list instead of offering a dead control", () => {
    // EGC-ASSOC-008, and the whole reason this initiative exists: `EG-04` was a
    // selector that reported emptiness while owning no way to fix it. A
    // disclosure that opens onto one empty dropdown is the same dead end.
    render(panel(personContext));

    expect(screen.getByText("Crie um contexto antes de vincular alguém a ele.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Vincular a um contexto" })).toBeNull();
  });

  it("says everything is linked, not 'create one first', when the owner owns some", async () => {
    // The defect the Camila journey caught. Linking a person to the owner's
    // ONLY context left the panel advising them to create a context — something
    // they already had — printed over the confirmation it had just replaced.
    // "You own none" and "you have linked them all" are different facts with
    // different next steps, and this is the assertion that keeps them apart.
    const linked: EntityEditState = { status: "success", message: "Vínculo criado." };
    render(panel(personContext, {
      addAction: resolvesTo(linked),
      options: [{ id: CONTEXT_ID, label: "Pessoal" }],
      rows: [{ id: CONTEXT_ID, label: "Pessoal", href: null }],
    }));

    expect(screen.getByText("Todos os seus contextos já estão vinculados a esta pessoa.")).toBeVisible();
    expect(screen.queryByText("Crie um contexto antes de vincular alguém a ele.")).toBeNull();
  });

  it("keeps the outcome readable in that state rather than replacing it with a hint", async () => {
    // The round that linked the last one is the round whose confirmation the
    // owner most needs to see: the control they used has just disappeared.
    const linked: EntityEditState = { status: "success", message: "Vínculo criado." };
    render(panel(personProject, {
      addAction: resolvesTo(linked),
      options: [{ id: PROJECT_ID, label: "Atlas" }],
      roleAction: resolvesTo(idle),
      rows: [],
    }));

    await userEvent.click(screen.getByRole("button", { name: "Vincular a um projeto" }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular projeto" }));

    // The panel's own rows do not change without a server round trip, so the
    // success state is what has to carry the news here.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Vínculo criado."));
  });

  it("names the missing thing per placement, not with one generic sentence", () => {
    const { unmount } = render(panel(personProject));
    expect(screen.getByText("Crie um projeto antes de vincular alguém a ele.")).toBeVisible();
    unmount();

    render(panel(projectPerson));
    expect(screen.getByText("Cadastre uma pessoa antes de vinculá-la a este projeto.")).toBeVisible();
  });

  it("does not offer an option the person is already linked to", async () => {
    // Offering it would produce a refusal the owner could have been spared, and
    // the refusal would read as a failure rather than as "already there".
    render(panel(personContext, {
      options: [{ id: CONTEXT_ID, label: "Pessoal" }, { id: "other", label: "Trabalho" }],
      rows: [{ id: CONTEXT_ID, label: "Pessoal", href: null }],
    }));

    await userEvent.click(screen.getByRole("button", { name: "Vincular a um contexto" }));
    const options = Array.from(screen.getByLabelText("Contexto").querySelectorAll("option"));
    expect(options.map((option) => option.textContent)).toEqual(["Trabalho"]);
  });

  it("submits personId and contextId for a person-context link, and no origin", async () => {
    // `person_contexts` has no `origin` in its schema, and every schema here is
    // `.strict()` — a stray field would be a refusal the owner could not read.
    const addAction = resolvesTo(idle);
    render(panel(personContext, { addAction, options: [{ id: CONTEXT_ID, label: "Pessoal" }] }));

    await userEvent.click(screen.getByRole("button", { name: "Vincular a um contexto" }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular contexto" }));

    await waitFor(() => expect(addAction).toHaveBeenCalled());
    const submitted = addAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("personId")).toBe(PERSON_ID);
    expect(submitted.get("contextId")).toBe(CONTEXT_ID);
    expect(submitted.get("origin")).toBeNull();
    expect(submitted.get("role")).toBeNull();
  });

  it("offers no role control on a context link, because the column has none", async () => {
    render(panel(personContext, { options: [{ id: CONTEXT_ID, label: "Pessoal" }] }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular a um contexto" }));
    expect(screen.queryByLabelText("Papel")).toBeNull();
  });

  /**
   * EGC-ASSOC-003 at the surface. The two placements write the same row, so they
   * must submit the same fields with only `origin` differing — the assertion
   * that would fail if somebody gave the Project page its own shape.
   */
  it("submits the same fields from either side, differing only in origin", async () => {
    const fromPerson = resolvesTo(idle);
    const { unmount } = render(panel(personProject, {
      addAction: fromPerson,
      options: [{ id: PROJECT_ID, label: "Atlas" }],
      roleAction: resolvesTo(idle),
    }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular a um projeto" }));
    await userEvent.type(screen.getByLabelText("Papel"), "sponsor");
    await userEvent.click(screen.getByRole("button", { name: "Vincular projeto" }));
    await waitFor(() => expect(fromPerson).toHaveBeenCalled());
    unmount();

    const fromProject = resolvesTo(idle);
    render(panel(projectPerson, {
      addAction: fromProject,
      options: [{ id: PERSON_ID, label: "Camila" }],
      roleAction: resolvesTo(idle),
    }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular uma pessoa" }));
    await userEvent.type(screen.getByLabelText("Papel"), "sponsor");
    await userEvent.click(screen.getByRole("button", { name: "Vincular pessoa" }));
    await waitFor(() => expect(fromProject).toHaveBeenCalled());

    const a = fromPerson.mock.calls[0]![1] as FormData;
    const b = fromProject.mock.calls[0]![1] as FormData;
    for (const key of ["personId", "projectId", "role", "locale"]) {
      expect(a.get(key), key).toBe(b.get(key));
    }
    expect(a.get("origin")).toBe("person");
    expect(b.get("origin")).toBe("project");
  });

  it("bounds the role at 120, the ceiling the schema enforces", async () => {
    render(panel(personProject, {
      options: [{ id: PROJECT_ID, label: "Atlas" }],
      roleAction: resolvesTo(idle),
    }));
    await userEvent.click(screen.getByRole("button", { name: "Vincular a um projeto" }));
    expect(screen.getByLabelText("Papel")).toHaveAttribute("maxlength", "120");
  });

  it("calls the link ended, because ending is what it does", async () => {
    // EGC-ASSOC-005. Calling it removal would promise a deletion the product
    // deliberately does not perform, and the owner would have no way to learn
    // otherwise.
    const endAction = resolvesTo(idle);
    render(panel(personContext, {
      endAction,
      rows: [{ id: CONTEXT_ID, label: "Pessoal", href: null }],
    }));

    const control = screen.getByRole("button", { name: "Encerrar vínculo com o contexto" });
    expect(control).toBeVisible();
    await userEvent.click(control);

    await waitFor(() => expect(endAction).toHaveBeenCalled());
    const submitted = endAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("personId")).toBe(PERSON_ID);
    expect(submitted.get("contextId")).toBe(CONTEXT_ID);
  });

  it("edits a role in place and keeps the ids the row already had", async () => {
    const roleAction = resolvesTo(idle);
    render(panel(personProject, {
      roleAction,
      rows: [{ id: PROJECT_ID, label: "Atlas", href: null, role: "revisora" }],
    }));

    await userEvent.click(screen.getByRole("button", { name: "Papel" }));
    const field = screen.getByLabelText("Papel");
    expect(field).toHaveValue("revisora");
    await userEvent.clear(field);
    await userEvent.type(field, "revisora do contrato");
    await userEvent.click(screen.getByRole("button", { name: "Salvar papel" }));

    await waitFor(() => expect(roleAction).toHaveBeenCalled());
    const submitted = roleAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("role")).toBe("revisora do contrato");
    expect(submitted.get("personId")).toBe(PERSON_ID);
    expect(submitted.get("projectId")).toBe(PROJECT_ID);
    expect(submitted.get("origin")).toBe("person");
  });

  it("shows the role a row carries, and says so plainly when it has none", () => {
    render(panel(personProject, {
      roleAction: resolvesTo(idle),
      rows: [
        { id: PROJECT_ID, label: "Atlas", href: null, role: "sponsor" },
        { id: "other", label: "Beta", href: null, role: null },
      ],
    }));

    expect(screen.getByText("sponsor")).toBeVisible();
    expect(screen.getByText("Sem papel definido")).toBeVisible();
  });
});
