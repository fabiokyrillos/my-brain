import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  deriveActivationProgress,
  type ActivationFactKey,
  type ActivationReading,
} from "@/features/activation/contracts";
import { byokSettingsHref } from "@/features/byok/routes";
import { deriveOnboardingPath, onboardingSteps, type OnboardingExtraKey } from "./contracts";
import { getOnboardingCopy } from "./copy";
import { OnboardingPanel } from "./onboarding-panel";
import { OnboardingRestore } from "./onboarding-restore";
import type { Locale } from "@/lib/preferences";

const SATISFIED: ActivationReading = { ok: true, satisfied: true };
const UNSATISFIED: ActivationReading = { ok: true, satisfied: false };
const UNREADABLE: ActivationReading = { ok: false };
const LOCALES: Locale[] = ["pt-BR", "en"];

const noop = vi.fn(async () => {});

function pathOf(input: {
  facts?: Partial<Record<ActivationFactKey, ActivationReading>>;
  extras?: Partial<Record<OnboardingExtraKey, ActivationReading>>;
  dismissed?: boolean;
} = {}) {
  return deriveOnboardingPath({
    progress: deriveActivationProgress({
      locale_and_timezone: UNSATISFIED,
      ai_credential: UNSATISFIED,
      entry_captured: UNSATISFIED,
      interpretation_reviewed: UNSATISFIED,
      task_confirmed: UNSATISFIED,
      ...input.facts,
    } as Record<ActivationFactKey, ActivationReading>),
    extras: {
      assistant_identity: UNSATISFIED,
      memory_created: UNSATISFIED,
      ...input.extras,
    } as Record<OnboardingExtraKey, ActivationReading>,
    dismissed: input.dismissed ?? false,
  });
}

function renderPanel(locale: Locale, path = pathOf()) {
  return render(<OnboardingPanel locale={locale} path={path} dismissAction={noop} />);
}

describe("2O-ONBOARD-001 / -002: the path renders the declared steps, in both locales", () => {
  it.each(LOCALES)("renders one row per step, in declared order (%s)", (locale) => {
    renderPanel(locale);
    const copy = getOnboardingCopy(locale);
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(onboardingSteps.length);
    expect(rows.map((row) => within(row).getByRole("heading").textContent)).toEqual(
      onboardingSteps.map((step) => copy.steps[step.key].title),
    );
  });

  it.each(LOCALES)("names the panel and says how far along the account is (%s)", (locale) => {
    renderPanel(locale, pathOf({ facts: { entry_captured: SATISFIED } }));
    const copy = getOnboardingCopy(locale);
    expect(screen.getByRole("region", { name: copy.title })).toBeTruthy();
    expect(screen.getByText(copy.progress(1, onboardingSteps.length))).toBeTruthy();
  });

  it("is non-vacuous: the two locales really do differ", () => {
    // Every `it.each` above would pass over one copy record used twice.
    expect(getOnboardingCopy("pt-BR").title).not.toBe(getOnboardingCopy("en").title);
  });
});

describe("2O-ONBOARD-003: the path never asks again for something already set", () => {
  it.each(LOCALES)("offers no action on a satisfied step (%s)", (locale) => {
    renderPanel(locale, pathOf({ facts: { locale_and_timezone: SATISFIED } }));
    const copy = getOnboardingCopy(locale);
    const row = document.querySelector('[data-step="locale_and_timezone"]') as HTMLElement;
    expect(row.getAttribute("data-state")).toBe("satisfied");
    expect(within(row).queryByRole("link")).toBeNull();
    expect(within(row).getByText(copy.states.satisfied)).toBeTruthy();
  });

  it("still offers an action on an unsatisfied step, so the absence above means something", () => {
    renderPanel("pt-BR");
    const row = document.querySelector('[data-step="locale_and_timezone"]') as HTMLElement;
    expect(row.getAttribute("data-state")).toBe("unsatisfied");
    expect(within(row).getByRole("link")).toBeTruthy();
  });

  it("marks exactly one step as the one being offered now", () => {
    renderPanel("pt-BR", pathOf({ facts: { locale_and_timezone: SATISFIED } }));
    const current = document.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("data-step")).toBe("assistant_identity");
  });
});

