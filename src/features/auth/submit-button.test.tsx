/**
 * `AUTH-SIGNIN-PENDING-STATE` — the sign-in button has to acknowledge the tap.
 *
 * Reported by the owner on 2026-10-27, in their words: after clicking *Entrar*
 * "só eu sei que cliquei". Nothing on screen changed, so on a phone and a slow
 * network the natural next move is to tap again.
 *
 * This is filed as correctness rather than comfort because two sessions three
 * seconds apart had already been recorded on that same sign-in, and three in
 * nine seconds the day before, with no explanation. A silent button is the
 * first credible account of that, and `disabled` while in flight is what makes
 * the second tap impossible rather than merely discouraged.
 *
 * The view is asserted directly and the hook is not mocked. `useFormStatus`
 * only reports inside a submitting `<form>`, so a test that drove it would be
 * testing React's scheduler; the split here is the one `entryDestination`
 * already uses in this repository — a pure decision, asserted on its own, and
 * a thin adapter that reads the environment.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthSubmitButtonView } from "./submit-button";

const labels = { label: "Entrar", pendingLabel: "Entrando…" } as const;

describe("AUTH-SIGNIN-PENDING-STATE: the sign-in button acknowledges the tap", () => {
  it("names the action and accepts a click while idle", () => {
    render(<AuthSubmitButtonView pending={false} {...labels} />);
    expect(screen.getByRole("button", { name: "Entrar" })).toBeEnabled();
  });

  it("says what is happening once the request is in flight", () => {
    render(<AuthSubmitButtonView pending {...labels} />);
    expect(screen.getByRole("button", { name: "Entrando…" })).toBeInTheDocument();
  });

  it("refuses a second submit while the first is in flight", () => {
    render(<AuthSubmitButtonView pending {...labels} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("keeps the live region mounted while idle, so its announcement is heard", () => {
    // A live region created in the same render as its text is not announced:
    // the region has to exist, empty, before the text arrives in it.
    render(<AuthSubmitButtonView pending={false} {...labels} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("announces the pending state politely rather than interrupting", () => {
    render(<AuthSubmitButtonView pending {...labels} />);
    const region = screen.getByRole("status");
    expect(region).toHaveTextContent("Entrando…");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("carries no locale of its own, so both locales read from one component", () => {
    render(<AuthSubmitButtonView pending label="Sign in" pendingLabel="Signing in…" />);
    expect(screen.getByRole("button", { name: "Signing in…" })).toBeDisabled();
  });
});
