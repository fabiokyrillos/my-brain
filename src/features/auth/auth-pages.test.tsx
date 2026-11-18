import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The five signed-out pages, recomposed (Editorial calmo, ADR-180).
 *
 * Two things are held here. The first is the composition: one sentence, what
 * the page asks, one action, its ways out — and nothing of the card, eyebrow
 * and second sentence each page used to open with. The second matters more:
 * **what each form sends did not change.** Every field is listed below with the
 * attributes it had before the recomposition, so a redesign that renames a
 * field, drops an `autocomplete` or loosens a `maxlength` fails here rather than
 * in production.
 */

let pathname = "/pt-BR/auth/login";
vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams("next=%2Fpt-BR%2Fapp%2Finbox"),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock("next/script", () => ({ default: () => null }));
const action = vi.hoisted(() => async () => undefined);
vi.mock("@/features/auth/actions", () => ({
  signIn: action,
  signUp: action,
  recoverPassword: action,
  resendConfirmation: action,
  updatePassword: action,
}));

import AuthLayout from "@/app/[locale]/auth/layout";
import LoginPage from "@/app/[locale]/auth/login/page";
import RecoverPage from "@/app/[locale]/auth/recover/page";
import RegisterPage from "@/app/[locale]/auth/register/page";
import ResendPage from "@/app/[locale]/auth/resend/page";
import ResetPage from "@/app/[locale]/auth/reset/page";
import { getAuthPagesCopy, getResendCopy } from "@/features/auth/copy";
import { authErrorMessage } from "@/features/auth/flow";

type Query = Record<string, string>;
type PageFn = (props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Query>;
}) => Promise<React.ReactElement>;

const PAGES = {
  login: LoginPage as unknown as PageFn,
  register: RegisterPage as unknown as PageFn,
  recover: RecoverPage as unknown as PageFn,
  resend: ResendPage as unknown as PageFn,
  reset: ResetPage as unknown as PageFn,
} as const;
type Route = keyof typeof PAGES;
const ROUTES = Object.keys(PAGES) as Route[];
const LOCALES = ["pt-BR", "en"] as const;

async function show(route: Route, query: Query = {}, locale: (typeof LOCALES)[number] = "pt-BR") {
  pathname = `/${locale}/auth/${route}`;
  const params = Promise.resolve({ locale });
  const children = await PAGES[route]({ params, searchParams: Promise.resolve(query) });
  return render(await AuthLayout({ children, params }));
}

afterEach(() => {
  delete process.env.SIGNUP_ENABLED;
});

/** name → the attributes the field carried before the recomposition. */
const FIELDS: Record<Route, Record<string, Record<string, string>>> = {
  login: {
    email: { type: "email", autocomplete: "email", required: "", maxlength: "254" },
    password: { type: "password", autocomplete: "current-password", required: "", maxlength: "128" },
  },
  register: {
    displayName: { autocomplete: "name", required: "", minlength: "2", maxlength: "100" },
    email: { type: "email", autocomplete: "email", required: "", maxlength: "254" },
    password: { type: "password", autocomplete: "new-password", required: "", minlength: "12", maxlength: "128" },
    passwordConfirmation: { type: "password", autocomplete: "new-password", required: "", minlength: "12", maxlength: "128" },
    acceptedPolicies: { type: "checkbox", required: "", value: "on" },
  },
  recover: { email: { type: "email", autocomplete: "email", required: "", maxlength: "254" } },
  resend: { email: { type: "email", autocomplete: "email", required: "", maxlength: "254" } },
  reset: {
    password: { type: "password", autocomplete: "new-password", required: "", minlength: "12", maxlength: "128" },
    passwordConfirmation: { type: "password", autocomplete: "new-password", required: "", minlength: "12", maxlength: "128" },
  },
};

