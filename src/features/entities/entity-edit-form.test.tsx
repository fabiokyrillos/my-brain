import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityEditState } from "./edit-state";
import { EntityEditForm, type EntityEditAction, type EntityEditFields } from "./entity-edit-form";

afterEach(cleanup);

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const PERSON_ID = "22222222-2222-4222-8222-222222222222";
const ACME = { id: "33333333-3333-4333-8333-333333333333", name: "Acme" };

const projectFields: EntityEditFields = {
  kind: "project",
  id: PROJECT_ID,
  name: "Atlas",
  description: "Migração do faturamento",
  status: "paused",
  organizationId: ACME.id,
};

const personFields: EntityEditFields = {
  kind: "person",
  id: PERSON_ID,
  name: "Marina",
  notes: null,
  organizationId: null,
};

function resolvesTo(state: EntityEditState) {
  return vi.fn<EntityEditAction>(async () => state);
}

const idle: EntityEditState = { status: "idle", message: "" };
const saved: EntityEditState = { status: "success", message: "Alterações salvas." };
const duplicate: EntityEditState = { status: "error", message: "Esse nome já existe." };

async function open(name = "Editar") {
  await userEvent.click(screen.getByRole("button", { name }));
}

describe("EntityEditForm", () => {
  it("stays collapsed until asked, so the page keeps answering what this is", () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    expect(screen.getByRole("button", { name: "Editar" })).toBeVisible();
    expect(screen.queryByLabelText("Nome")).toBeNull();
  });

  it("opens with the current values, not with empty fields", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();

    expect(screen.getByLabelText("Nome")).toHaveValue("Atlas");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Migração do faturamento");
    expect(screen.getByLabelText("Situação")).toHaveValue("paused");
    expect(screen.getByLabelText("Empresa")).toHaveValue(ACME.id);
  });

  it("offers a project's status and a person's notes, and never the other way round", async () => {
    const { unmount } = render(
      <EntityEditForm action={resolvesTo(idle)} fields={projectFields} locale="pt-BR" organizations={[ACME]} />,
    );
    await open();
    expect(screen.getByLabelText("Situação")).toBeVisible();
    expect(screen.queryByLabelText("Notas")).toBeNull();
    unmount();

    render(<EntityEditForm action={resolvesTo(idle)} fields={personFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    expect(screen.getByLabelText("Notas")).toBeVisible();
    expect(screen.queryByLabelText("Situação")).toBeNull();
  });

  it("submits the id under the key its own action validates", async () => {
    const action = resolvesTo(saved);
    render(<EntityEditForm action={action} fields={personFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const submitted = action.mock.calls[0]![1];
    expect(submitted.get("personId")).toBe(PERSON_ID);
    expect(submitted.get("projectId")).toBeNull();
    expect(submitted.get("locale")).toBe("pt-BR");
  });

  it("closes on a save and keeps the confirmation visible", async () => {
    const action = resolvesTo(saved);
    render(<EntityEditForm action={action} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    // Closing is derived from the new state object rather than set in an
    // effect, so there is no cascading render to flag.
    await waitFor(() => expect(screen.queryByLabelText("Nome")).toBeNull());
    // Addressed by class rather than by text: the same sentence is also in the
    // polite live region, which is the announcement working rather than a
    // duplicate to remove.
    expect(document.querySelector(".entity-edit-feedback.success")).toHaveTextContent("Alterações salvas.");
  });

  it("stays open on an error, because the user has something to fix", async () => {
    const action = resolvesTo(duplicate);
    render(<EntityEditForm action={action} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Esse nome já existe."));
    expect(screen.getByLabelText("Nome")).toBeVisible();
  });

  it("keeps what the user typed after a refusal, instead of snapping back", async () => {
    // React 19 resets an uncontrolled form once the action completes. Without
    // the echoed submission the field would show the *stored* name again, above
    // an error telling the owner to change a name they can no longer see. Only
    // the live journey caught this — a mocked action never triggers the reset.
    const action = resolvesTo({ ...duplicate, submitted: { name: "Beta", description: "kept", status: "completed" } });
    render(<EntityEditForm action={action} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.getByLabelText("Nome")).toHaveValue("Beta");
    expect(screen.getByLabelText("Descrição")).toHaveValue("kept");
    expect(screen.getByLabelText("Situação")).toHaveValue("completed");
  });

  it("prefers the stored values once there is nothing to restore", async () => {
    const action = resolvesTo({ ...duplicate, submitted: null });
    render(<EntityEditForm action={action} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    expect(screen.getByLabelText("Nome")).toHaveValue("Atlas");
  });

  it("lets the user cancel out of an error rather than trapping them in it", async () => {
    // The regression this guards: deriving openness from the error status alone
    // holds the form open against a Cancel click.
    const action = resolvesTo(duplicate);
    render(<EntityEditForm action={action} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByLabelText("Nome")).toBeNull());
  });

  it("reopens after that cancel, instead of leaving a dead Edit button", async () => {
    // The regression this guards is the mirror image of the one above, and it
    // survived that test by exactly one click: guarding the whole `open`
    // expression with `dismissed !== state` meant reopening set `openedFor` to
    // the same state object `dismissed` already held. The form stayed shut, and
    // because it was not rendered no new state could arrive to unstick it — the
    // Edit control was dead until a page reload.
    const action = resolvesTo(duplicate);
    render(<EntityEditForm action={action} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByLabelText("Nome")).toBeNull());

    await open();

    expect(screen.getByLabelText("Nome")).toBeVisible();
  });

  it("explains an empty company list without disabling the control", async () => {
    // Disabling it is the obvious thing and is wrong: a disabled control is not
    // submitted, so `organizationId` would be absent from the FormData and the
    // strict schema would refuse the entire save. Only the live journey caught
    // that — every unit test built its own FormData and never saw a real
    // submission. This pins it.
    render(<EntityEditForm action={resolvesTo(idle)} fields={personFields} locale="pt-BR" organizations={[]} />);
    await open();

    const select = screen.getByLabelText("Empresa");
    expect(select).toBeEnabled();
    expect(select.querySelectorAll("option")).toHaveLength(1);
    expect(screen.getByText("Nenhuma empresa registrada ainda.")).toBeVisible();
  });

  it("submits every field the schema requires, even with no company to choose", async () => {
    const action = resolvesTo(saved);
    render(<EntityEditForm action={action} fields={personFields} locale="pt-BR" organizations={[]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const submitted = action.mock.calls[0]![1];
    expect([...submitted.keys()].sort()).toEqual(["locale", "name", "notes", "organizationId", "personId"]);
    expect(submitted.get("organizationId")).toBe("");
  });

  it("announces the round through one polite region", async () => {
    const action = resolvesTo(saved);
    render(<EntityEditForm action={action} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => {
      const regions = screen.getAllByRole("status");
      expect(regions).toHaveLength(1);
      expect(regions[0]!.textContent).toBe("Alterações salvas.");
    });
  });

  it("localizes every visible string in English", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={projectFields} locale="en" organizations={[ACME]} />);
    await open("Edit");

    expect(screen.getByLabelText("Name")).toBeVisible();
    expect(screen.getByLabelText("Description")).toBeVisible();
    expect(screen.getByLabelText("Status")).toBeVisible();
    expect(screen.getByLabelText("Company")).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  it("offers every status the column allows, localized", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={projectFields} locale="en" organizations={[ACME]} />);
    await open("Edit");

    const options = [...screen.getByLabelText("Status").querySelectorAll("option")].map((option) => option.textContent);
    expect(options).toEqual(["Active", "Paused", "Completed", "Archived"]);
  });

  /**
   * G3 recorded a latent accessible-name defect here: React renders a
   * `<textarea>`'s value as a child text node, so a wrapping `<label>` was said
   * to make the stored text part of the field's *name*.
   *
   * Slice H measured it instead of inheriting it, in three accessible-name
   * implementations — Chromium's own AX tree over CDP, Playwright's
   * `toHaveAccessibleName`, and the `dom-accessibility-api` these tests use —
   * and this shape computes correctly in all three. The label associates by
   * `for`/`id` **and** wraps the control, which is the case the algorithm is
   * explicit about: the element being named does not contribute its own value.
   *
   * What does pollute the name is a label wrapping a control *plus other
   * content*, or wrapping two controls. Those are asserted in
   * `settings-form.test.tsx`, where a real instance was found. This one stays as
   * a regression guard so the shape cannot drift into one of those.
   *
   * `getByLabelText` cannot stand in for this: it matches the `for`/`id`
   * association, which was correct throughout. Only the computed name shows it.
   */
  it("names the description textarea after its label, not after the text inside it", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={projectFields} locale="pt-BR" organizations={[ACME]} />);
    await open();

    const description = screen.getByRole("textbox", { name: "Descrição" });
    expect(description).toHaveValue("Migração do faturamento");
  });

  it("names the notes textarea after its label once the person has notes", async () => {
    render(
      <EntityEditForm
        action={resolvesTo(idle)}
        fields={{ ...personFields, notes: "Prefere áudio a texto" }}
        locale="en"
        organizations={[]}
      />,
    );
    await open("Edit");

    const notes = screen.getByRole("textbox", { name: "Notes" });
    expect(notes).toHaveValue("Prefere áudio a texto");
  });
});

/* -------------------------------------------------------------------------- */
/* Organizations and contexts — EGC.1                                          */
/* -------------------------------------------------------------------------- */

const CONTEXT_ID = "44444444-4444-4444-8444-444444444444";

const organizationFields: EntityEditFields = {
  kind: "organization",
  id: ACME.id,
  name: "Acme",
  description: "Cliente desde 2024",
};

const contextFields: EntityEditFields = {
  kind: "context",
  id: CONTEXT_ID,
  name: "Pessoal",
  description: null,
  contextKind: "personal",
};

describe("EntityEditForm — organizations and contexts", () => {
  it("submits each kind's id under the key its own action validates", async () => {
    // All four schemas are `.strict()`, so a wrong key is a refused save rather
    // than an ignored field. This is the assertion that would fail if the id
    // name were derived by a ternary that forgot a kind.
    const organizationAction = resolvesTo(saved);
    const { unmount } = render(
      <EntityEditForm action={organizationAction} fields={organizationFields} locale="pt-BR" organizations={[]} />,
    );
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(organizationAction).toHaveBeenCalled());
    expect((organizationAction.mock.calls[0]![1] as FormData).get("organizationId")).toBe(ACME.id);
    unmount();

    const contextAction = resolvesTo(saved);
    render(<EntityEditForm action={contextAction} fields={contextFields} locale="pt-BR" organizations={[]} />);
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(contextAction).toHaveBeenCalled());
    const submitted = contextAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("contextId")).toBe(CONTEXT_ID);
    expect(submitted.get("kind")).toBe("personal");
  });

  it("offers no company control to the two kinds that have no company column", async () => {
    // A selector here would create a row and have nowhere to put it:
    // `organizations` and `contexts` carry no `organization_id`.
    const { unmount } = render(
      <EntityEditForm action={resolvesTo(idle)} fields={organizationFields} locale="pt-BR" organizations={[ACME]} />,
    );
    await open();
    expect(screen.queryByLabelText("Empresa")).toBeNull();
    expect(screen.queryByRole("button", { name: "Criar nova empresa" })).toBeNull();
    unmount();

    render(<EntityEditForm action={resolvesTo(idle)} fields={contextFields} locale="pt-BR" organizations={[ACME]} />);
    await open();
    expect(screen.queryByLabelText("Empresa")).toBeNull();
  });

  it("offers a context's kind and never a status, and bounds its name at 120", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={contextFields} locale="pt-BR" organizations={[]} />);
    await open();

    expect(screen.getByLabelText("Tipo")).toHaveValue("personal");
    expect(screen.queryByLabelText("Situação")).toBeNull();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("maxlength", "120");
  });

  it("bounds an organization's name at 160, which is a different column's bound", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={organizationFields} locale="pt-BR" organizations={[]} />);
    await open();
    expect(screen.getByLabelText("Nome")).toHaveAttribute("maxlength", "160");
  });

  it("localizes the context kinds rather than rendering the stored token", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={contextFields} locale="en" organizations={[]} />);
    await open("Edit");

    const kind = screen.getByLabelText("Kind");
    expect(Array.from(kind.querySelectorAll("option")).map((option) => option.textContent)).toEqual([
      "Work",
      "Personal",
      "Custom",
    ]);
  });
});

