import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { EntityEditState } from "./edit-state";
import { EntityCreateForm } from "./entity-create-form";
import type { EntityEditAction } from "./entity-edit-form";

/**
 * The create surface organizations and contexts never had (EGC-ORG-003, EGC-CTX-003).
 *
 * The cases below are the ways it can be wrong and cost the owner something
 * real: a bound that lets the database refuse what the form accepted, a kind
 * sent as a raw token, and a refusal that discards what was typed.
 */

afterEach(cleanup);

const idle: EntityEditState = { status: "idle", message: "" };
const created: EntityEditState = {
  status: "success",
  message: "Criado.",
};

function resolvesTo(state: EntityEditState) {
  return vi.fn<EntityEditAction>(async () => state);
}

describe("EntityCreateForm", () => {
  it("stays collapsed until asked, so the list keeps showing what exists", () => {
    render(<EntityCreateForm action={resolvesTo(idle)} kind="organization" locale="pt-BR" />);

    expect(screen.getByRole("button", { name: "Nova empresa" })).toBeVisible();
    expect(screen.queryByLabelText("Nome")).toBeNull();
  });

  it("names its own control and its own submit per kind, in both locales", async () => {
    const { unmount } = render(
      <EntityCreateForm action={resolvesTo(idle)} kind="context" locale="pt-BR" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Novo contexto" }));
    expect(screen.getByRole("button", { name: "Criar contexto" })).toBeVisible();
    unmount();

    render(<EntityCreateForm action={resolvesTo(idle)} kind="organization" locale="en" />);
    await userEvent.click(screen.getByRole("button", { name: "New company" }));
    expect(screen.getByRole("button", { name: "Create company" })).toBeVisible();
  });

  it("bounds each name at its own column's limit, not at a shared one", async () => {
    // `contexts_name_check` is 120 where `organizations_name_check` is 160.
    // One shared constant would let a 121-character context reach a database
    // that refuses it, with no sentence the form could show for the refusal.
    const { unmount } = render(
      <EntityCreateForm action={resolvesTo(idle)} kind="organization" locale="pt-BR" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    expect(screen.getByLabelText("Nome")).toHaveAttribute("maxlength", "160");
    unmount();

    render(<EntityCreateForm action={resolvesTo(idle)} kind="context" locale="pt-BR" />);
    await userEvent.click(screen.getByRole("button", { name: "Novo contexto" }));
    expect(screen.getByLabelText("Nome")).toHaveAttribute("maxlength", "120");
  });

  it("offers the kind control only to contexts, and localizes its three options", async () => {
    const { unmount } = render(
      <EntityCreateForm action={resolvesTo(idle)} kind="organization" locale="pt-BR" />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    expect(screen.queryByLabelText("Tipo")).toBeNull();
    unmount();

    render(<EntityCreateForm action={resolvesTo(idle)} kind="context" locale="pt-BR" />);
    await userEvent.click(screen.getByRole("button", { name: "Novo contexto" }));
    const kind = screen.getByLabelText("Tipo");
    expect(Array.from(kind.querySelectorAll("option")).map((option) => option.textContent)).toEqual([
      "Trabalho",
      "Pessoal",
      "Personalizado",
    ]);
  });

  it("submits the locale and the kind the action's strict schema expects", async () => {
    const action = resolvesTo(created);
    render(<EntityCreateForm action={action} kind="context" locale="pt-BR" />);

    await userEvent.click(screen.getByRole("button", { name: "Novo contexto" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Pessoal");
    await userEvent.selectOptions(screen.getByLabelText("Tipo"), "personal");
    await userEvent.click(screen.getByRole("button", { name: "Criar contexto" }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const submitted = action.mock.calls[0]![1] as FormData;
    expect(submitted.get("locale")).toBe("pt-BR");
    expect(submitted.get("name")).toBe("Pessoal");
    expect(submitted.get("kind")).toBe("personal");
    expect(submitted.get("description")).toBe("");
  });

  it("closes on a success and leaves the outcome where it can still be read", async () => {
    render(<EntityCreateForm action={resolvesTo(created)} kind="organization" locale="pt-BR" />);

    await userEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    // Announcing a creation and then hiding the only evidence of it would leave
    // a screen-reader user with nothing to return to.
    await waitFor(() => expect(screen.getByRole("button", { name: "Nova empresa" })).toBeVisible());
    // Two nodes carry the sentence on purpose: the polite live region announces
    // it once, and the visible paragraph is what a sighted reader returns to.
    expect(screen.getByRole("status")).toHaveTextContent("Criado.");
    expect(screen.getByText("Criado.", { selector: "p" })).toBeVisible();
  });

  it("stays open on a refusal and keeps what was typed", async () => {
    // React 19 resets an uncontrolled form once the action completes, so without
    // the echo the owner would be told to change a name they can no longer see.
    const refused: EntityEditState = {
      status: "error",
      message: "Esse nome já existe.",
      submitted: { name: "Acme", description: "Cliente" },
    };
    render(<EntityCreateForm action={resolvesTo(refused)} kind="organization" locale="pt-BR" />);

    await userEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Esse nome já existe."));
    expect(screen.getByLabelText("Nome")).toHaveValue("Acme");
    expect(screen.getByLabelText("Descrição")).toHaveValue("Cliente");
  });

  it("lets Cancel close a form the refusal is holding open", async () => {
    const refused: EntityEditState = { status: "error", message: "Revise os campos.", submitted: { name: "" } };
    render(<EntityCreateForm action={resolvesTo(refused)} kind="organization" locale="pt-BR" />);

    await userEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());

    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: "Nova empresa" })).toBeVisible();
    expect(screen.queryByLabelText("Nome")).toBeNull();
  });

  it("can be reopened after Cancel, which the first openness derivation made impossible", async () => {
    // The defect this pins: guarding the whole `open` expression with
    // `dismissed !== state` made Cancel-after-a-refusal permanent. Reopening set
    // `openedFor` to the very state object `dismissed` already held, so the form
    // stayed shut — and since it was not rendered, no new state could ever
    // arrive to unstick it. The control was dead until a page reload.
    //
    // The previous test stops one click short of this, which is exactly how the
    // defect survived its own test.
    const refused: EntityEditState = { status: "error", message: "Revise os campos.", submitted: { name: "" } };
    render(<EntityCreateForm action={resolvesTo(refused)} kind="organization" locale="pt-BR" />);

    await userEvent.click(screen.getByRole("button", { name: "Nova empresa" }));
    await userEvent.type(screen.getByLabelText("Nome"), "Acme");
    await userEvent.click(screen.getByRole("button", { name: "Criar empresa" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByLabelText("Nome")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Nova empresa" }));

    expect(screen.getByLabelText("Nome")).toBeVisible();
  });
});
