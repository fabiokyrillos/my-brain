import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TaskUndoState } from "@/features/task-commands/task-undo-state";
import { getWorkCopy } from "./copy";
import { UndoAffordance } from "./undo-affordance";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

/**
 * `2L-EDIT-008`/`-009` — undo, on the surfaces where the operation happened.
 *
 * Before this slice the product had a working, tested, owner-scoped undo and
 * offered it in exactly one place: the natural-language console. A user who
 * completed a task by clicking the button on the row it belongs to was offered
 * nothing, and the row that had just been written was reversible for 24 hours
 * without anyone being told.
 */

const OFFER = { undoId: "9f1c2f2e-1111-4111-8111-111111111111", expiresAt: "2099-01-01T00:00:00.000Z" };
const EXPIRED = { undoId: OFFER.undoId, expiresAt: "2020-01-01T00:00:00.000Z" };

function handler(result: TaskUndoState = { status: "undone", message: "Undone.", announcement: "Undone." }) {
  const seen: FormData[] = [];
  const action = vi.fn(async (_state: TaskUndoState, formData: FormData) => {
    seen.push(formData);
    return result;
  });
  return { action, seen };
}

function renderUndo(
  undo: { undoId: string; expiresAt: string } | null,
  options: { locale?: "pt-BR" | "en"; now?: Date; result?: TaskUndoState } = {},
) {
  const { action, seen } = handler(options.result);
  const view = render(
    <UndoAffordance
      action={action}
      locale={options.locale ?? "en"}
      now={options.now ?? new Date("2026-08-09T12:00:00.000Z")}
      undo={undo}
    />,
  );
  return { ...view, action, seen };
}