describe("what each form sends is what it sent before", () => {
  it.each(ROUTES)("%s carries exactly its fields, with their attributes", async (route) => {
    const { container } = await show(route);
    const form = container.querySelector("form.auth-form");
    expect(form).not.toBeNull();

    const visible = [...form!.querySelectorAll<HTMLInputElement>("input:not([type=hidden])")];
    expect(visible.map((input) => input.name)).toEqual(Object.keys(FIELDS[route]));
    for (const input of visible) {
      for (const [attribute, value] of Object.entries(FIELDS[route][input.name])) {
        expect(input.getAttribute(attribute), `${route} ${input.name} ${attribute}`).toBe(value);
      }
      expect(input.hasAttribute("inputmode"), `${route} ${input.name} gained an inputmode`).toBe(false);
    }

    const hidden = [...form!.querySelectorAll<HTMLInputElement>("input[type=hidden]")];
    expect(hidden.map((input) => [input.name, input.value])).toEqual([["locale", "pt-BR"]]);
    expect(form!.querySelectorAll("button")).toHaveLength(1);
    expect(form!.querySelector("button")!.getAttribute("type")).toBe("submit");
  });

  it("sign-in still carries a usable return path and refuses an unusable one", async () => {
    const carried = await show("login", { next: "/pt-BR/app/inbox" });
    expect(carried.container.querySelector<HTMLInputElement>('input[name="next"]')?.value).toBe("/pt-BR/app/inbox");
    carried.unmount();

    const refused = await show("login", { next: "//evil.example" });
    expect(refused.container.querySelector('input[name="next"]')).toBeNull();
  });

  it("the consent box is unticked, and the password's name is still exactly its label", async () => {
    process.env.SIGNUP_ENABLED = "true";
    await show("register");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    // The hint is beside the label, not inside it: `getByLabelText(exact)` is
    // how the journeys find this field.
    expect(screen.getByLabelText("Senha", { exact: true }).getAttribute("name")).toBe("password");
    expect(screen.getByLabelText("Confirme a senha").getAttribute("name")).toBe("passwordConfirmation");
  });
});

describe("each page is one sentence, what it asks, one action and its ways out", () => {
  it.each(ROUTES)("%s has one heading and none of the card it used to be", async (route) => {
    const { container } = await show(route);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector(".auth-card")).toBeNull();
    expect(container.querySelector(".eyebrow")).toBeNull();
    expect(container.querySelector(".auth-column")).not.toBeNull();

    // In reading order: the sentence, the form, then the ways out.
    const column = container.querySelector(".auth-column")!;
    const order = [...column.children].map((child) => child.tagName);
    expect(order[0]).toBe("H1");
    expect(order.indexOf("FORM")).toBeGreaterThan(0);
    expect(order[order.length - 1]).toBe("NAV");
    expect(order.indexOf("NAV")).toBeGreaterThan(order.indexOf("FORM"));
  });

  it.each(LOCALES)("says each page's sentence in %s", async (locale) => {
    const copy = getAuthPagesCopy(locale);
    const titles: Record<Route, string> = {
      login: copy.login.title,
      register: copy.register.closedTitle,
      recover: copy.recover.title,
      resend: getResendCopy(locale).title,
      reset: copy.reset.title,
    };
    for (const route of ROUTES) {
      const { unmount } = await show(route, {}, locale);
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(titles[route]);
      unmount();
    }
  });

  it("keeps the frame the same on every page: the mark, and the other language", async () => {
    for (const route of ROUTES) {
      const { container, unmount } = await show(route);
      const header = container.querySelector(".auth-shell > header.auth-top")!;
      const brand = within(header as HTMLElement).getByRole("link", { name: "My Brain" });
      expect(brand.getAttribute("href")).toBe("/");
      expect(brand.textContent).toBe("BMy Brain");
      // The same page in the other language, query included.
      const language = within(header as HTMLElement).getByRole("link", { name: "Mudar para English" });
      expect(language.getAttribute("href")).toBe(`/en/auth/${route}?next=%2Fpt-BR%2Fapp%2Finbox`);
      expect(language.querySelector('[lang="en"]')?.textContent).toBe("English");
      expect(container.querySelector(".auth-shell")!.getAttribute("lang")).toBe("pt-BR");
      expect(container.querySelector(".auth-shell > main")).not.toBeNull();
      unmount();
    }
  });

  it("keeps every way out each page had", async () => {
    const expected: Record<Route, string[]> = {
      login: ["/pt-BR/auth/recover", "/pt-BR/auth/register", "/pt-BR/auth/resend"],
      register: ["/pt-BR/auth/login", "/pt-BR"],
      recover: ["/pt-BR/auth/login"],
      resend: ["/pt-BR/auth/login"],
      reset: ["/pt-BR/auth/recover"],
    };
    for (const route of ROUTES) {
      const { container, unmount } = await show(route);
      const links = [...container.querySelectorAll(".auth-links a")].map((link) => link.getAttribute("href"));
      expect(links, route).toEqual(expected[route]);
      unmount();
    }
  });
});

