import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

/**
 * The router, stubbed — and the stub is an assertion target rather than scenery.
 *
 * The composer refreshes the list itself, because `createReminder` deliberately
 * issues no `revalidatePath`: a working one puts the page's re-render inside the
 * action's transition, and that transition intermittently never settles. The
 * test below checks the refresh happens exactly once and only after the write
 * has settled, which is the property that keeps the dialog dismissible.
 */
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => refresh() }) }));

import { IDLE_REMINDER_CREATION_STATE, type ReminderCreationState } from "./action-state";
import { getReminderCopy } from "./copy";
import { ReminderComposer, type ReminderCreationHandler } from "./reminder-composer";
import type { ReminderTaskOption } from "./task-options";

/**
 * `2P-REMINDER-001` … `-004` — writing a reminder deliberately.
 *
 * These assert the properties the requirements name, on the rendered surface:
 * a header that offers **one action** rather than a form, five groups **in the
 * declared order**, a cancel that writes nothing, and a dialog that survives its
 * own transition. The keyboard contract belongs to `ConfirmDialog` and is proved
 * in `command-console.test.tsx`; what is proved here is that this consumer
 * actually mounts it, and that its own state cannot freeze the dialog open.
 */

const OPTIONS: readonly ReminderTaskOption[] = [
  { id: "11111111-1111-4111-8111-111111111111", label: "Revisar contrato", withheld: false },
  { id: "22222222-2222-4222-8222-222222222222", label: "Tarefa protegida · 222222", withheld: true },
];

const copy = getReminderCopy("pt-BR");

/**
 * Gives a mock the handler's real parameter list.
 *
 * `vi.fn(async () => …)` records calls against a zero-argument signature, so
 * `mock.calls[0][1]` is a type error rather than the `FormData` that was
 * actually passed. Declaring the shape once here keeps the assertion honest
 * without a cast, which would have hidden the same mistake.
 */
const handler = (
  respond: (formData: FormData) => Promise<ReminderCreationState>,
): ReminderCreationHandler => (_state: ReminderCreationState, formData: FormData) =>
  respond(formData);

function mount(action = vi.fn(handler(async () => IDLE_REMINDER_CREATION_STATE))) {
  const result = render(
    <ReminderComposer action={action} locale="pt-BR" taskOptions={OPTIONS} />,
  );
  return { ...result, action };
}

const fillRequired = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.type(screen.getByLabelText(copy.creation.contentLabel, { exact: false }), title);
  /*
   * The instant is required, so a test that filled only the title would never
   * submit — the browser refuses an invalid form and the action is simply never
   * called, which reads exactly like a broken handler.
   */
  await user.type(
    screen.getByLabelText(copy.creation.whenLabel, { exact: false }),
    "2026-09-01T09:30",
  );
};

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: copy.creation.open }));
  return screen.getByRole("dialog");
};

describe("2P-REMINDER-001: the header offers an action, not a form", () => {
  it("renders one control and no creation fields until it is pressed", () => {
    mount();
    expect(screen.getByRole("button", { name: copy.creation.open })).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText(copy.creation.contentLabel)).toBeNull();
  });

  it("opens a real modal dialog rather than expanding in place", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await openDialog(user);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    // The shared component, not a fifth hand-rolled one: its panel class and its
    // own cancel button are what identify it.
    expect(dialog.className).toContain("task-command-dialog");
  });
});

