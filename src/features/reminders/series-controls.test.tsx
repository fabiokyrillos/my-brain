import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two Server Actions, stubbed at the module boundary.
 *
 * `ReminderSeriesProvider` imports them directly rather than taking them as
 * props, because it is the page's provider and a prop would be a seam that
 * exists only for this file. Mocking the module keeps `useActionState` real —
 * which matters, since half of what is asserted below is *when* the offer
 * appears and disappears across action rounds, and a hand-driven state would
 * prove nothing about that.
 */
const apply = vi.fn();
const undo = vi.fn();
vi.mock("./series-actions", () => ({
  applyReminderSeriesCommand: (state: unknown, formData: FormData) => apply(state, formData),
  undoReminderSeriesOperation: (state: unknown, formData: FormData) => undo(state, formData),
}));

import { getReminderCopy } from "./copy";
import type { ReminderSeriesRef, ReminderViewModel } from "./projection";
import { ReminderSeriesControls } from "./series-controls";
import { IDLE_REMINDER_SERIES_STATE } from "./series-action-state";
import { ReminderSeriesBanner, ReminderSeriesProvider } from "./series-feedback";

/**
 * The scope question, on the surface — `2R-SERIES-001` … `-009`, slice 2R.2.
 *
 * ## What these assert that an RPC test cannot
 *
 * `phase_2r_reminder_recurrence.sql` already proves what each command does to
 * the database. None of that says the owner is ever *asked* which one they
 * meant, that the safer answer is the one pre-selected, that nothing is written
 * before they answer, or that the reversal they are offered can be spent twice.
 * Those are properties of the rendered page, and the acceptance record's rule
 * for this slice is explicit: a passing RPC call is not a delivered feature.
 *
 * ## The negative cases are the load-bearing ones
 *
 * A control that appears when it should is easy. The cases that matter are the
 * three where something must be **absent**: no scope chooser on a detached
 * occurrence, no controls at all on an ended rule, and — the one this slice
 * exists to get right — **no undo offer for an operation that has no real
 * compensation**, which is why `2R-SERIES-008` is a requirement and not a note.
 */

const SERIES_ID = "77777777-7777-4777-8777-777777777777";
const REMINDER_ID = "44444444-4444-4444-8444-444444444444";
const UNDO_ID = "99999999-9999-4999-8999-999999999999";

const copy = getReminderCopy("pt-BR").series;

function reminder(series: ReminderSeriesRef | null): ReminderViewModel {
  return {
    id: REMINDER_ID,
    title: "Pagar o aluguel",
    status: "scheduled",
    important: false,
    remindAt: "2026-12-05T09:00:00+00:00",
    sentAt: null,
    hasPendingDelivery: true,
    overdue: false,
    link: null,
    series,
    actions: ["snooze", "reschedule", "edit", "cancel"],
    expectedState: {
      status: "scheduled",
      remindAt: "2026-12-05T09:00:00+00:00",
      title: "Pagar o aluguel",
      important: false,
    },
    historyHref: `/pt-BR/app/history?entity=reminder&subject=${REMINDER_ID}`,
  };
}

const attached: ReminderSeriesRef = {
  id: SERIES_ID,
  active: true,
  detached: false,
  sequence: 2,
};

function mount(series: ReminderSeriesRef | null = attached) {
  return render(
    <ReminderSeriesProvider>
      <ReminderSeriesBanner locale="pt-BR" />
      <ReminderSeriesControls
        anchorTimeValue="09:00"
        locale="pt-BR"
        reminder={reminder(series)}
      />
    </ReminderSeriesProvider>,
  );
}

beforeEach(() => {
  apply.mockReset();
  undo.mockReset();
  apply.mockResolvedValue(IDLE_REMINDER_SERIES_STATE);
  undo.mockResolvedValue(IDLE_REMINDER_SERIES_STATE);
});
afterEach(cleanup);

