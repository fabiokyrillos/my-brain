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

/**
 * The preview, stubbed — and, like the router above, an assertion target.
 *
 * The real one is a Server Action that reaches the database for its instants
 * (`2R-TIME-007`), so it cannot run here. What matters below is not the dates it
 * returns but **the payload it was handed**: the second device checkpoint found
 * the surface and the submission disagreeing, and the only way to prove they
 * agree is to capture what actually crossed the boundary.
 *
 * `vi.hoisted`, because `vi.mock` is hoisted above every `const` in this file
 * and a factory closing over a plain one reads it in the temporal dead zone.
 * The `ReferenceError` that follows is thrown *inside the action*, where React
 * swallows it into a rejected transition — so the symptom is a preview that
 * silently never arrives rather than an error anyone can see.
 */
const previewCalls = vi.hoisted(() => [] as FormData[]);
vi.mock("./series-actions", () => ({
  previewReminderSeries: async (_state: unknown, formData: FormData) => {
    previewCalls.push(formData);
    return {
      status: "ready" as const,
      message: "",
      description: "toda semana",
      occurrences: ["seg, 7 dez", "qua, 9 dez", "sex, 11 dez"],
    };
  },
}));

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
    /*
      Slice 2R.3's second checkpoint put a question in the middle of this, not a
      different ending. Cancelling a dialog that holds a typed title now asks
      before discarding it -- the checkpoint's *"botão explícito Fechar/Cancelar
      segue a mesma regra quando houver alterações"* -- and confirming the
      discard is what closes it. What must not change is that nothing is written
      on the way out.
    */
    const user = userEvent.setup();
    const { action } = mount();
    await openDialog(user);
    await user.type(screen.getByLabelText(copy.creation.contentLabel, { exact: false }), "Ligar para a clínica");
    await user.click(screen.getByRole("button", { name: copy.creation.cancel }));

    expect(screen.getByText(copy.creation.discardPrompt)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: copy.creation.discardConfirm }));

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
    // The draft is real, so the dialog asks; discarding is what makes this a
    // dismissal rather than a pause.
    await user.click(screen.getByRole("button", { name: copy.creation.discardConfirm }));
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

/**
 * `2R-SURFACE-008` and `2R-ACCESS-001`/`-003` — slice 2R.3.
 *
 * Three properties that are easy to believe and easy to get wrong:
 *
 * - a refused save keeps what the owner typed, which is a property of the action
 *   returning early **without revalidating** -- a `revalidatePath` on the failure
 *   path refreshes the page out from under the dialog and takes the typing with
 *   it, the defect `updateProfile` and slice 2N.3 both already record;
 * - the new control is reachable and operable by keyboard alone;
 * - the preview's live region exists **before** it has anything to say.
 */
describe("2R-SURFACE-008: a refused save never discards what was typed", () => {
  it("keeps the title, the instant and the repetition after a refusal", async () => {
    const user = userEvent.setup();
    const action = vi.fn(handler(async () => ({
      status: "error" as const,
      message: copy.creation.failed,
      reminderId: null,
    })));
    mount(action);
    await openDialog(user);

    const title = screen.getByLabelText(copy.creation.contentLabel, { exact: false });
    await user.type(title, "Pagar o aluguel");
    const when = screen.getByLabelText(copy.creation.whenLabel, { exact: false });
    await user.type(when, "2026-12-07T09:00");
    await user.selectOptions(
      screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }),
      "monthlyDay",
    );

    await user.click(screen.getByRole("button", { name: copy.creation.save }));
    await waitFor(() => expect(action).toHaveBeenCalled());

    // The dialog is still open, because a refusal is not a success -- and every
    // field still holds what it held.
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect((title as HTMLInputElement).value).toBe("Pagar o aluguel");
    expect((when as HTMLInputElement).value).toBe("2026-12-07T09:00");
    expect(
      (screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }) as HTMLSelectElement)
        .value,
    ).toBe("monthlyDay");
  });
});

