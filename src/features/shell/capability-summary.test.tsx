import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { capabilityRegistry, getCapabilityRegistryView } from "./capabilities";
import { getCapabilitySummaryCopy } from "./capability-copy";
import { CapabilitySummary } from "./capability-summary";

const VISIBLE_SETTINGS = getCapabilityRegistryView("settings").filter((item) => item.visible);

describe("2O-ACTIVATION-004: the registry has a real consumer", () => {
  it("renders one item per visible settings capability, in declared order", () => {
    render(<CapabilitySummary locale="pt-BR" />);
    const copy = getCapabilitySummaryCopy("pt-BR");
    const items = within(screen.getByRole("list", { name: copy.listLabel })).getAllByRole("listitem");

    expect(items).toHaveLength(VISIBLE_SETTINGS.length);
    expect(items.map((item) => item.querySelector("strong")?.textContent)).toEqual(
      VISIBLE_SETTINGS.map((capability) => copy.entries[capability.key as keyof typeof copy.entries].name),
    );
  });

  it("is non-vacuous: the registry really does have visible settings rows", () => {
    // Every assertion in this file would pass over an empty list.
    expect(VISIBLE_SETTINGS.length).toBeGreaterThan(0);
  });

  it("says what each capability changes, not which column it writes", () => {
    render(<CapabilitySummary locale="pt-BR" />);
    const copy = getCapabilitySummaryCopy("pt-BR");
    for (const capability of VISIBLE_SETTINGS) {
      const entry = copy.entries[capability.key as keyof typeof copy.entries];
      expect(screen.getByText(entry.effect)).toBeTruthy();
      // `2O-PREF-010` in embryo: the copy is in the user's words. A column name
      // on the page would be the field list that requirement refuses.
      for (const column of capability.columns) {
        expect(entry.effect, `${capability.key} names a column`).not.toContain(column);
      }
    }
  });
});

describe("2O-ACTIVATION-007: the consumer-less columns are absent from the interface", () => {
  it.each(["pt-BR", "en"] as const)("renders no invisible capability in %s", (locale) => {
    const { container } = render(<CapabilitySummary locale={locale} />);
    const rendered = container.textContent ?? "";

    const hidden = capabilityRegistry.filter((item) => item.surface === "settings" && !item.visible);
    expect(hidden.length, "the fixture has no hidden rows to prove anything about").toBeGreaterThan(0);

    for (const capability of hidden) {
      expect(rendered, `${capability.key} is rendered`).not.toContain(capability.key);
      for (const column of capability.columns) {
        expect(rendered, `${column} reached the interface`).not.toContain(column);
      }
    }
  });

  it("proves the corpus rendered, so the absence above is not an empty page", () => {
    // `R-2O-16`. An absence assertion passes on a page that never rendered; the
    // planted marker is a thing that must be present for the absences to mean
    // anything.
    render(<CapabilitySummary locale="en" />);
    expect(screen.getByRole("heading", { name: getCapabilitySummaryCopy("en").title })).toBeTruthy();
    expect(screen.getByText(getCapabilitySummaryCopy("en").entries.timezone.effect)).toBeTruthy();
  });
});

describe("the summary speaks both locales", () => {
  it.each(["pt-BR", "en"] as const)("renders %s copy, and not the other locale's", (locale) => {
    render(<CapabilitySummary locale={locale} />);
    const other = locale === "pt-BR" ? "en" : "pt-BR";
    expect(screen.getByRole("heading", { name: getCapabilitySummaryCopy(locale).title })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: getCapabilitySummaryCopy(other).title })).toBeNull();
  });
});