describe("UndoAffordance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when the domain wrote nothing to reverse", () => {
    // `2L-EDIT-009`. `apply_task_command` returns `undoId: null` for a
    // no-change, because 2E-UPDATE-009 requires it to write no undo row — so
    // the absence is the database's answer, not this component's guess.
    const { container } = renderUndo(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers undo and states the window in the user's own words", () => {
    renderUndo(OFFER, { locale: "en" });
    const copy = getWorkCopy("en").undo;

    expect(screen.getByRole("button", { name: copy.label })).toBeVisible();
    expect(screen.getByText(copy.window)).toBeVisible();
  });

  it("disappears once the window has passed rather than failing when pressed", () => {
    // `2L-EDIT-008`. A control that is still there and refuses is a control that
    // wasted the user's attempt; the row itself says when it stopped being
    // undoable, so the surface can simply stop offering.
    const { container } = renderUndo(EXPIRED);
    expect(container).toBeEmptyDOMElement();
  });

  it("carries only the undo id", async () => {
    // Nothing about this request authorizes anything: the router re-reads the
    // row, and an id that is not the caller's, not a task-command operation or
    // already spent resolves to the same refusal.
    const user = userEvent.setup();
    const { seen } = renderUndo(OFFER);

    await user.click(screen.getByRole("button", { name: getWorkCopy("en").undo.label }));

    await waitFor(() => expect(seen).toHaveLength(1));
    expect([...seen[0].keys()].sort()).toEqual(["locale", "undoId"]);
    expect(seen[0].get("undoId")).toBe(OFFER.undoId);
  });

  it("reports the outcome and stops offering the control", async () => {
    const user = userEvent.setup();
    renderUndo(OFFER);

    await user.click(screen.getByRole("button", { name: getWorkCopy("en").undo.label }));

    await waitFor(() => expect(
      within(screen.getByRole("region", { name: getWorkCopy("en").undo.regionLabel })).getByText("Undone."),
    ).toBeVisible());
    expect(screen.queryByRole("button", { name: getWorkCopy("en").undo.label })).toBeNull();
  });

  it("distinguishes already-undone from expired", async () => {
    const user = userEvent.setup();
    const copy = getWorkCopy("en").undo;
    renderUndo(OFFER, {
      result: { status: "unavailable", message: copy.unavailable, announcement: copy.unavailable },
    });

    await user.click(screen.getByRole("button", { name: copy.label }));

    await waitFor(() => expect(
      within(screen.getByRole("region", { name: copy.regionLabel })).getByText(copy.unavailable),
    ).toBeVisible());
    expect(screen.queryByText(copy.expired)).toBeNull();
  });

  it("announces the outcome once, in a polite live region", async () => {
    const user = userEvent.setup();
    const { container } = renderUndo(OFFER);

    await user.click(screen.getByRole("button", { name: getWorkCopy("en").undo.label }));

    await waitFor(() => {
      const live = container.querySelector('[role="status"]');
      expect(live).toHaveAttribute("aria-live", "polite");
      expect(live).toHaveTextContent("Undone.");
    });
  });

  it("localizes the offer and the window in both locales", () => {
    for (const locale of ["pt-BR", "en"] as const) {
      const { unmount } = renderUndo(OFFER, { locale });
      const copy = getWorkCopy(locale).undo;
      expect(screen.getByRole("button", { name: copy.label })).toBeVisible();
      expect(screen.getByText(copy.window)).toBeVisible();
      unmount();
    }
  });

  it("never promises a reversal and a recovery path in one sentence", () => {
    // PRD §5.2: "you can undo this for 24 hours" and "you can recover this
    // afterwards" are different mechanisms with different guarantees. There is
    // no shared string they could be assembled from, and this pins that.
    const source = readFileSync(join(__dirname, "copy.ts"), "utf8");
    const undoBlock = source.match(/undo: \{[\s\S]*?\},/g) ?? [];
    expect(undoBlock.length).toBeGreaterThan(0);
    for (const block of undoBlock) {
      expect(block).not.toMatch(/recover|recupera/i);
    }
  });

  it("adds no write path of its own", () => {
    const source = readFileSync(join(__dirname, "undo-affordance.tsx"), "utf8");
    expect(source).not.toMatch(/\.rpc\(|from\s+["']@\/lib\/supabase|use server/);
  });
});

/**
 * The shape the RPC actually sends, which no fixture in this file used.
 *
 * Every case above expresses `expiresAt` as `…Z`, and every one of them passed
 * for two phases while the control never rendered in production.
 * `apply_task_command` formats the window with Postgres `OF`, which writes
 * `+00` for UTC — a two-digit offset ECMAScript does not accept — so the real
 * value parsed to `NaN` and the fail-closed branch swallowed the button.
 *
 * *A fixture that is prettier than the value tests the fixture.* These cases
 * use the rendering verbatim, so the day the format changes they fail here
 * rather than in someone's browser.
 */
describe("UndoAffordance against the instant the RPC renders", () => {
  beforeEach(() => vi.clearAllMocks());

  const RENDERED = {
    undoId: "9f1c2f2e-1111-4111-8111-111111111111",
    // `to_char(x, 'YYYY-MM-DD"T"HH24:MI:SS.USOF')`, byte for byte.
    expiresAt: "2026-08-10T12:00:00.000000+00",
  };

  it("offers the control for a window that has not closed", () => {
    renderUndo(RENDERED, { now: new Date("2026-08-09T12:00:00.000Z") });
    expect(screen.getByRole("button", { name: /undo/i })).toBeTruthy();
  });

  it("still withdraws it once that same window has closed", () => {
    const { container } = renderUndo(RENDERED, { now: new Date("2026-08-11T12:00:00.000Z") });
    expect(container).toBeEmptyDOMElement();
  });

  it("reads a whole-hour negative offset too", () => {
    renderUndo(
      { ...RENDERED, expiresAt: "2026-08-10T09:00:00.000000-03" },
      { now: new Date("2026-08-09T12:00:00.000Z") },
    );
    expect(screen.getByRole("button", { name: /undo/i })).toBeTruthy();
  });
});
