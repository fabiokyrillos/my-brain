/**
 * `2J-PRIVACY-001`, the review-summary clause, as behaviour.
 *
 * The unusual thing about this surface is that it masks **unconditionally**,
 * and the tests say why rather than just checking that it does: `summaries` has
 * no sensitivity column, so there is no per-row level to key on, and a review
 * generated over a period can contain anything the period contained.
 *
 * The component now takes `children` rather than a string, because the words are
 * parsed and rendered by the caller — so these tests hand it rendered content
 * exactly as the review's own page does.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ReviewDisclosure } from "./review-body";

afterEach(cleanup);

const SUMMARY = "Você fechou o contrato da Aurora e adiou a consulta médica.";

function Disclosure({
  id = "r1",
  locale = "pt-BR",
  text = SUMMARY,
}: {
  id?: string;
  locale?: "pt-BR" | "en";
  text?: string;
}) {
  return (
    <ReviewDisclosure locale={locale} reviewId={id}>
      <p>{text}</p>
    </ReviewDisclosure>
  );
}

describe("2J-PRIVACY-001: a review summary is hidden until asked for", () => {
  it("hides the summary by default", () => {
    render(<Disclosure />);
    expect(screen.queryByText(SUMMARY)).toBeNull();
    expect(screen.getByText("Resumo oculto por padrão.")).toBeInTheDocument();
  });

  it("reveals it on an explicit action, and hides it again", () => {
    render(<Disclosure />);

    fireEvent.click(screen.getByRole("button", { name: "Mostrar resumo" }));
    expect(screen.getByText(SUMMARY)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ocultar resumo" }));
    expect(screen.queryByText(SUMMARY)).toBeNull();
  });

  it("announces its own state, so the control is not a mystery toggle", () => {
    render(<Disclosure />);
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
        <Disclosure id="r1" text="resumo um" />
        <Disclosure id="r2" text="resumo dois" />
      </>,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Mostrar resumo" })[0]!);
    expect(screen.getByText("resumo um")).toBeInTheDocument();
    expect(screen.queryByText("resumo dois")).toBeNull();
  });

  it("does not leak the summary into the masked placeholder", () => {
    // A placeholder that included a preview would defeat the whole control.
    const { container } = render(<Disclosure />);
    expect(container.textContent).not.toContain("Aurora");
    expect(container.querySelector('[data-masked="true"]')).not.toBeNull();
  });

  it("withholds structured content too, not only a paragraph of text", () => {
    // The content is now headings and lists rather than one string, and a mask
    // that only hid text nodes would leave the review's outline on screen.
    const { container } = render(
      <ReviewDisclosure locale="pt-BR" reviewId="r1">
        <div>
          <h3>Entregas</h3>
          <ul><li>Contrato da Aurora</li></ul>
        </div>
      </ReviewDisclosure>,
    );
    expect(container.querySelector("h3")).toBeNull();
    expect(container.querySelector("li")).toBeNull();
    expect(container.textContent).not.toContain("Aurora");
  });

  it("works in English without leaking Portuguese", () => {
    render(<Disclosure locale="en" />);
    expect(screen.getByText("Summary hidden by default.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show summary" })).toBeInTheDocument();
  });
});
