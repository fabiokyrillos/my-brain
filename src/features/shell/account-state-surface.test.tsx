import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { locales } from "@/lib/preferences";

import { AccountStateSurface } from "./account-state-surface";
import { getLifecycleCopy, getSuspensionReasonLabel } from "./lifecycle-copy";

/**
 * The non-active account surface, recomposed (Editorial calmo, ADR-180).
 *
 * It left the shadowed card for the column the sign-in pages use. What it says
 * and the one thing it lets a non-active account do — sign out
 * (SH-LIFECYCLE-010) — are what this holds.
 */

vi.mock("@/features/auth/actions", () => ({ signOut: vi.fn() }));

describe("the account-state surface", () => {
  for (const locale of locales) {
    const copy = getLifecycleCopy(locale);

    it(`says the suspension, why, and what happens to reminders, then offers only sign-out (${locale})`, () => {
      const { container } = render(<AccountStateSurface locale={locale} reasonCode={null} state="suspended" />);
      const column = container.querySelector(".auth-column")!;
      expect(container.querySelector(".auth-card")).toBeNull();
      // The frame is the route's: the surface renders no `main` of its own.
      expect(container.querySelector("main")).toBeNull();

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(copy.states.suspended.title);
      expect(column.querySelector(".auth-caption")!.textContent).toBe(copy.states.suspended.body);
      expect([...column.querySelectorAll(".auth-facts > li")].map((row) => row.textContent)).toEqual([
        getSuspensionReasonLabel(locale, null),
        copy.suspendedReminders,
      ]);
      expect(column.textContent).toContain(copy.states.suspended.nextStep);

      expect(container.querySelectorAll("a")).toHaveLength(0);
      const forms = container.querySelectorAll("form");
      expect(forms).toHaveLength(1);
      expect([...forms[0].querySelectorAll("input")].map((input) => [input.type, input.name, input.value]))
        .toEqual([["hidden", "locale", locale]]);
      expect(screen.getAllByRole("button")).toHaveLength(1);
      expect(screen.getByRole("button", { name: copy.signOut }).getAttribute("type")).toBe("submit");
    });

    it.each(["deleting", "unknown"] as const)(`says nothing about why when the account is %s (${locale})`, (state) => {
      const { container } = render(<AccountStateSurface locale={locale} reasonCode="abuse" state={state} />);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(copy.states[state].title);
      expect(container.querySelector(".auth-facts")).toBeNull();
      expect(container.textContent).not.toContain(copy.suspendedReminders);
      expect(container.textContent).toContain(copy.states[state].nextStep);
      expect(screen.getByRole("button", { name: copy.signOut })).toBeInTheDocument();
    });
  }
});