describe("2R-SERIES-001 — the scope is asked, and the narrower one is the default", () => {
  it("offers both scopes once the panel is open", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: copy.editLabel }));

    const group = screen.getByRole("group", { name: copy.scopeLegend });
    expect(within(group).getByRole("radio", { name: copy.scopeOccurrence })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: copy.scopeFuture })).toBeTruthy();
  });

  it("pre-selects `this occurrence only`", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: copy.editLabel }));

    // OD-2R-4 signed the narrower as the fallback. Asserted on the rendered
    // control rather than on the constant, because the constant being right and
    // the control ignoring it is exactly the failure worth catching.
    expect(
      (screen.getByRole("radio", { name: copy.scopeOccurrence }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: copy.scopeFuture }) as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("writes nothing until the choice is submitted", async () => {
    const user = userEvent.setup();
    mount();

    // Opening the panel is not a mutation.
    await user.click(screen.getByRole("button", { name: copy.editLabel }));
    expect(apply).not.toHaveBeenCalled();

    // Neither is changing the answer.
    await user.click(screen.getByRole("radio", { name: copy.scopeFuture }));
    expect(apply).not.toHaveBeenCalled();

    // Nor closing the panel again.
    await user.click(screen.getByRole("button", { name: copy.close }));
    expect(apply).not.toHaveBeenCalled();
  });

  it("submits the scope the owner chose, as a word from the closed set", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: copy.editLabel }));
    await user.click(screen.getByRole("radio", { name: copy.scopeFuture }));
    await user.click(screen.getByRole("button", { name: copy.apply }));

    const formData = apply.mock.calls[0]?.[1] as FormData;
    expect(formData.get("scope")).toBe("future");
    expect(formData.get("seriesId")).toBe(SERIES_ID);
    // No command name crosses this boundary — `commandForScope` is the only
    // place a scope becomes one.
    expect(formData.get("kind")).toBeNull();
  });
});

describe("2R-SERIES-009 — the scope reported is the database's, not the request's", () => {
  it("states the applied scope even when it differs from the one asked for", async () => {
    const user = userEvent.setup();
    // The owner asks for `future`; the action reports `occurrence` came back.
    // A surface echoing its own request would report the disagreement away.
    apply.mockResolvedValue({
      status: "success",
      message: copy.appliedOccurrence,
      seriesId: SERIES_ID,
      scope: "occurrence",
      undoId: UNDO_ID,
    });
    mount();
    await user.click(screen.getByRole("button", { name: copy.editLabel }));
    await user.click(screen.getByRole("radio", { name: copy.scopeFuture }));
    await user.click(screen.getByRole("button", { name: copy.apply }));

    expect(await screen.findByText(copy.appliedOccurrence)).toBeTruthy();
  });
});

describe("2R-SERIES-005 — ending asks first", () => {
  it("does not end the series on the first press", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: copy.endLabel }));

    expect(apply).not.toHaveBeenCalled();
    expect(screen.getByText(copy.endConfirmTitle)).toBeTruthy();
    // The body has to say the history survives, because it does.
    expect(screen.getByText(copy.endConfirmBody)).toBeTruthy();
  });

  it("ends it on the confirmation, and dismissing writes nothing", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: copy.endLabel }));
    await user.click(screen.getByRole("button", { name: copy.endConfirmDismiss }));
    expect(apply).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: copy.endLabel }));
    await user.click(screen.getByRole("button", { name: copy.endConfirmAccept }));
    expect((apply.mock.calls[0]?.[1] as FormData).get("end")).toBe("on");
  });
});

describe("2R-SERIES-004 — a detached occurrence says so, and offers no scope", () => {
  it("shows the badge and the sentence", () => {
    mount({ ...attached, detached: true });
    expect(screen.getByText(copy.detachedBadge)).toBeTruthy();
    expect(screen.getByText(copy.detachedHint)).toBeTruthy();
  });

  it("offers neither an edit nor an end", () => {
    mount({ ...attached, detached: true });
    // Absent, not disabled: a disabled control advertises a capability that does
    // not exist, which is the placeholder UX-12 refuses.
    expect(screen.queryByRole("button", { name: copy.editLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.endLabel })).toBeNull();
  });

  it("still says the row repeats, because its provenance survives detachment", () => {
    mount({ ...attached, detached: true });
    expect(screen.getByText(copy.badge)).toBeTruthy();
  });
});

describe("an ended rule keeps its badge and loses its controls", () => {
  it("offers nothing to change", () => {
    mount({ ...attached, active: false });
    expect(screen.getByText(copy.badge)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.editLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.endLabel })).toBeNull();
  });
});

describe("2R-SERIES-006 — cancelling one occurrence is not cancelling the series", () => {
  it("says so on the row, where the cancel control is", () => {
    mount();
    expect(screen.getByText(copy.occurrenceCancelNote)).toBeTruthy();
  });
});