describe("2P-REMINDER-002: the five groups, in the order the requirement names", () => {
  it("groups content, date and time, importance, the optional link, then save and cancel", async () => {
    const user = userEvent.setup();
    mount();
    const dialog = await openDialog(user);

    /*
     * Asserted by **position**, not by presence. A test that only checked the
     * five controls existed would pass on any arrangement of them, and the
     * requirement is specifically about the order.
     */
    const order = [
      screen.getByLabelText(copy.creation.contentLabel, { exact: false }),
      screen.getByLabelText(copy.creation.whenLabel, { exact: false }),
      screen.getByLabelText(copy.creation.importantLabel, { exact: false }),
      screen.getByLabelText(copy.creation.linkLabel, { exact: false }),
      within(dialog).getByRole("button", { name: copy.creation.save }),
      within(dialog).getByRole("button", { name: copy.creation.cancel }),
    ];
    for (let index = 1; index < order.length; index += 1) {
      const relation = order[index - 1].compareDocumentPosition(order[index]);
      expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("says what a reminder is, so the flow is not a bare field", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    expect(screen.getByText(copy.creation.description)).toBeTruthy();
  });

  it("takes the wall clock, and names the zone rather than asking for it", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    const when = screen.getByLabelText(copy.creation.whenLabel, { exact: false });
    expect(when.getAttribute("type")).toBe("datetime-local");
    // The field name is the reschedule command's, which is what routes it
    // through the profile timezone on the server.
    expect(when.getAttribute("name")).toBe("remindAtLocal");
    expect(screen.getByText(copy.creation.whenHint)).toBeTruthy();
  });

  it("defaults the optional link to no link, and offers the owner's tasks", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    const select = screen.getByLabelText(copy.creation.linkLabel, { exact: false }) as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(within(select).getByRole("option", { name: copy.creation.linkNone })).toBeTruthy();
    expect(within(select).getByRole("option", { name: "Revisar contrato" })).toBeTruthy();
  });

  /**
   * `2M-PRIVACY-001` reaches into a `<select>` too. A withheld task keeps a
   * choosable option — masking withholds the words, never the ability to link.
   */
  it("offers a withheld task without printing its title", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    const select = screen.getByLabelText(copy.creation.linkLabel, { exact: false }) as HTMLSelectElement;
    const withheld = within(select).getByRole("option", { name: "Tarefa protegida · 222222" });
    expect(withheld.getAttribute("value")).toBe(OPTIONS[1].id);
  });
});

/**
 * `2R-SURFACE-001` — the control that arrived, and the shape it did not.
 *
 * ## What this assertion used to say, and why it changes here
 *
 * It read *"the dialog offers no recurrence, in any shape"*, and that was right
 * while `2P-REMINDER-RECURRENCE` stood: `reminders` had no column for a rule, so
 * any control would have been a fake affordance. **ADR-132 Decision 1 lifted the
 * refusal for reminders**, `202608230101` shipped the model, and slice 2R.3 adds
 * exactly one `<select>`.
 *
 * The closed list below is doing MORE work than before, not less. It still
 * refuses every control that is not named — a seventh cannot arrive unnoticed —
 * and because it is compared in **document order** it now also pins where the
 * new one sits. `recurrence` between `remindAtLocal` and `important` is not an
 * arrangement: the rule is derived from that date, and the two being adjacent is
 * the whole reason the group needs no fields of its own.
 *
 * Still a closed list rather than a blocklist of forbidden words, for the reason
 * §100 recorded: `phase-2m-recurrence-guard.test.ts` is the one enforcer of the
 * recurrence vocabulary across the tree, and a second scanner here would have to
 * spell the shapes as code to look for them.
 */