describe("2R-ACCESS-001/-003: the new control by keyboard, and a region that pre-exists", () => {
  it("reaches and operates the repetition select without a pointer", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);

    const select = screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false });
    // Focusable by tab order rather than by a click, and changeable by keyboard.
    (select as HTMLSelectElement).focus();
    expect(document.activeElement).toBe(select);
    await user.selectOptions(select, "weekly");
    expect((select as HTMLSelectElement).value).toBe("weekly");
  });

  it("renders the preview region empty before it has a result", async () => {
    /*
      A live region created together with its first sentence is a NEW element
      rather than a changed one, and a screen reader announces nothing at all --
      the defect `a-conditional-live-region-is-never-announced` records. So the
      region is asserted present and EMPTY, before anything has happened in it.
    */
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await user.selectOptions(
      screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }),
      "daily",
    );

    const region = screen.getByRole("status", { name: copy.creation.previewRegionLabel });
    expect(region).toBeTruthy();
    expect(region.textContent).toBe("");
  });

  it("labels the repetition control, so it has an accessible name", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    // `getByLabelText` throwing IS the assertion; the explicit check keeps the
    // intent readable rather than relying on a query's side effect.
    expect(screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false })).toBeTruthy();
  });
});

/**
 * The owner device checkpoint's first finding, on the surface — slice 2R.3 fix.
 *
 * *"Para repetir segunda, quarta e sexta, eu teria de criar tres lembretes."*
 *
 * The model always stored an array; the surface offered one day. These assert
 * the picker exists, that it is scoped to `weekly` so the dialog does not become
 * a form, and that what it submits is **one** series with several days rather
 * than several of anything.
 */
const weekdayBoxes = () =>
  screen.getAllByRole("checkbox").filter((box) => box.getAttribute("name") === "weekdays");

const chooseWeekly = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.selectOptions(
    screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }),
    "weekly",
  );
};

describe("2R-SURFACE-001 fix: several weekdays, one series", () => {
  it("shows seven days, and only when weekly is chosen", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);

    expect(weekdayBoxes(), "days are showing before weekly was chosen").toHaveLength(0);
    await chooseWeekly(user);
    expect(weekdayBoxes()).toHaveLength(7);

    // And they leave again for a frequency that does not need them, which is
    // what keeps the dialog a control rather than a form.
    await user.selectOptions(
      screen.getByLabelText(copy.creation.recurrenceLabel, { exact: false }),
      "monthlyDay",
    );
    expect(weekdayBoxes()).toHaveLength(0);
  });

  it("pre-selects the weekday of the date already entered", async () => {
    // `2R-SURFACE-001`'s property survives the fix: the date on the screen still
    // supplies the parameter, and the checkpoint asked for this in terms.
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    // 2026-12-07 is a Monday, so the first box is the one ticked.
    await user.type(screen.getByLabelText(copy.creation.whenLabel, { exact: false }), "2026-12-07T09:00");
    await chooseWeekly(user);

    const ticked = weekdayBoxes().filter((box) => (box as HTMLInputElement).checked);
    expect(ticked).toHaveLength(1);
    expect(ticked[0].getAttribute("value")).toBe("1");
  });

  it("submits one series carrying every day the owner ticked", async () => {
    const user = userEvent.setup();
    const { action } = mount();
    await openDialog(user);
    await user.type(screen.getByLabelText(copy.creation.contentLabel, { exact: false }), "Academia");
    await user.type(screen.getByLabelText(copy.creation.whenLabel, { exact: false }), "2026-12-07T07:00");
    await chooseWeekly(user);

    // Monday is already ticked from the date; add Wednesday and Friday.
    await user.click(screen.getByLabelText(copy.creation.weekdayLong[2], { exact: false }));
    await user.click(screen.getByLabelText(copy.creation.weekdayLong[4], { exact: false }));
    await user.click(screen.getByRole("button", { name: copy.creation.save }));
    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0]![1] as FormData;
    // THE REPORTED CASE. One submission, three days -- not three reminders.
    expect(formData.getAll("weekdays")).toEqual(["1", "3", "5"]);
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("lets the owner drop the seeded day once they touch the control", async () => {
    /*
      The seed follows the date only while the owner has not chosen. Otherwise
      changing the time would silently reinstate a day they had just unticked --
      a control that argues with its user.
    */
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await user.type(screen.getByLabelText(copy.creation.whenLabel, { exact: false }), "2026-12-07T09:00");
    await chooseWeekly(user);

    await user.click(screen.getByLabelText(copy.creation.weekdayLong[1], { exact: false }));
    await user.click(screen.getByLabelText(copy.creation.weekdayLong[0], { exact: false }));

    const ticked = weekdayBoxes()
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => box.getAttribute("value"));
    expect(ticked).toEqual(["2"]);
  });

  it("names every day for a reader who cannot see the two-letter face", async () => {
    // `2R-ACCESS-002`. "Seg" is a face, not a name, and a control labelled by it
    // is unreadable aloud.
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await chooseWeekly(user);

    for (const long of copy.creation.weekdayLong) {
      expect(screen.getByLabelText(long, { exact: false }), `${long} has no accessible name`)
        .toBeTruthy();
    }
  });

  it("keeps them as real checkboxes, so their state is announced", async () => {
    // Not `aria-pressed` buttons: a checkbox's checked state is already a thing
    // every screen reader knows, and it stays keyboard-operable for free.
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await chooseWeekly(user);
    for (const box of weekdayBoxes()) expect(box.getAttribute("type")).toBe("checkbox");
  });
});