describe("2R-SERIES-007/-008 — the undo is offered only when one exists, and spends once", () => {
  it("offers no undo for an operation that returned no ledger row", async () => {
    const user = userEvent.setup();
    /*
      The requirement this case is the whole of.

      `2R-SERIES-008` says an operation without a real undo names itself and asks
      first rather than showing a control that claims a reversal. The offer here
      is `undoId !== null` and nothing else, so an operation that wrote no
      compensable row cannot be given a button — there is no branch that could
      decide otherwise. This is also why no control in this slice offers an undo
      for the Phase 2P reminder commands: `undo_apply_reminder_command_v1`
      leaves its ledger row open (`2R-UNDO-LEDGER-NOT-CLOSED`), so a second press
      would compensate a second time.
    */
    apply.mockResolvedValue({
      status: "success",
      message: copy.ended,
      seriesId: SERIES_ID,
      scope: null,
      undoId: null,
    });
    mount();
    await user.click(screen.getByRole("button", { name: copy.endLabel }));
    await user.click(screen.getByRole("button", { name: copy.endConfirmAccept }));

    expect(await screen.findByText(copy.ended)).toBeTruthy();
    expect(screen.queryByRole("button", { name: copy.undoLabel })).toBeNull();
  });

  it("offers it when the operation wrote one, and withdraws it once spent", async () => {
    const user = userEvent.setup();
    apply.mockResolvedValue({
      status: "success",
      message: copy.appliedOccurrence,
      seriesId: SERIES_ID,
      scope: "occurrence",
      undoId: UNDO_ID,
    });
    undo.mockResolvedValue({
      status: "success",
      message: copy.undoSucceeded,
      seriesId: null,
      scope: null,
      undoId: null,
    });
    mount();
    await user.click(screen.getByRole("button", { name: copy.editLabel }));
    await user.click(screen.getByRole("button", { name: copy.apply }));

    const offer = await screen.findByRole("button", { name: copy.undoLabel });
    expect((within(offer.closest("form")!).getByDisplayValue(UNDO_ID) as HTMLInputElement).name)
      .toBe("undoId");

    await user.click(offer);

    expect(await screen.findByText(copy.undoSucceeded)).toBeTruthy();
    // The surface does not offer a second consumption of a row it just spent.
    expect(screen.queryByRole("button", { name: copy.undoLabel })).toBeNull();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it("reads a second consumption as `already undone`, never as a second reversal", async () => {
    const user = userEvent.setup();
    apply.mockResolvedValue({
      status: "success",
      message: copy.appliedOccurrence,
      seriesId: SERIES_ID,
      scope: "occurrence",
      undoId: UNDO_ID,
    });
    // What the router returns when the ledger row is already closed. Reaching
    // this branch at all is the property the 2R handlers have and the inherited
    // Phase 2P one does not.
    undo.mockResolvedValue({
      status: "success",
      message: copy.undoAlready,
      seriesId: null,
      scope: null,
      undoId: null,
    });
    mount();
    await user.click(screen.getByRole("button", { name: copy.editLabel }));
    await user.click(screen.getByRole("button", { name: copy.apply }));
    await user.click(await screen.findByRole("button", { name: copy.undoLabel }));

    expect(await screen.findByText(copy.undoAlready)).toBeTruthy();
    // Three sentences, three meanings. "Already undone" must not be reported as
    // a failure the owner should act on, nor as a reversal that happened twice.
    expect(screen.queryByText(copy.undoSucceeded)).toBeNull();
    expect(screen.queryByText(copy.undoFailed)).toBeNull();
  });

  it("announces every outcome through a region that existed before it had one", async () => {
    const user = userEvent.setup();
    /*
      A live region created together with its first sentence is a NEW element
      rather than a changed one, and a screen reader announces nothing at all.
      So the region is asserted present on an idle page, before anything has
      happened in it.
    */
    mount();
    const region = screen.getByRole("status", { name: copy.resultRegionLabel });
    expect(region.textContent).toBe("");

    apply.mockResolvedValue({
      status: "success",
      message: copy.appliedFuture,
      seriesId: SERIES_ID,
      scope: "future",
      undoId: UNDO_ID,
    });
    await user.click(screen.getByRole("button", { name: copy.editLabel }));
    await user.click(screen.getByRole("button", { name: copy.apply }));

    expect(await within(region).findByText(copy.appliedFuture)).toBeTruthy();
    // The button is outside the region: inside, every re-render of its label
    // would be announced as though it were an outcome.
    expect(within(region).queryByRole("button", { name: copy.undoLabel })).toBeNull();
  });
});

describe("no rule, no controls", () => {
  it("renders nothing at all for an ordinary reminder", () => {
    const { container } = render(
      <ReminderSeriesProvider>
        <ReminderSeriesControls anchorTimeValue="09:00" locale="pt-BR" reminder={reminder(null)} />
      </ReminderSeriesProvider>,
    );
    expect(container.querySelector(".reminder-series")).toBeNull();
  });
});