describe("2R-SURFACE-001: the dialog gains one control and does not become a form", () => {
  it("submits a closed set of fields, in order, so a seventh cannot arrive unnoticed", async () => {
    const user = userEvent.setup();
    const { container } = mount();
    await openDialog(user);

    const dialog = screen.getByRole("dialog");
    const names = [...dialog.querySelectorAll("input, select, textarea")]
      .map((control) => control.getAttribute("name"));
    expect(names).toEqual([
      "locale", "title", "remindAtLocal", "recurrence", "important", "taskId",
    ]);

    // And nothing disabled is sitting there implying something is coming.
    expect(container.querySelectorAll("[disabled]")).toHaveLength(0);
  });

  it("adds no field when a repetition is chosen — the date supplies them all", async () => {
    /*
      THE STOP CONDITION, ASSERTED.

      The plan makes turning this dialog into a form a stop condition, and the
      form it would have become is the obvious one: a frequency picker, then
      seven weekday checkboxes, a day-of-month number, an ordinal, a month. Every
      one of those parameters is the date two groups above, so choosing a
      repetition reveals a preview and **not a single new input**.

      Asserted by comparing the field list before and after, because "no new
      fields" is a claim about a difference and a snapshot of the after-state
      alone would not be one.
    */
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    const dialog = screen.getByRole("dialog");
    const fields = () => [...dialog.querySelectorAll("input, select, textarea")]
      .map((control) => control.getAttribute("name"));

    const before = fields();
    await user.selectOptions(
      screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }),
      "monthlyWeekday",
    );
    expect(fields()).toEqual(before);
  });

  it("offers the five signed patterns and `does not repeat`, and nothing else", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    const select = screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false });
    const values = [...select.querySelectorAll("option")].map((option) => option.value);
    // `OD-2R-2` signed five. A sixth would have to be added to the schema, the
    // derivation and the copy before it could appear here, and this is the last
    // of the three to notice.
    expect(values).toEqual([
      "none", "daily", "weekly", "monthlyDay", "monthlyWeekday", "yearly",
    ]);
  });

  it("defaults to not repeating", async () => {
    // The overwhelmingly common reminder does not repeat, and `2R-MODEL-004`
    // requires that one to behave exactly as it does today — which starts with
    // the dialog not having quietly opted it in.
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    expect(
      (screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }) as HTMLSelectElement)
        .value,
    ).toBe("none");
  });

  it("shows no preview until a repetition is chosen", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    expect(screen.queryByRole("button", { name: copy.creation.previewLabel })).toBeNull();

    await user.selectOptions(
      screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }),
      "daily",
    );
    expect(screen.getByRole("button", { name: copy.creation.previewLabel })).toBeTruthy();
  });
});

