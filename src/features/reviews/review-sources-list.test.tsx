/**
 * Phase 2Q slice 2Q.2 — **the rendered sources area.**
 *
 * `2Q-LINK-006`, `-008`, `-009`, and the shape `2Q-TRUST-006` / `-009` will
 * assert as equalities in slice 2Q.3.
 *
 * The load-bearing assertions here are the two negatives: **no content of a
 * cited record reaches the screen**, and **no control exists in a row beyond the
 * link itself**. Everything else follows from those.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { getReviewDetailCopy } from "./copy";
import type { ReviewSourceRow } from "./review-sources";
import { ReviewSourcesList } from "./review-sources-list";

vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

const OWNER_TIME_ZONE = "America/Sao_Paulo";
const ENTRY = "22222222-2222-4222-8222-222222222222";
const TASK = "33333333-3333-4333-8333-333333333333";
const OTHER = "55555555-5555-4555-8555-555555555555";

const row = (over: Partial<ReviewSourceRow> = {}): ReviewSourceRow => ({
  key: `task:${TASK}`,
  type: "task",
  available: true,
  href: `/pt-BR/app/work/${TASK}`,
  occurredAt: "2026-08-20T10:00:00Z",
  ...over,
});

function draw(rows: readonly ReviewSourceRow[], locale: "pt-BR" | "en" = "pt-BR") {
  return render(
    <ReviewSourcesList
      copy={getReviewDetailCopy(locale)}
      locale={locale}
      rows={rows}
      timezone={OWNER_TIME_ZONE}
    />,
  );
}

describe("2Q-LINK-009: a cited task appears AS A TASK, and links to the task", () => {
  it("asserts the kind label and the href as a PAIR", () => {
    const { container } = draw([
      row({ key: `entry:${ENTRY}`, type: "entry", href: `/pt-BR/app/inbox/${ENTRY}` }),
      row(),
    ]);
    const items = [...container.querySelectorAll("li.review-cited-row")];
    expect(items).toHaveLength(2);

    const pairs = items.map((item) => [
      item.querySelector(".review-cited-kind")?.textContent,
      item.querySelector("a")?.getAttribute("href"),
    ]);
    expect(pairs).toEqual([
      ["Registro", `/pt-BR/app/inbox/${ENTRY}`],
      ["Tarefa", `/pt-BR/app/work/${TASK}`],
    ]);
  });

  it("is not vacuous: a memory-labelled task is caught by that same pair", () => {
    /*
     * **The planted control.** This is the shape the phase began from — a task
     * uuid carried as a memory — and the assertion above must be able to see it.
     * Rendered here deliberately, so the check is proved capable of failing
     * rather than merely observed passing.
     */
    const { container } = draw([
      row({ type: "memory", href: `/pt-BR/app/memories/${TASK}` }),
    ]);
    const kind = container.querySelector(".review-cited-kind")?.textContent;
    const href = container.querySelector("a")?.getAttribute("href");
    expect([kind, href]).not.toEqual(["Tarefa", `/pt-BR/app/work/${TASK}`]);
    expect(kind).toBe("Memória");
  });

  it("labels each kind in both locales, without ever naming the record", () => {
    for (const [locale, expected] of [
      ["pt-BR", ["Registro", "Tarefa", "Memória"]],
      ["en", ["Record", "Task", "Memory"]],
    ] as const) {
      const { container, unmount } = draw(
        [
          row({ key: "e", type: "entry", href: `/${locale}/app/inbox/${ENTRY}` }),
          row({ key: "t", type: "task", href: `/${locale}/app/work/${TASK}` }),
          row({ key: "m", type: "memory", href: `/${locale}/app/memories/${OTHER}` }),
        ],
        locale,
      );
      expect([...container.querySelectorAll(".review-cited-kind")].map((n) => n.textContent))
        .toEqual([...expected]);
      unmount();
    }
  });
});

