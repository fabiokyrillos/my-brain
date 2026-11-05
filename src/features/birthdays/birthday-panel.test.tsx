import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BirthdayPanel } from "./birthday-panel";
import { getBirthdayCopy } from "./copy";

afterEach(cleanup);

const copy = getBirthdayCopy("pt-BR");
const action = vi.fn(async () => ({ status: "success" as const, message: copy.saved }));

describe("BirthdayPanel", () => {
  it("says the date in words, with the year when there is one", () => {
    render(<BirthdayPanel action={action} birthday={{ day: 5, month: 5, year: 1990 }} locale="pt-BR" personId="p1" />);
    expect(screen.getByText("5 de maio de 1990")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.clear })).toBeInTheDocument();
    expect(screen.getByText(copy.change)).toBeInTheDocument();
  });

  it("offers to add one when there is none, and no remove", () => {
    render(<BirthdayPanel action={action} birthday={null} locale="pt-BR" personId="p1" />);
    expect(screen.getByText(copy.none)).toBeInTheDocument();
    expect(screen.getByText(copy.set)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.clear })).toBeNull();
  });

  it("names the months in the owner's language", () => {
    render(<BirthdayPanel action={action} birthday={{ day: 1, month: 12, year: null }} locale="en" personId="p1" />);
    expect(screen.getByText("December 1")).toBeInTheDocument();
  });
});
