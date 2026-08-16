import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppError from "./error";
import { getExperienceCopy } from "@/features/experience/copy";

afterEach(cleanup);

describe("AppError", () => {
  it("shows a safe retry action without exposing provider details", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("sensitive database detail")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
    expect(screen.queryByText(/sensitive database detail/i)).not.toBeInTheDocument();
    /*
     * `2O-RECOVER-001`. The label used to be this page's own "Tentar
     * novamente"; it is now the vocabulary's shared retry label, which is the
     * point of routing the boundary through `UniversalStateView` — one retry
     * label in the product rather than one per surface.
     *
     * Read from the copy module rather than restated, so this test cannot be
     * the thing that pins a label the vocabulary has moved on from.
     */
    const retry = getExperienceCopy("pt-BR").states.error_recoverable.action!;
    fireEvent.click(screen.getByRole("button", { name: retry }));
    expect(reset).toHaveBeenCalledOnce();
  });

  it("renders the boundary as the page's heading, not as a paragraph", () => {
    // The regression this slice nearly shipped: the shared component renders
    // its title as a `<p>` by default, and a full-page state with no heading
    // leaves a screen-reader user nothing to navigate to.
    render(<AppError error={new Error("x")} reset={vi.fn()} />);
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  });

  it("states the error is recoverable rather than terminal", () => {
    render(<AppError error={new Error("x")} reset={vi.fn()} />);
    const state = document.querySelector("[data-ux-state]");
    // The fixture marker `2O-RECOVER-007` asks for: this assertion is about
    // WHICH state rendered, and it would pass vacuously against a page that
    // rendered nothing if it only checked that `error_terminal` was absent.
    expect(state).not.toBeNull();
    expect(state?.getAttribute("data-ux-state")).toBe("error_recoverable");
  });
});