describe("2O-ONBOARD-011: no capability is claimed that the account does not have", () => {
  it.each(LOCALES)("renders the credential recovery when the credential is known absent (%s)", (locale) => {
    renderPanel(locale, pathOf({ facts: { ai_credential: UNSATISFIED } }));
    const copy = getOnboardingCopy(locale);
    const recovery = document.querySelector('[data-recovery="credential"]') as HTMLElement;
    expect(recovery).toBeTruthy();
    expect(within(recovery).getByText(copy.recovery.title)).toBeTruthy();
    expect(within(recovery).getByRole("link").getAttribute("href")).toBe(byokSettingsHref(locale));
  });

  it("renders no recovery once the credential is present, so its presence means something", () => {
    renderPanel("pt-BR", pathOf({ facts: { ai_credential: SATISFIED } }));
    expect(document.querySelector('[data-recovery="credential"]')).toBeNull();
  });

  it("renders no recovery off a credential it could not read", () => {
    renderPanel("pt-BR", pathOf({ facts: { ai_credential: UNREADABLE } }));
    expect(document.querySelector('[data-recovery="credential"]')).toBeNull();
  });

  it.each(LOCALES)("shows a blocked step, and offers it no action (%s)", (locale) => {
    renderPanel(locale, pathOf({ facts: { ai_credential: UNSATISFIED } }));
    const copy = getOnboardingCopy(locale);
    const row = document.querySelector('[data-step="interpretation_reviewed"]') as HTMLElement;
    expect(row.getAttribute("data-state")).toBe("blocked");
    expect(within(row).getByText(copy.states.blocked)).toBeTruthy();
    expect(within(row).queryByRole("link")).toBeNull();
  });
});

describe("2O-ACTIVATION-003 reaches the surface: a read that failed says so", () => {
  it.each(LOCALES)("carries a notice when any step is unreadable (%s)", (locale) => {
    renderPanel(locale, pathOf({ facts: { entry_captured: UNREADABLE } }));
    expect(screen.getByText(getOnboardingCopy(locale).unreadableNotice)).toBeTruthy();
  });

  it("carries no notice when everything was readable", () => {
    renderPanel("pt-BR");
    expect(document.querySelector('[data-notice="unreadable"]')).toBeNull();
  });

  it("still offers the action on an unreadable step, rather than turning a failed read into a claim", () => {
    renderPanel("pt-BR", pathOf({ facts: { entry_captured: UNREADABLE } }));
    const row = document.querySelector('[data-step="entry_captured"]') as HTMLElement;
    expect(row.getAttribute("data-state")).toBe("unreadable");
    expect(within(row).getByRole("link")).toBeTruthy();
  });
});

describe("2O-ONBOARD-006 / -007: the path states what happens, before it happens", () => {
  it.each(LOCALES)("says the words are stored before any model runs, and that capture returns immediately (%s)", (locale) => {
    const body = getOnboardingCopy(locale).steps.entry_captured.body;
    const stored = locale === "pt-BR" ? /guardadas antes de qualquer modelo/i : /stored before any model runs/i;
    const immediate = locale === "pt-BR" ? /na hora|depois, em segundo plano/i : /straight back|in the background/i;
    expect(body).toMatch(stored);
    expect(body).toMatch(immediate);
  });

  it.each(LOCALES)("says nothing is created without the owner's act (%s)", (locale) => {
    const body = getOnboardingCopy(locale).steps.interpretation_reviewed.body;
    const claim = locale === "pt-BR" ? /nada é criado sem esse seu ato/i : /nothing is created without that act of yours/i;
    expect(body).toMatch(claim);
  });
});

describe("2O-ONBOARD-010: the path can be dismissed, and the dismissal can be undone", () => {
  it.each(LOCALES)("offers a dismissal, and says where it comes back from (%s)", (locale) => {
    renderPanel(locale);
    const copy = getOnboardingCopy(locale);
    expect(screen.getByRole("button", { name: copy.dismiss.action })).toBeTruthy();
    expect(screen.getByText(copy.dismiss.hint)).toBeTruthy();
  });

  it("renders nothing at all once dismissed", () => {
    const { container } = renderPanel("pt-BR", pathOf({ dismissed: true }));
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing once every step is satisfied, with nobody having dismissed it", () => {
    const { container } = renderPanel(
      "pt-BR",
      pathOf({
        facts: {
          locale_and_timezone: SATISFIED,
          ai_credential: SATISFIED,
          entry_captured: SATISFIED,
          interpretation_reviewed: SATISFIED,
          task_confirmed: SATISFIED,
        },
        extras: { assistant_identity: SATISFIED, memory_created: SATISFIED },
      }),
    );
    expect(container.innerHTML).toBe("");
  });

  it.each(LOCALES)("offers the reversal only where there is something to reverse (%s)", (locale) => {
    const copy = getOnboardingCopy(locale);
    const hidden = render(
      <OnboardingRestore locale={locale} dismissed={false} restoreAction={noop} />,
    );
    expect(hidden.container.innerHTML).toBe("");
    hidden.unmount();

    render(<OnboardingRestore locale={locale} dismissed restoreAction={noop} />);
    expect(screen.getByRole("button", { name: copy.restore.action })).toBeTruthy();
    expect(screen.getByText(copy.restore.body)).toBeTruthy();
  });

  it("carries the locale into both forms, so the action never has to guess it", () => {
    const { container } = renderPanel("en");
    const hidden = container.querySelector('form input[name="locale"]') as HTMLInputElement;
    expect(hidden.value).toBe("en");
  });
});
