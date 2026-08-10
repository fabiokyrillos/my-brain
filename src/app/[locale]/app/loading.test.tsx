import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AuthenticatedLoading from "./loading";

describe("authenticated route loading shell", () => {
  it("announces progress and preserves a stable page skeleton", () => {
    const { container } = render(<AuthenticatedLoading />);

    expect(screen.getByRole("status", { name: "Carregando página" })).toHaveAttribute("aria-live", "polite");
    expect(container.querySelectorAll("[data-loading-block]")).toHaveLength(4);
  });
});
