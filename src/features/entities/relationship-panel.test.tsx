import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { boundedList, RELATION_LIMIT } from "@/features/bounds/contracts";

import type { EntityEditState } from "./edit-state";
import type { EntityEditAction } from "./entity-edit-form";
import { RelationshipPanel, type RelationshipRow } from "./relationship-panel";
import { describeRelationshipType } from "./relationship-vocabulary";

afterEach(cleanup);

const PERSON_ID = "11111111-1111-4111-8111-111111111111";

const idle: EntityEditState = { status: "idle", message: "" };
const added: EntityEditState = { status: "success", message: "Relação registrada." };

function resolvesTo(state: EntityEditState) {
  return vi.fn<EntityEditAction>(async () => state);
}

const spouse: RelationshipRow = {
  id: "22222222-2222-4222-8222-222222222222",
  storedType: "spouse",
  label: describeRelationshipType("pt-BR", "spouse"),
  description: null,
  since: "15 de março de 2019",
};

/**
 * The default is an UNBOUNDED list, so every existing case still asserts what it
 * asserted: `BoundedNotice` renders nothing when `bounded` is false. A case that
 * wants the notice passes its own bound.
 */
function panel(overrides: Partial<Parameters<typeof RelationshipPanel>[0]> = {}) {
  return (
    <RelationshipPanel
      bound={boundedList([], RELATION_LIMIT)}
      createAction={resolvesTo(idle)}
      endAction={resolvesTo(idle)}
      locale="pt-BR"
      personId={PERSON_ID}
      relationships={[]}
      updateAction={resolvesTo(idle)}
      {...overrides}
    />
  );
}