describe("what happened last is a sentence, announced", () => {
  it.each(ROUTES)("%s says a refusal as an alert, before the fields", async (route) => {
    const { container } = await show(route, { error: "throttled" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(authErrorMessage("throttled", "pt-BR"));
    expect(alert.classList.contains("form-alert")).toBe(true);
    const form = container.querySelector("form")!;
    expect(alert.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it.each(ROUTES)("%s shows no alert when nothing was refused", async (route) => {
    await show(route);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an unknown code is still the generic sentence, never the code", async () => {
    await show("login", { error: "<script>" });
    expect(screen.getByRole("alert").textContent).toBe("Não foi possível continuar. Tente novamente.");
  });

  it.each([
    ["check-email", "Confira seu e-mail para confirmar a conta."],
    ["recovery-sent", "Se a conta existir, o link de recuperação chegará em instantes."],
    ["password-updated", "Senha atualizada. Entre novamente."],
    ["signed-out", null],
  ] as const)("sign-in says %s as a status", async (message, sentence) => {
    const { container } = await show("login", { message });
    const status = container.querySelector("p.form-success[role='status']");
    expect(status).not.toBeNull();
    if (sentence) expect(status!.textContent).toBe(sentence);
    expect(status!.textContent!.trim()).not.toBe("");
  });

  it("an unknown message says nothing", async () => {
    const { container } = await show("login", { message: "anything" });
    expect(container.querySelector(".form-success")).toBeNull();
  });
});

describe("the register page and its door", () => {
  it("states the closed door once, as the caption, before any field", async () => {
    const { container } = await show("register");
    const notices = container.querySelectorAll("p.form-alert[role='status']");
    // Exactly one: the entry journey reads this element in strict mode.
    expect(notices).toHaveLength(1);
    const form = container.querySelector("form.auth-form")!;
    expect(notices[0].compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toMatch(/Cadastro fechado/);
  });

  it("a refusal on the closed page does not become a second closed-door statement", async () => {
    const { container } = await show("register", { error: "signup-disabled" });
    expect(container.querySelectorAll("p.form-alert[role='status']")).toHaveLength(1);
    expect(screen.getByRole("alert").textContent).toBe(authErrorMessage("signup-disabled", "pt-BR"));
  });

  it("makes no closed-door statement while the door is open", async () => {
    process.env.SIGNUP_ENABLED = "true";
    const { container } = await show("register");
    expect(container.querySelector("p.form-alert")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Crie seu espaço.");
  });

  it("has one link to sign-in and one back to what the product is", async () => {
    // `foundation.spec.ts` locates each in strict mode, so a second match —
    // the brand, say — would fail the journey.
    const { container } = await show("register");
    expect(container.querySelectorAll('a[href$="/auth/login"]')).toHaveLength(1);
    expect(container.querySelectorAll('a[href="/pt-BR"]')).toHaveLength(1);
  });
});

describe("the password rule is one caption that follows what is typed", () => {
  it.each(["register", "reset"] as const)("%s describes the password field with it", async (route) => {
    const { container } = await show(route);
    const field = container.querySelector<HTMLInputElement>('input[name="password"]')!;
    const hint = container.querySelector(`#${field.getAttribute("aria-describedby")}`)!;
    const copy = getAuthPagesCopy("pt-BR").passwordHint;

    expect(hint.textContent).toBe(copy.rule);
    expect(container.querySelectorAll(".auth-hint")).toHaveLength(1);

    fireEvent.input(field, { target: { value: "semmaiuscula" } });
    expect(hint.textContent).toBe("Ainda falta: uma maiúscula, um número e um símbolo.");
    expect(hint.getAttribute("data-state")).toBe("missing");

    fireEvent.input(field, { target: { value: "Completa-1234abcd" } });
    expect(hint.textContent).toBe(copy.met);
    expect(hint.getAttribute("data-state")).toBe("met");

    fireEvent.input(field, { target: { value: "" } });
    expect(hint.textContent).toBe(copy.rule);
  });

  it("says it in English on the English page", async () => {
    const { container } = await show("reset", {}, "en");
    const field = container.querySelector<HTMLInputElement>('input[name="password"]')!;
    fireEvent.input(field, { target: { value: "short" } });
    expect(container.querySelector(".auth-hint")!.textContent).toBe(
      "Still missing: 12 characters, an uppercase letter, a number, and a symbol.",
    );
  });

  it("is not on a page with no password to choose", async () => {
    for (const route of ["login", "recover", "resend"] as const) {
      const { container, unmount } = await show(route);
      expect(container.querySelector(".auth-hint")).toBeNull();
      unmount();
    }
  });
});
