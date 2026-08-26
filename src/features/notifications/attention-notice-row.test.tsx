/**
 * The notice row on **the attention surface** — `2S-SILENCE-008`, `2S-ACT-011`.
 *
 * What these tests are for, and what they deliberately leave to their
 * neighbours:
 *
 * - `notification-row-actions.test.tsx` proves the controls' **behaviour**:
 *   what each verb dispatches, the single live region, the focus contract, the
 *   refusals. Repeating it here would be a second copy of the same assertions
 *   against the same component.
 * - `phase-2s-verb-authority.test.ts` proves the **import graph**: one
 *   vocabulary, one mount, one handler bundle, five pre-existing destinations.
 * - This file proves the third thing neither of those can: that the row the
 *   attention surface renders offers **exactly the verbs the one authority
 *   decided for it**, in both locales, and that the surface adds nothing and
 *   removes nothing on the way.
 *
 * Every expected verb set is computed by calling `verbsForRow` — the real
 * predicate — rather than typed out. A fixture that listed the verbs by hand
 * would be a second vocabulary hiding inside a test.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const pushed: string[] = [];
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: (href: string) => { pushed.push(href); } }),
}));

import { noticeHandlerSpies, noticeRow } from "@/test/notification-verb-fixtures";
import type { Locale } from "@/lib/preferences";

import { getNotificationActionCopy } from "./action-copy";
import { AttentionNoticeRow } from "./attention-notice-row";
import { getVerbCopy, verbsForRow } from "./verbs";

const OWNER_ZONE = "America/Sao_Paulo";

afterEach(() => {
  cleanup();
  pushed.length = 0;
});

function renderRow(options: Parameters<typeof noticeRow>[0] & { locale?: Locale } = {}) {
  const { locale = "pt-BR", ...rowOptions } = options;
  const row = noticeRow(rowOptions);
  const spies = noticeHandlerSpies();
  render(<AttentionNoticeRow handlers={spies.handlers} locale={locale} row={row} timeZone={OWNER_ZONE} />);
  return { row, spies };
}

/** Every control the row rendered, by accessible name. */
function controlNames(): string[] {
  return screen.getAllByRole("button").map((button) => button.getAttribute("aria-label") ?? button.textContent ?? "");
}

describe("2S-ACT-011: the attention row offers exactly the verbs the authority decided", () => {
  for (const locale of ["pt-BR", "en"] as const) {
    it(`renders the primary verb and the menu, and nothing else, in ${locale}`, async () => {
      const { row } = renderRow({ locale });
      const verbCopy = getVerbCopy(locale);
      const copy = getNotificationActionCopy(locale);

      // The set is derived from the real predicate, and from the row's OWN
      // status rather than from a status typed twice — a second copy of the
      // fixture's premise is a second place it can go wrong.
      const expected = verbsForRow({
        subjectType: row.subject?.subjectType ?? null,
        subjectStatus: row.subjectStatus,
        noticeStatus: row.notification.status,
      });
      expect(row.verbs.map((verb) => verb.id)).toEqual(expected.map((verb) => verb.id));

      /*
       * `2S-ACT-002` — one primary VERB plus one menu trigger, and the row's
       * whole control set enumerated as a closed set beside them.
       *
       * RETARGETED IN 2S.3, and the reason is in this repository's own
       * baseline. `2S-FOUNDATION-003` measured this surface as offering **two
       * controls, *Abrir* and *Lida***: the destination was always a control of
       * its own, sitting beside whatever the row's verb was. `2S-ACT-002` is
       * about what replaced *Lida* — every other ACTION in one menu — not about
       * removing the destination.
       *
       * On `/app/notifications` that distinction is carried by element type:
       * *Abrir* is an `<a>`, so it never entered a button count. On the
       * attention row it cannot be, because `2S-ATTENTION-006` requires opening
       * to WRITE before it navigates, and a link that raced its own write would
       * leave the owner looking at a notice they just opened, still unread.
       *
       * So the set is enumerated instead of counted — which is stricter, not
       * looser: a fourth control of any kind fails here.
       */
      const names = controlNames();
      expect(names).toContain(verbCopy[expected[0].id].accessibleName(row.subjectLabel));
      expect(names).toContain(copy.menuLabel(row.subjectLabel));
      expect(names.slice().sort()).toEqual(
        [
          verbCopy[expected[0].id].accessibleName(row.subjectLabel),
          copy.menuLabel(row.subjectLabel),
          copy.openLabel(row.subjectLabel),
        ].sort(),
      );

      // And the verbs themselves are still exactly two controls.
      expect(document.querySelectorAll(".notification-primary-action")).toHaveLength(1);
      expect(document.querySelectorAll(".notification-menu-trigger")).toHaveLength(1);

      // And the rest are behind that one trigger.
      await userEvent.click(screen.getByRole("button", { name: copy.menuLabel(row.subjectLabel) }));
      const menu = screen.getByRole("menu");
      for (const verb of expected.slice(1)) {
        expect(
          within(menu).getByRole("button", { name: verbCopy[verb.id].accessibleName(row.subjectLabel) }),
          `${locale}/${verb.id} is missing from the menu`,
        ).toBeTruthy();
      }
    });
  }

  it("names the subject in every control, so twenty rows are distinguishable", () => {
    const { row } = renderRow({ subjectLabel: "Pagar o aluguel" });
    for (const name of controlNames()) {
      expect(name, `a control does not name its row: ${name}`).toContain("Pagar o aluguel");
    }
    expect(row.subjectLabel).toBe("Pagar o aluguel");
  });
});