describe("RelationshipPanel", () => {
  it("says what the section is for, so Company cannot read as a way to describe a relationship", () => {
    // EGC-REL-009. The Camila scenario exposed exactly this confusion: the only
    // field that looked like it described a person was the company they work at.
    render(panel());
    expect(screen.getByText("Quem essa pessoa é para você.")).toBeVisible();
  });

  it("renders a known type as its localized term, never as the stored token", () => {
    render(panel({ relationships: [spouse] }));
    expect(screen.getByText(/Esposa/)).toBeVisible();
    expect(screen.queryByText("spouse")).toBeNull();
  });

  it("renders a type outside the vocabulary as its raw stored value rather than blank", () => {
    // Gate B4 / EGC-REL-006. `relationship_type` carries no CHECK on purpose, so
    // an extraction pass writing `godparent` must leave a row that reads oddly —
    // not one that renders as nothing, which would look to the owner like a
    // relationship that says nothing at all.
    render(panel({
      relationships: [{ ...spouse, storedType: "godparent", label: null }],
    }));

    expect(screen.getByText("godparent")).toBeVisible();
    expect(screen.getByText("Relação não reconhecida")).toBeVisible();
  });

  it("shows the description when there is one, and the start date when there is not", () => {
    const { unmount } = render(panel({ relationships: [spouse] }));
    expect(screen.getByText(/desde 15 de março de 2019/)).toBeVisible();
    unmount();

    render(panel({ relationships: [{ ...spouse, description: "casamos em Recife" }] }));
    expect(screen.getByText("casamos em Recife")).toBeVisible();
  });

  it("submits the person id and the chosen type when a relationship is recorded", async () => {
    const createAction = resolvesTo(added);
    render(panel({ createAction }));

    await userEvent.click(screen.getByRole("button", { name: "Registrar relação" }));
    await userEvent.selectOptions(screen.getByLabelText("Tipo de relação"), "sibling");
    await userEvent.type(screen.getByLabelText("Observação"), "mora em Olinda");
    await userEvent.click(screen.getByRole("button", { name: "Salvar relação" }));

    await waitFor(() => expect(createAction).toHaveBeenCalled());
    const submitted = createAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("personId")).toBe(PERSON_ID);
    expect(submitted.get("relationshipType")).toBe("sibling");
    expect(submitted.get("description")).toBe("mora em Olinda");
    expect(submitted.get("locale")).toBe("pt-BR");
  });

  it("bounds the note at 500, the ceiling the schema enforces", async () => {
    render(panel());
    await userEvent.click(screen.getByRole("button", { name: "Registrar relação" }));
    expect(screen.getByLabelText("Observação")).toHaveAttribute("maxlength", "500");
  });

  it("offers every vocabulary member in declared order, localized", async () => {
    render(panel({ locale: "en" }));
    await userEvent.click(screen.getByRole("button", { name: "Record a relationship" }));

    const options = Array.from(
      screen.getByLabelText("Kind of relationship").querySelectorAll("option"),
    ).map((option) => option.textContent);
    expect(options[0]).toBe("Spouse");
    expect(options).toHaveLength(14);
    expect(options).toContain("Other family");
  });

  it("submits the relationship id when a relationship is ended", async () => {
    const endAction = resolvesTo(idle);
    render(panel({ endAction, relationships: [spouse] }));

    await userEvent.click(screen.getByRole("button", { name: /Encerrar relação/ }));

    await waitFor(() => expect(endAction).toHaveBeenCalled());
    const submitted = endAction.mock.calls[0]![1] as FormData;
    expect(submitted.get("relationshipId")).toBe(spouse.id);
    expect(submitted.get("personId")).toBe(PERSON_ID);
  });

  it("opens the edit form on the row and pre-selects its current type", async () => {
    render(panel({ relationships: [spouse] }));

    await userEvent.click(screen.getByRole("button", { name: /Editar relação/ }));

    expect(screen.getByLabelText("Tipo de relação")).toHaveValue("spouse");
  });

  it("falls back to a safe type when editing a row whose stored value is unknown", async () => {
    // The select's options are the vocabulary; a stored `godparent` is not among
    // them, so a naive `defaultValue` would leave the control showing the first
    // option while the row said something else — and saving would silently
    // re-point the relationship. `other` is the honest default: it does not
    // claim to know what the row meant.
    render(panel({ relationships: [{ ...spouse, storedType: "godparent", label: null }] }));

    await userEvent.click(screen.getByRole("button", { name: /Editar relação/ }));

    expect(screen.getByLabelText("Tipo de relação")).toHaveValue("other");
  });

  it("keeps each row's outcome on its own row rather than above all of them", async () => {
    // One shared action state would put "Relação encerrada" over a relationship
    // that is still live. Each row owns its own round.
    const refused: EntityEditState = { status: "error", message: "Este registro não existe mais." };
    const second: RelationshipRow = { ...spouse, id: "33333333-3333-4333-8333-333333333333", storedType: "friend", label: describeRelationshipType("pt-BR", "friend") };
    render(panel({ endAction: resolvesTo(refused), relationships: [spouse, second] }));

    const rows = screen.getAllByRole("listitem");
    await userEvent.click(within(rows[0]!).getByRole("button", { name: /Encerrar relação/ }));

    await waitFor(() => expect(within(rows[0]!).getByRole("alert")).toBeVisible());
    expect(within(rows[1]!).queryByRole("alert")).toBeNull();
  });

  it("can be reopened after Cancel, the defect EGC.1's review found", async () => {
    const refused: EntityEditState = { status: "error", message: "Revise os campos.", submitted: {} };
    render(panel({ createAction: resolvesTo(refused) }));

    await userEvent.click(screen.getByRole("button", { name: "Registrar relação" }));
    await userEvent.click(screen.getByRole("button", { name: "Salvar relação" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeVisible());
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByLabelText("Tipo de relação")).toBeNull());

    await userEvent.click(screen.getByRole("button", { name: "Registrar relação" }));

    expect(screen.getByLabelText("Tipo de relação")).toBeVisible();
  });

  describe("2N-PERSON-003: the list says when it is bounded", () => {
    /*
     * The defect this closes, stated as the case that used to pass silently.
     *
     * The person page fetched relationships with `withProbe(RELATION_LIMIT)` and
     * handed the result straight here, so a 51st relationship was RENDERED and
     * the panel still said nothing. The bound now arrives with the rows, and it
     * is required rather than optional because the failure is invisible: a list
     * that forgets to report simply looks complete.
     */
    const rows = (count: number): RelationshipRow[] =>
      Array.from({ length: count }, (_, index) => ({
        ...spouse,
        id: `33333333-3333-4333-8333-${String(index).padStart(12, "0")}`,
        description: `relação ${index}`,
      }));

    it("reports the bound, and reports the count it actually shows", () => {
      const items = rows(RELATION_LIMIT);
      render(
        panel({
          bound: { items, bounded: true, limit: RELATION_LIMIT },
          relationships: items,
        }),
      );

      const notice = screen.getByRole("note");
      expect(notice).toHaveAttribute("data-bounded", "true");
      // The number shown, not an invented total — `shownCount`'s contract.
      expect(notice).toHaveTextContent(String(RELATION_LIMIT));
    });

    it("stays silent when the list is complete, so the notice keeps meaning something", () => {
      // The control. Without it the assertion above would pass on a panel that
      // renders the notice unconditionally, which is the one outcome that would
      // make the notice worthless.
      const items = rows(2);
      render(
        panel({
          bound: { items, bounded: false, limit: RELATION_LIMIT },
          relationships: items,
        }),
      );

      expect(screen.queryByRole("note")).toBeNull();
    });
  });
});