/**
 * The **second** device checkpoint's finding — slice 2R.3, corrective round two.
 *
 * *"Ao selecionar segunda, quarta e sexta e tocar em 'Ver próximas datas', os
 * dias ficam visualmente desmarcados. Apesar de desmarcados na interface, a
 * prévia continua correta."*
 *
 * The owner reported it as a visual defect. It is not: instrumenting the round
 * trip showed the preview receiving `[1,3,5]` and **the save that follows
 * receiving `[1]`**. The preview is computed from the `FormData` captured at
 * submit time, before the reset; the save is computed from the DOM the reset
 * left behind. So the dialog showed three days, promised three days, and would
 * have written one.
 *
 * These assert the contract the owner wrote: what is visible, what is previewed
 * and what is saved are the same set — across a preview, and across a refusal.
 */
const ticked = () =>
  weekdayBoxes()
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => box.getAttribute("value"));

const monWedFri = async (user: ReturnType<typeof userEvent.setup>) => {
  /*
    The title is typed first because the checkpoint was performed on a reminder
    that had one, and because the preview reaches its action through the form:
    `title` is `required`, so an empty one is refused by constraint validation
    before any handler runs. Leaving it out would have made these fail on a
    submission that never happened rather than on the defect they are for.
  */
  await user.type(screen.getByLabelText(copy.creation.contentLabel, { exact: false }), "Academia");
  // 2026-12-07 is a Monday, so the date seeds day 1; the owner adds 3 and 5.
  await user.type(screen.getByLabelText(copy.creation.whenLabel, { exact: false }), "2026-12-07T07:00");
  await chooseWeekly(user);
  await user.click(screen.getByLabelText(copy.creation.weekdayLong[2], { exact: false }));
  await user.click(screen.getByLabelText(copy.creation.weekdayLong[4], { exact: false }));
};

const askForPreview = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole("button", { name: copy.creation.previewLabel }));
  await screen.findByText("toda semana");
};