describe("2S-ATTENTION-006: opening a notice from home marks it seen", () => {
  it("writes through the SAME authority the *Lida* verb uses, then navigates", async () => {
    const { row, spies } = renderRow();
    const copy = getNotificationActionCopy("pt-BR");

    await userEvent.click(screen.getByRole("button", { name: copy.openLabel(row.subjectLabel) }));

    /*
     * The write, and what it sent. `2S-TRUST-010`: the destination is
     * `markNotification`, out of the same bundle the verbs dispatch through, and
     * the value is the one *Lida* sends. Opening chooses WHEN, never WHAT.
     */
    expect(spies.markAction).toHaveBeenCalledTimes(1);
    const sent = spies.markAction.mock.calls[0][0] as FormData;
    expect(sent.get("status")).toBe("read");
    expect(sent.get("notificationId")).toBe(row.notification.id);

    // And only then the navigation.
    expect(pushed).toEqual([row.notification.action_url]);
  });

  it("navigates a notice that was already seen WITHOUT writing", async () => {
    /*
     * `R-24` again: a control whose only possible outcome is a no-op should not
     * perform it. The control that makes this mean something is the test above,
     * which proves the write happens when the notice IS unread.
     */
    const { row, spies } = renderRow({ source: { status: "read" } });
    const copy = getNotificationActionCopy("pt-BR");

    await userEvent.click(screen.getByRole("button", { name: copy.openLabel(row.subjectLabel) }));

    expect(spies.markAction).not.toHaveBeenCalled();
    expect(pushed).toEqual([row.notification.action_url]);
  });

  it("renders no open control for a notice with nowhere to go", () => {
    /*
     * `notifications.action_url` is nullable. A control that navigated to
     * nothing would be a false affordance, so the row offers none -- and the
     * verbs are untouched, because having no destination says nothing about
     * what the owner may do to the notice.
     */
    const { row } = renderRow({ source: { action_url: null } });
    const copy = getNotificationActionCopy("pt-BR");
    expect(screen.queryByRole("button", { name: copy.openLabel(row.subjectLabel) })).toBeNull();
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
  });

  it("names the row in the open control, like every other control on it", () => {
    const { row } = renderRow({ subjectLabel: "Pagar o aluguel" });
    for (const name of controlNames()) {
      expect(name, `a control does not name its row: ${name}`).toContain("Pagar o aluguel");
    }
    expect(row.notification.action_url).not.toBeNull();
  });
});

describe("2S-ACT-005 / 2S-REACH-004: a subject that cannot be resolved offers no task verb", () => {
  /*
   * The three ways a subject fails to resolve converge on one behaviour, and
   * each is planted rather than assumed absent.
   */
  it("offers only message and cadence verbs when the subject did not resolve", async () => {
    const { row } = renderRow({ subjectStatus: null });
    expect(row.verbs.every((verb) => verb.scope !== "task")).toBe(true);

    const copy = getNotificationActionCopy("pt-BR");
    const verbCopy = getVerbCopy("pt-BR");
    await userEvent.click(screen.getByRole("button", { name: copy.menuLabel(row.subjectLabel) }));

    // The control that can fail: the task verbs must be absent from the WHOLE
    // row, menu included, not merely absent from the primary slot.
    for (const taskVerb of ["complete_task", "reschedule_task"] as const) {
      expect(
        screen.queryByRole("button", { name: verbCopy[taskVerb].accessibleName(row.subjectLabel) }),
        `${taskVerb} is offered against an unresolvable subject`,
      ).toBeNull();
    }
  });

  it("offers no `concluir` for a subject whose status already refuses it", () => {
    /*
     * `2S-ACT-005` by name: *a completed subject offers no concluir*. Eligibility
     * is `isEligibleStatus`'s answer, so this is the authority refusing, not the
     * surface hiding.
     */
    const { row } = renderRow({ subjectStatus: "completed" });
    const verbCopy = getVerbCopy("pt-BR");
    expect(
      screen.queryByRole("button", { name: verbCopy.complete_task.accessibleName(row.subjectLabel) }),
    ).toBeNull();
  });

  it("does not reveal a foreign subject's title", () => {
    /*
     * The projection resolves nothing for a subject this owner does not own, so
     * the label falls back to the notice's own body — which the heartbeat wrote
     * for this owner. Asserted here because the row is where a leak would be
     * visible.
     */
    const { row } = renderRow({ subjectStatus: null });
    expect(row.subjectLabel).toBe(row.notification.body);
  });
});

