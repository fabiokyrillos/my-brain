import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The tab strip's two jobs, which pull in opposite directions.
 *
 * It must answer a tap **immediately**, and it must not become a second source
 * of truth about which period is showing. Those are easy to satisfy one at a
 * time and easy to break together: an optimistic `aria-current` would look
 * instant and tell a screen reader something false, and would show the previous
 * period's content under a heading naming the next one.
 *
 * So `useLinkStatus` is mocked here rather than stubbed away: the pending state
 * is driven directly, and the assertions check what each state does to the
 * markup.
 */

const pending = vi.hoisted(() => ({ value: false }));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...rest}>{children}</a>
  ),
  useLinkStatus: () => ({ pending: pending.value }),
}));

import { ReviewTabs } from "./review-tabs";

afterEach(() => { cleanup(); pending.value = false; });

const HREFS = {
  day: "/pt-BR/app/reviews?period=day",
  week: "/pt-BR/app/reviews?period=week",
  month: "/pt-BR/app/reviews?period=month",
} as const;
const LABELS = { day: "Dia", week: "Semana", month: "Mês" } as const;

function mount(currentTab: "day" | "week" | "month" = "day") {
  return render(
    <ReviewTabs currentTab={currentTab} hrefFor={HREFS} label="Período" labels={LABELS} />,
  );
}

describe("the three periods are links, and the URL is what they carry", () => {
  it("renders one link per period, each addressing its own period", () => {
    mount();
    const nav = screen.getByRole("navigation", { name: "Período" });
    for (const [key, label] of Object.entries(LABELS) as [keyof typeof HREFS, string][]) {
      expect(within(nav).getByRole("link", { name: label }).getAttribute("href")).toBe(HREFS[key]);
    }
  });

  it("marks only the server's current period, whatever the pending state says", () => {
    mount("month");
    const nav = screen.getByRole("navigation", { name: "Período" });
    expect(within(nav).getByRole("link", { name: "Mês" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Dia" }).getAttribute("aria-current")).toBeNull();
    expect(within(nav).getByRole("link", { name: "Semana" }).getAttribute("aria-current")).toBeNull();
  });
});

describe("a tap is answered at once, without lying about which period is showing", () => {
  it("shows nothing pending when nothing is navigating", () => {
    // Non-vacuity for the check below: the indicator must be absent by default,
    // or "it appears while pending" would pass over a control that always shows it.
    const { container } = mount();
    expect(container.querySelectorAll(".review-tab-pending")).toHaveLength(0);
  });

  it("puts the pending indicator inside the link that is navigating", () => {
    pending.value = true;
    const { container } = mount();
    expect(container.querySelectorAll(".review-tab-pending").length).toBeGreaterThan(0);
  });

  it("keeps aria-current on the SERVER's period while another is pending", () => {
    /*
      The whole point. `aria-current` is derived from `searchParams` on the
      server; if the pending state could move it, a screen reader would be told
      the new period is current while the old one's content is still on screen —
      and local state would have become the source of truth.
    */
    pending.value = true;
    mount("day");
    const nav = screen.getByRole("navigation", { name: "Período" });
    expect(within(nav).getByRole("link", { name: "Dia" }).getAttribute("aria-current")).toBe("page");
    expect(within(nav).getByRole("link", { name: "Semana" }).getAttribute("aria-current")).toBeNull();
    expect(within(nav).getByRole("link", { name: "Mês" }).getAttribute("aria-current")).toBeNull();
  });

  it("hides the indicator from assistive technology and leaves the name alone", () => {
    // The accessible name must stay "Semana", not "Semana " with a decoration
    // glued on — the indicator is presentation, and a screen reader announcing it
    // would be the same lie in a different register.
    pending.value = true;
    const { container } = mount();
    expect(container.querySelector(".review-tab-pending")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("link", { name: "Semana" })).toBeInTheDocument();
  });

  it("renders no period's content, so nothing of another period can appear mid-transition", () => {
    // The strip is navigation and only navigation: it holds three labels and
    // nothing read from any projection.
    pending.value = true;
    const { container } = mount("week");
    expect(container.textContent).toBe("DiaSemanaMês");
  });
});
