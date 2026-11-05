import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BirthdayProposals } from "./birthday-proposal";
import { getBirthdayCopy } from "./copy";

afterEach(cleanup);

const copy = getBirthdayCopy("pt-BR");
const ana = { personId: "p-ana", name: "Ana", day: 5, month: 5, year: null };

describe("BirthdayProposals — ADR-158", () => {
  it("asks in words, and links to the person for a different date", () => {
    const action = vi.fn();
    render(<BirthdayProposals action={action} locale="pt-BR" proposals={[ana]} />);
    expect(screen.getByText("Guardar o aniversário de Ana: 5 de maio?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.adjust("Ana") })).toHaveAttribute("href", "/pt-BR/app/people/p-ana");
    expect(action).not.toHaveBeenCalled();
  });

  it("sends exactly the stated date when accepted, and then stops asking", async () => {
    const action = vi.fn(async () => ({ status: "success" as const, message: copy.saved }));
    render(<BirthdayProposals action={action} locale="pt-BR" proposals={[{ ...ana, year: 1990 }]} />);
    fireEvent.click(screen.getByRole("button", { name: copy.accept }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(copy.saved));
    const formData = (action.mock.calls[0] as unknown as [unknown, FormData])[1];
    expect(Object.fromEntries(formData)).toEqual({ personId: "p-ana", locale: "pt-BR", intent: "set", day: "5", month: "5", year: "1990" });
    expect(screen.queryByRole("button", { name: copy.accept })).toBeNull();
  });

  it("keeps the offer when saving fails, and says why", async () => {
    const action = vi.fn(async () => ({ status: "error" as const, message: copy.failed }));
    render(<BirthdayProposals action={action} locale="pt-BR" proposals={[ana]} />);
    fireEvent.click(screen.getByRole("button", { name: copy.accept }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(copy.failed));
    expect(screen.getByRole("button", { name: copy.accept })).toBeInTheDocument();
  });

  it("renders nothing with nothing to offer, and speaks English", () => {
    const { container } = render(<BirthdayProposals action={vi.fn()} locale="en" proposals={[]} />);
    expect(container).toBeEmptyDOMElement();
    render(<BirthdayProposals action={vi.fn()} locale="en" proposals={[{ ...ana, month: 12, day: 1 }]} />);
    expect(screen.getByText("Keep Ana's birthday: December 1?")).toBeInTheDocument();
  });
});