describe("R-24: an answered notice is offered nothing it cannot change", () => {
  it("offers no `marcar como lido` on a notice already read", async () => {
    const { row } = renderRow({ source: { status: "read" } });
    const verbCopy = getVerbCopy("pt-BR");
    const copy = getNotificationActionCopy("pt-BR");

    expect(row.verbs.some((verb) => verb.id === "mark_read")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: copy.menuLabel(row.subjectLabel) }));
    expect(
      screen.queryByRole("button", { name: verbCopy.mark_read.accessibleName(row.subjectLabel) }),
    ).toBeNull();
  });

  it("still offers it on an unread one — the control that makes the above mean something", () => {
    const { row } = renderRow();
    expect(row.verbs.some((verb) => verb.id === "mark_read")).toBe(true);
  });
});

describe("2S-ACT-010: only the irreversible verb asks first", () => {
  it("asks before dismissing, names what is lost, and cancelling writes nothing", async () => {
    const { row, spies } = renderRow();
    const copy = getNotificationActionCopy("pt-BR");
    const verbCopy = getVerbCopy("pt-BR");

    await userEvent.click(screen.getByRole("button", { name: copy.menuLabel(row.subjectLabel) }));
    await userEvent.click(screen.getByRole("button", { name: verbCopy.dismiss.accessibleName(row.subjectLabel) }));

    expect(screen.getByText(copy.confirmQuestion.dismiss as string)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: copy.cancelAction }));
    expect(spies.markAction).not.toHaveBeenCalled();
  });

  it("does not ask before marking read — the control against a blanket dialog", async () => {
    const { row, spies } = renderRow();
    const verbCopy = getVerbCopy("pt-BR");
    const copy = getNotificationActionCopy("pt-BR");

    await userEvent.click(screen.getByRole("button", { name: copy.menuLabel(row.subjectLabel) }));
    await userEvent.click(screen.getByRole("button", { name: verbCopy.mark_read.accessibleName(row.subjectLabel) }));

    expect(screen.queryByText(copy.confirmQuestion.dismiss as string)).toBeNull();
    expect(spies.markAction).toHaveBeenCalledTimes(1);
    expect(spies.markAction.mock.calls[0][0].get("status")).toBe("read");
  });
});

describe("2S-ACCESS-007: one announceable node, and it is the visible one", () => {
  /*
   * RETARGETED IN 2S.3, and the distinction is the whole contract.
   *
   * The row now holds TWO interactive units: the verbs, and *Abrir*. Each
   * announces its own outcome, so the row has two polite regions — and that is
   * correct rather than a regression. What 2S.2 forbade was never "two
   * regions"; it was **one sentence living in two announceable nodes**, which
   * is what an `sr-only` twin beside a visible paragraph produced.
   *
   * So the property is stated as what it always was, now that there is more
   * than one region to state it over: every region is empty at rest, every
   * region is the visible text rather than a hidden copy of it, and after any
   * one action exactly one region has anything to say.
   */
  it("mounts every live region before there is any result to announce", () => {
    renderRow();
    const regions = screen.getAllByRole("status");
    // Two units, two regions, and the count is asserted so a THIRD one — an
    // `sr-only` twin, say — fails here.
    expect(regions).toHaveLength(2);
    for (const region of regions) {
      expect(region.getAttribute("aria-live")).toBe("polite");
      expect(region.textContent).toBe("");
      expect(region.className, "a region that is announced must also be read")
        .not.toContain("sr-only");
    }
  });

  it("keeps the outcome visible, and puts it in exactly ONE region", async () => {
    const { row } = renderRow();
    const copy = getNotificationActionCopy("pt-BR");
    const verbCopy = getVerbCopy("pt-BR");

    await userEvent.click(screen.getByRole("button", { name: copy.menuLabel(row.subjectLabel) }));
    await userEvent.click(screen.getByRole("button", { name: verbCopy.mark_read.accessibleName(row.subjectLabel) }));

    const regions = await screen.findAllByRole("status");
    const speaking = regions.filter((region) => region.textContent !== "");
    expect(speaking, "the outcome was announced by more than one node").toHaveLength(1);
    expect(speaking[0].textContent).toBe(copy.applied.mark_read);
    // And it appears once in the whole row, not twice.
    expect(screen.getAllByText(copy.applied.mark_read)).toHaveLength(1);
  });
});

describe("the row carries its own chrome, in the owner's zone", () => {
  it("says what kind of row it is, and shows the notice's own words", () => {
    const { row } = renderRow();
    const copy = getNotificationActionCopy("pt-BR");
    expect(screen.getByText(copy.attentionEyebrow)).toBeTruthy();
    expect(screen.getByText(row.notification.title)).toBeTruthy();
    expect(screen.getByText(row.notification.body)).toBeTruthy();
  });

  it("formats the instant in the owner's zone, not the host's", () => {
    /*
     * `LDC-DAILY-001`. `2026-08-24T12:00:00Z` is the 24th at 09:00 in São Paulo
     * and the 24th at 12:00 in UTC, so a row that fell back to the host would
     * print a different time — the defect this repository has already fixed on
     * four other surfaces.
     */
    renderRow();
    expect(screen.getByText(/09:00/)).toBeTruthy();
  });
});
