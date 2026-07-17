import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AppError from "./error";

afterEach(cleanup);

describe("AppError", () => {
  it("shows a safe retry action without exposing provider details", () => {
    const reset = vi.fn();
    render(<AppError error={new Error("sensitive database detail")} reset={reset} />);

    expect(screen.getByRole("heading", { name: "Não foi possível carregar" })).toBeVisible();
    expect(screen.queryByText(/sensitive database detail/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