describe("create-and-select on the company selector", () => {
  const created: EntityEditState = {
    status: "success",
    message: "Empresa criada e vinculada.",
  };

  it("appears for a person and a project, as a sibling form rather than a nested one", async () => {
    // HTML forbids nested forms and browsers recover by dropping the inner one,
    // which would make this control submit the *edit* action with a stray name
    // field — an invalid-input refusal for reasons no user could read.
    const { container } = render(
      <EntityEditForm
        action={resolvesTo(idle)}
        createOrganizationAction={resolvesTo(idle)}
        fields={personFields}
        locale="pt-BR"
        organizations={[]}
      />,
    );
    await open();

    expect(screen.getByRole("button", { name: "Criar nova empresa" })).toBeVisible();
    expect(container.querySelectorAll("form form")).toHaveLength(0);
  });

  it("does not appear at all when the page passes no creating action", async () => {
    render(<EntityEditForm action={resolvesTo(idle)} fields={personFields} locale="pt-BR" organizations={[]} />);
    await open();
    expect(screen.queryByRole("button", { name: "Criar nova empresa" })).toBeNull();
  });

  it("submits the subject, its id and an empty description the strict schema requires", async () => {
    // `organizationCreateSchema` is `.strict()` and its `description` is
    // required-but-nullable, so an absent key would refuse a form that has no
    // description control for the owner to fix.
    const createAction = resolvesTo(created);
    render(
      <EntityEditForm
        action={resolvesTo(idle)}
        createOrganizationAction={createAction}
        fields={personFields}
        locale="pt-BR"
        organizations={[]}
      />,
    );
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Criar nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome da nova empresa"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    await waitFor(() => expect(createAction).toHaveBeenCalled());
    const submitted = createAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("subject")).toBe("person");
    expect(submitted.get("subjectId")).toBe(PERSON_ID);
    expect(submitted.get("name")).toBe("Acme");
    expect(submitted.get("description")).toBe("");
    expect(submitted.get("locale")).toBe("pt-BR");
  });

  it("routes a project to its own table rather than to people", async () => {
    const createAction = resolvesTo(created);
    render(
      <EntityEditForm
        action={resolvesTo(idle)}
        createOrganizationAction={createAction}
        fields={projectFields}
        locale="pt-BR"
        organizations={[ACME]}
      />,
    );
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Criar nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome da nova empresa"), "Beta");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    await waitFor(() => expect(createAction).toHaveBeenCalled());
    const submitted = createAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("subject")).toBe("project");
    expect(submitted.get("subjectId")).toBe(PROJECT_ID);
  });

  it("keeps the refused name visible instead of letting React 19 reset it away", async () => {
    const refused: EntityEditState = {
      status: "error",
      message: "Esse nome já existe.",
      submitted: { name: "Acme" },
    };
    render(
      <EntityEditForm
        action={resolvesTo(idle)}
        createOrganizationAction={resolvesTo(refused)}
        fields={personFields}
        locale="pt-BR"
        organizations={[]}
      />,
    );
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Criar nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome da nova empresa"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Esse nome já existe."));
    expect(screen.getByLabelText("Nome da nova empresa")).toHaveValue("Acme");
  });

  it("reports a company created but not linked as its own outcome, not as a flat failure", async () => {
    // The organization exists either way. Reporting a plain failure would send
    // the owner to create a duplicate of a row they already own.
    const partial: EntityEditState = {
      status: "error",
      message: "A empresa foi criada, mas não foi vinculada. Selecione-a na lista.",
      submitted: { name: "Acme" },
    };
    render(
      <EntityEditForm
        action={resolvesTo(idle)}
        createOrganizationAction={resolvesTo(partial)}
        fields={personFields}
        locale="pt-BR"
        organizations={[]}
      />,
    );
    await open();
    await userEvent.click(screen.getByRole("button", { name: "Criar nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome da nova empresa"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "A empresa foi criada, mas não foi vinculada. Selecione-a na lista.",
      ),
    );
  });
});