describe("2P-REMINDER-004: cancel closes without writing, and focus comes back", () => {
  it("writes nothing when the dialog is dismissed", async () => {
    const user = userEvent.setup();
    const { action } = mount();
    await openDialog(user);
    await user.type(screen.getByLabelText(copy.creation.contentLabel, { exact: false }), "Ligar para a clínica");
    await user.click(screen.getByRole("button", { name: copy.creation.cancel }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("returns focus to the control that opened it", async () => {
    const user = userEvent.setup();
    mount();
    const opener = screen.getByRole("button", { name: copy.creation.open });
    await user.click(opener);
    await user.click(screen.getByRole("button", { name: copy.creation.cancel }));
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("closes on Escape as well, still without writing", async () => {
    const user = userEvent.setup();
    const { action } = mount();
    await openDialog(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("does not keep what was typed after a dismissal", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await user.type(screen.getByLabelText(copy.creation.contentLabel, { exact: false }), "Rascunho");
    await user.click(screen.getByRole("button", { name: copy.creation.cancel }));
    await user.click(screen.getByRole("button", { name: copy.creation.open }));
    const field = screen.getByLabelText(copy.creation.contentLabel, { exact: false }) as HTMLInputElement;
    expect(field.value).toBe("");
  });
});

describe("2P-REMINDER-002: saving", () => {
  it("submits the four fields and closes on success", async () => {
    const user = userEvent.setup();
    const action = vi.fn(handler(async () =>
      ({ status: "success", message: copy.creation.created, reminderId: "r1" })));
    mount(action);

    await openDialog(user);
    await fillRequired(user, "Ligar para a clínica");
    await user.click(screen.getByRole("button", { name: copy.creation.save }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const submitted = action.mock.calls[0][1];
    expect(submitted.get("title")).toBe("Ligar para a clínica");
    expect(submitted.get("locale")).toBe("pt-BR");
    expect(submitted.get("taskId")).toBe("");
    // Unchecked boxes are absent from `FormData`, which is exactly what the
    // schema's `important` default is written to accept.
    expect(submitted.get("important")).toBeNull();

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText(copy.creation.created)).toBeTruthy();
  });

  it("keeps the dialog open on a refusal, with the reason inside it", async () => {
    const user = userEvent.setup();
    const action = vi.fn(handler(async () =>
      ({ status: "error", message: copy.creation.invalidDate, reminderId: null })));
    mount(action);

    await openDialog(user);
    await fillRequired(user, "Algo");
    await user.click(screen.getByRole("button", { name: copy.creation.save }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(copy.creation.invalidDate)).toBeTruthy();
  });

  /**
   * The defect slice 2P.6 found in a browser and nothing below it could see: a
   * dialog closed by an effect while its own transition is still applying leaves
   * `pending` stuck true, frozen on *Criando…* over a row that was written.
   *
   * The property that prevents it is that openness is **derived** from `pending`
   * rather than set by a handler, so this asserts the observable consequence:
   * the dialog is still there while the action is in flight, and it is the
   * settling — not the success — that closes it.
   */
  /**
   * `2P-REMINDER-REVALIDATE-HANG` — the refresh is outside the transition.
   *
   * `createReminder` issues no `revalidatePath`, because a working one puts the
   * page's re-render inside the action's own transition and that transition
   * intermittently never settles — server answered 200, nothing logged, `pending`
   * stuck true, dialog frozen. Measured over ten consecutive creations against
   * `next start`: with revalidation, two to five successes then a hang past 120
   * seconds; without it and refreshing here instead, ten for ten.
   *
   * The property that makes the composer's refresh safe is **ordering**: it runs
   * only once the write has settled, so nothing it does can hold the dialog
   * open. That ordering is what this asserts, along with it happening once —
   * the refresh re-renders this component, and a refresh that re-triggered
   * itself would be a loop.
   */
  it("refreshes the list once, and only after the write has settled", async () => {
    const user = userEvent.setup();
    refresh.mockClear();
    let release: (state: ReminderCreationState) => void = () => {};
    const action = vi.fn(handler(() => new Promise<ReminderCreationState>((resolve) => {
      release = resolve;
    })));
    mount(action);

    await openDialog(user);
    await fillRequired(user, "Algo");
    await user.click(screen.getByRole("button", { name: copy.creation.save }));
    await waitFor(() => expect(action).toHaveBeenCalled());

    // In flight: nothing has been refreshed, because nothing has settled.
    expect(refresh).not.toHaveBeenCalled();

    release({ status: "success", message: copy.creation.created, reminderId: "r1" });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // Still once after everything has settled: not a loop.
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not refresh when the write was refused", async () => {
    const user = userEvent.setup();
    refresh.mockClear();
    const action = vi.fn(handler(async () =>
      ({ status: "error", message: copy.creation.failed, reminderId: null })));
    mount(action);

    await openDialog(user);
    await fillRequired(user, "Algo");
    await user.click(screen.getByRole("button", { name: copy.creation.save }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    await screen.findByText(copy.creation.failed);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stays open while the write is in flight, and closes only once it settles", async () => {
    const user = userEvent.setup();
    let release: (state: ReminderCreationState) => void = () => {};
    const action = vi.fn(() => new Promise<ReminderCreationState>((resolve) => { release = resolve; }));
    mount(action as never);

    await openDialog(user);
    await fillRequired(user, "Algo");
    await user.click(screen.getByRole("button", { name: copy.creation.save }));

    await waitFor(() => expect(action).toHaveBeenCalled());
    // In flight: still open, and saying so.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getAllByText(copy.creation.saving).length).toBeGreaterThan(0);

    release({ status: "success", message: copy.creation.created, reminderId: "r1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // And it is not frozen: the pending word is gone with it.
    expect(screen.queryByText(copy.creation.saving)).toBeNull();
  });
});
