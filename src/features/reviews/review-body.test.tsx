/**
 * `2J-PRIVACY-001`, the review-summary clause, as behaviour.
 *
 * The unusual thing about this surface is that it masks **unconditionally**,
 * and the tests say why rather than just checking that it does: `summaries` has
 * no sensitivity column, so there is no per-row level to key on, and a review
 * generated over a period can contain anything the period contained.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReviewBody } from "./review-body";

afterEach(cleanup);

const SUMMARY = "Você fechou o contrato da Aurora e adiou a consulta médica.";

describe("2J-PRIVACY-001: a review summary is hidden until asked for", () => {
  it("hides the summary by default", () => {
    render(<ReviewBody reviewId="r1" content={SUMMARY} locale="pt-BR" />);
    expect(screen.queryByText(SUMMARY)).toBeNull();
    expect(screen.getByText("Resumo oculto por padrão.")).toBeInTheDocument();
  });

  it("reveals it on an explicit action, and hides it again", () => {
    render(<ReviewBody reviewId="r1" content={SUMMARY} locale="pt-BR" />);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumo" }));
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ocultar resumo" }));
    expect(screen.queryByText(SUMMARY)).toBeNull();
  });

  it("announces its own state, so the control is not a mystery toggle", () => {
    render(<ReviewBody reviewId="r1" content={SUMMARY} locale="pt-BR" />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
  });

  it("reveals one review without revealing its neighbours", () => {
    // The reveal is keyed by review id. A shared boolean would open every
    // summary on the page from one tap.
    render(
      <>
        <ReviewBody reviewId="r1" content="resumo um" locale="pt-BR" />
        <ReviewBody reviewId="r2" content="resumo dois" locale="pt-BR" />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar resumo" })[0]!);
    expect(screen.getByText("resumo um")).toBeInTheDocument();
    expect(screen.queryByText("resumo dois")).toBeNull();
  });

  it("does not leak the summary into the masked placeholder", () => {
    // A placeholder that included a preview would defeat the whole control.
    const { container } = render(<ReviewBody reviewId="r1" content={SUMMARY} locale="pt-BR" />);
    expect(container.textContent).not.toContain("Aurora");
    expect(container.querySelector('[data-masked="true"]')).not.toBeNull();
  });

  it("works in English without leaking Portuguese", () => {
    render(<ReviewBody reviewId="r1" content={SUMMARY} locale="en" />);
    expect(screen.getByText("Summary hidden by default.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show summary" })).toBeInTheDocument();
  });
});