describe("2Q-LINK-008: no content of a cited record reaches this area", () => {
  it("renders only the kind, the date and the link — nothing else", () => {
    const { container } = draw([row()]);
    const item = container.querySelector("li.review-cited-row") as HTMLElement;
    // Every text-bearing child, enumerated. A fourth would be a place content
    // could live, and it fails here rather than being noticed on a screenshot.
    expect([...item.children].map((child) => child.className)).toEqual([
      "review-cited-kind",
      "review-cited-when",
      "review-cited-link",
    ]);
  });

  it("has no prop through which a title could be passed", () => {
    /*
     * The shape IS the control. `ReviewSourceRow` carries no `title`,
     * `snippet`, `excerpt`, `preview` or `sensitivity`, so this component
     * receives nothing it could print. Asserted on a real value rather than on
     * the type, so a widened type is caught even where TypeScript is satisfied.
     */
    expect(Object.keys(row()).sort())
      .toEqual(["available", "href", "key", "occurredAt", "type"]);
  });

  it("shows a distinctive record's text NOWHERE, even when one is smuggled onto the row", () => {
    const MARKER = "CONTRATO-CONFIDENCIAL-ACME";
    const smuggled = { ...row(), title: MARKER, snippet: MARKER } as ReviewSourceRow;
    const { container } = draw([smuggled]);
    expect(container.textContent).not.toContain(MARKER);
    // Two-sided: the marker really is on the object the renderer was handed, so
    // the assertion above is capable of failing.
    expect(JSON.stringify(smuggled)).toContain(MARKER);
  });
});

describe("2Q-TRUST-009: no reveal control exists anywhere in a row", () => {
  it("offers the link and no other interactive element", () => {
    const { container } = draw([row(), row({ key: "b", available: false, href: null, occurredAt: null })]);
    // Every focusable/interactive element in the whole area.
    const interactive = container.querySelectorAll("button, input, select, textarea, details, summary, [role='button'], [tabindex]");
    expect(interactive).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("is not vacuous: a planted reveal button IS seen by that same scan", () => {
    // The control that makes the assertion above capable of failing. Without
    // it, a scan that had stopped working would report zero forever.
    const { container } = render(
      <div>
        <button type="button">Mostrar mesmo assim</button>
      </div>,
    );
    expect(container.querySelectorAll("button, input, select, textarea, details, summary, [role='button'], [tabindex]"))
      .toHaveLength(1);
  });
});

describe("2Q-LINK-006: a removed record degrades to words, never to a broken link", () => {
  it("renders the unavailable row with no anchor at all", () => {
    const { container } = draw([row({ available: false, href: null, occurredAt: null })]);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(screen.getByText("Não está mais disponível")).toBeTruthy();
  });

  it("keeps the surviving citations linked when one is gone", () => {
    // A missing record must not delete the review's other evidence.
    const { container } = draw([
      row({ key: "gone", available: false, href: null, occurredAt: null }),
      row({ key: `entry:${ENTRY}`, type: "entry", href: `/pt-BR/app/inbox/${ENTRY}` }),
    ]);
    expect(container.querySelectorAll("a")).toHaveLength(1);
    expect(container.querySelector("a")?.getAttribute("href")).toBe(`/pt-BR/app/inbox/${ENTRY}`);
  });

  it("gives an unavailable row the same shape as an available one, minus the anchor", () => {
    /*
     * The shape slice 2Q.3 asserts as a strict equality across removed,
     * unreadable and foreign. Here it is the structural half: same element
     * count, same kind label, same classes — so the area cannot disclose which
     * of the three happened, or whether a foreign id is real.
     */
    const { container: present } = draw([row()]);
    const { container: absent } = draw([row({ available: false, href: null, occurredAt: null })]);
    const shape = (root: HTMLElement) =>
      [...(root.querySelector("li.review-cited-row") as HTMLElement).children].map((c) => c.className);
    expect(shape(present)).toEqual(["review-cited-kind", "review-cited-when", "review-cited-link"]);
    expect(shape(absent)).toEqual(["review-cited-kind", "review-cited-when", "review-cited-gone"]);
    expect(
      present.querySelector(".review-cited-kind")?.textContent,
      "the kind label must not vary with availability",
    ).toBe(absent.querySelector(".review-cited-kind")?.textContent);
  });

  it("shows an em dash rather than fabricating a date it does not have", () => {
    const { container } = draw([row({ occurredAt: null })]);
    expect(container.querySelector(".review-cited-when")?.textContent).toBe("—");
  });
});

describe("the accessible name of a link says what it opens, and nothing about the record", () => {
  it("names the kind and the date, in both locales", () => {
    const { container } = draw([row()]);
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.textContent).toMatch(/^Abrir tarefa de /);
    expect(link.textContent).not.toContain(TASK);

    const { container: en } = draw([row()], "en");
    expect((en.querySelector("a") as HTMLAnchorElement).textContent).toMatch(/^Open task from /);
  });

  it("keeps the row's own list semantics, so a screen reader hears a list", () => {
    // Structure only. NOTHING here is a screen-reader claim — `2P-ACCESS-005`
    // stays WAIVED, NOT PASSED, and no assertion in this phase may be reported
    // as screen-reader evidence.
    const { container } = draw([row(), row({ key: "b" })]);
    const list = container.querySelector("ul.review-cited-list") as HTMLElement;
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
  });
});
