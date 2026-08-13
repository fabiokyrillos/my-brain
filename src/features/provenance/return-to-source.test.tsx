/**
 * `2N-PERSON-006`, `2N-PROV-003` — the way back, and the open redirect it must
 * refuse.
 *
 * The rejection cases carry the weight: a `back` value arrives in a URL, so a
 * link drawn from it without checking would let a crafted address turn a
 * product-drawn control into a link off the product, on a page the user reached
 * from their own data.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { parseReturnTarget, ReturnToSource } from "./return-to-source";

afterEach(cleanup);

const PERSON = "/pt-BR/app/people/11111111-1111-4111-8111-111111111111";

describe("2N-PERSON-006: a handle this app wrote is honoured", () => {
  it.each([
    [PERSON],
    [`${PERSON}#task-22222222-2222-4222-8222-222222222222`],
    ["/en/app/people/abc#memory-def"],
    ["/pt-BR/app"],
  ])("accepts %s", (value) => {
    expect(parseReturnTarget(value)).toBe(value);
  });

  it("renders a real link with the target", () => {
    render(<ReturnToSource back={`${PERSON}#memory-1`} locale="pt-BR" />);
    const link = screen.getByRole("link", { name: "Voltar para onde você estava" });
    expect(link).toHaveAttribute("href", `${PERSON}#memory-1`);
  });

  it("takes the first value when the parameter repeats", () => {
    expect(parseReturnTarget([PERSON, "https://evil.example"])).toBe(PERSON);
  });
});

describe("2N-SEC: anything this app would not have written renders nothing", () => {
  it.each([
    ["https://evil.example/pt-BR/app/people/x"],
    ["//evil.example/pt-BR/app"],
    ["/pt-BR/app/people/../../../etc"],
    ["/fr/app/people/x"],
    ["/pt-BR/auth/login"],
    ["/pt-BR/app/people/x?next=https://evil.example"],
    ["javascript:alert(1)"],
    ["\\\\evil.example"],
    ["/pt-BR/app/people/x#frag with space"],
    [""],
    [undefined],
  ])("refuses %p", (value) => {
    expect(parseReturnTarget(value as string | undefined)).toBeNull();
  });

  it("renders nothing at all rather than a broken control", () => {
    /*
     * Refusing is always safe here: the browser's own Back still works, so the
     * failure mode of a rejected handle is an ordinary page. A sanitised link
     * would be a guess about what the user meant.
     */
    const { container } = render(<ReturnToSource back="https://evil.example" locale="pt-BR" />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not accept a protocol-relative host that merely looks like a path", () => {
    // The one an allow-list built on `startsWith("/")` would have let through,
    // and the reason the pattern is anchored on the locale segment instead.
    expect("//evil.example/pt-BR/app".startsWith("/")).toBe(true);
    expect(parseReturnTarget("//evil.example/pt-BR/app")).toBeNull();
  });
});