describe("2R-SURFACE-008 fix: the preview does not unpick the days", () => {
  it("leaves Monday, Wednesday and Friday ticked after the preview is asked for", async () => {
    // THE REPORTED CASE, exactly as the checkpoint performed it.
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await monWedFri(user);
    expect(ticked(), "the three days were not ticked to begin with").toEqual(["1", "3", "5"]);

    await askForPreview(user);

    expect(ticked()).toEqual(["1", "3", "5"]);
  });

  it("saves the days that are visible, not the ones a form reset left behind", async () => {
    /*
      The half the checkpoint could not see. A preview that leaves the boxes
      empty also empties what the next save submits, and `deriveRecurrenceRule`
      reads an empty set as *the owner said nothing* and falls back to the
      anchor's own weekday. The dialog would have shown three days and written
      one -- a field lying about what will be saved, which is the shape
      `2R-SURFACE-008` exists to prevent.
    */
    const user = userEvent.setup();
    const { action } = mount();
    await openDialog(user);
    await monWedFri(user);
    await askForPreview(user);

    expect(previewCalls.at(-1)!.getAll("weekdays"), "the preview itself was already wrong")
      .toEqual(["1", "3", "5"]);

    await user.click(screen.getByRole("button", { name: copy.creation.save }));
    await waitFor(() => expect(action).toHaveBeenCalled());
    const saved = action.mock.calls[0]![1] as FormData;
    expect(saved.getAll("weekdays")).toEqual(["1", "3", "5"]);
  });

  it("keeps importance ticked across the preview", async () => {
    // The same reset, on the field beside them. `important` is submitted by
    // presence, so a silent untick is a silent change of meaning.
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await monWedFri(user);
    const important = screen.getByLabelText(copy.creation.importantLabel, { exact: false });
    await user.click(important);
    expect((important as HTMLInputElement).checked).toBe(true);

    await askForPreview(user);

    expect((important as HTMLInputElement).checked).toBe(true);
  });

  it("previews before the reminder has been named", async () => {
    /*
      A claim the file made and did not honour. The preview button carried
      `formNoValidate` and a comment saying previewing before naming is
      reasonable -- but it was a submit button, so an empty `required` title was
      refused by constraint validation and the action never ran at all. A button
      that dispatches for itself has nothing to validate.
    */
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await user.type(screen.getByLabelText(copy.creation.whenLabel, { exact: false }), "2026-12-07T07:00");
    await chooseWeekly(user);

    await askForPreview(user);

    expect(previewCalls.at(-1)!.get("title")).toBe("");
  });

  it("keeps the days after a refused save", async () => {
    // `2R-SURFACE-008` in terms: a refusal must not alter the rule. The days
    // were never covered by it, because the test that named the requirement
    // predates the picker.
    const user = userEvent.setup();
    const action = vi.fn(handler(async () => ({
      status: "error" as const,
      message: copy.creation.failed,
      reminderId: null,
    })));
    mount(action);
    await openDialog(user);
    await monWedFri(user);

    await user.click(screen.getByRole("button", { name: copy.creation.save }));
    await waitFor(() => expect(action).toHaveBeenCalled());

    expect(screen.getByRole("dialog"), "the refusal closed the dialog").toBeTruthy();
    expect(ticked()).toEqual(["1", "3", "5"]);
  });
});

/**
 * The checkpoint's third finding, on this dialog: *"Se houver algo escrito ou
 * alterado, fechar pelo backdrop deve pedir confirmação antes de descartar."*
 *
 * The rule itself belongs to `ConfirmDialog` and is proved in
 * `confirm-dialog.test.tsx`. What is proved here is the half only this component
 * can get wrong: that its own `isDirty` reports the truth about **this** form,
 * including the two fields that live only in the DOM.
 */
const backdrop = () => document.querySelector(".task-command-dialog-backdrop") as HTMLElement;

describe("2P-REMINDER-004 + checkpoint two: a draft is worth a question", () => {
  it("closes at once when nothing has been typed", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await user.click(backdrop());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("asks before discarding a title the owner typed", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await user.type(screen.getByLabelText(copy.creation.contentLabel, { exact: false }), "Academia");

    await user.click(backdrop());
    expect(screen.getByText(copy.creation.discardPrompt)).toBeTruthy();
    expect(screen.getByRole("dialog"), "it closed instead of asking").toBeTruthy();
  });

  it("asks about importance, which lives only in the DOM", async () => {
    // A dirty check built from this component's four state values would call
    // the dialog clean here and throw the tick away without a word.
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await user.click(screen.getByLabelText(copy.creation.importantLabel, { exact: false }));

    await user.click(backdrop());
    expect(screen.getByText(copy.creation.discardPrompt)).toBeTruthy();
  });

  it("goes back to clean when the owner undoes the edit by hand", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    const title = screen.getByLabelText(copy.creation.contentLabel, { exact: false });
    await user.type(title, "Academia");
    await user.clear(title);

    await user.click(backdrop());
    expect(screen.queryByRole("dialog"), "it asked about an edit that was undone").toBeNull();
  });

  it("keeps the whole draft when the owner chooses to go back", async () => {
    const user = userEvent.setup();
    mount();
    await openDialog(user);
    await monWedFri(user);
    await user.click(screen.getByLabelText(copy.creation.importantLabel, { exact: false }));

    await user.click(backdrop());
    await user.click(screen.getByRole("button", { name: copy.creation.discardResume }));

    expect(ticked()).toEqual(["1", "3", "5"]);
    expect(
      (screen.getByLabelText(copy.creation.importantLabel, { exact: false }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText(copy.creation.contentLabel, { exact: false }) as HTMLInputElement).value,
    ).toBe("Academia");
  });
});
