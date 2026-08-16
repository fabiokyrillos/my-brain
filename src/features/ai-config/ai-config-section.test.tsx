import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { locales } from "@/lib/preferences";

import { AiConfigSection } from "./ai-config-section";
import { AI_ROUTE_CONTRACTS } from "./contracts";
import { getAiConfigCopy } from "./copy";

const REPO = resolve(__dirname, "../../..");
const SAVED = {
  chatModel: "gpt-5.6-terra",
  extractionModel: "gpt-5.6-luna",
  reviewModel: "gpt-5.6-terra",
  fileModel: "gpt-5.6-luna",
} as const;

describe("2O-AICONFIG-001: the section states every place AI is used", () => {
  it.each(locales)("names all seven routes in %s", (locale) => {
    render(<AiConfigSection locale={locale} credentialConfigured saved={SAVED} />);
    const copy = getAiConfigCopy(locale);
    for (const route of AI_ROUTE_CONTRACTS) {
      expect(screen.getByText(copy.routes[route.column].name)).toBeTruthy();
    }
  });

  it("renders the five with a real consumer and the two without, distinguishably", () => {
    const { container } = render(
      <AiConfigSection locale="pt-BR" credentialConfigured saved={SAVED} />,
    );
    expect(container.querySelectorAll(".ai-config-route.controlled")).toHaveLength(4);
    expect(container.querySelectorAll(".ai-config-route.uncontrolled")).toHaveLength(1);
    expect(container.querySelectorAll(".ai-config-route.unconsumed")).toHaveLength(2);
  });
});

describe("2O-AICONFIG-003: the model shown is the routing in use", () => {
  it("shows the saved model for a controlled route", () => {
    render(<AiConfigSection locale="en" credentialConfigured saved={{ ...SAVED, chatModel: "gpt-5-mini" }} />);
    expect(screen.getAllByText("GPT-5 mini").length).toBeGreaterThan(0);
  });

  it("shows no model at all for a route nothing calls", () => {
    const { container } = render(
      <AiConfigSection locale="en" credentialConfigured saved={SAVED} />,
    );
    // An empty model cell would read as "unknown"; the absence is the statement,
    // and the disposition sentence beside it says why.
    for (const item of container.querySelectorAll(".ai-config-route.unconsumed")) {
      expect(item.querySelector(".ai-config-route-model")).toBeNull();
    }
  });
});

describe("2O-AICONFIG-004: the embedding route says the true thing and offers nothing", () => {
  it.each(locales)("states real use and no control, with no input, in %s", (locale) => {
    const { container } = render(
      <AiConfigSection locale={locale} credentialConfigured saved={SAVED} />,
    );
    const row = container.querySelector(".ai-config-route.uncontrolled");
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain(getAiConfigCopy(locale).dispositions.uncontrolled);
    // `R-2O-13b`: a record, never a control.
    expect(container.querySelectorAll("input, select, textarea, button")).toHaveLength(0);
  });
});

describe("2O-AICONFIG-008: an account with no credential is told, with one path", () => {
  it.each(locales)("says so and links once, in %s", (locale) => {
    const { container } = render(
      <AiConfigSection locale={locale} credentialConfigured={false} saved={SAVED} />,
    );
    expect(container.textContent).toContain(getAiConfigCopy(locale).credentialAbsent);
    const links = container.querySelectorAll("a");
    expect(links, "one path to fix it, not two").toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe(`/${locale}/app/settings#byok-heading`);
  });

  it("says the other thing when a credential exists, and never both", () => {
    const { container } = render(
      <AiConfigSection locale="pt-BR" credentialConfigured saved={SAVED} />,
    );
    const copy = getAiConfigCopy("pt-BR");
    expect(container.textContent).toContain(copy.credential);
    expect(container.textContent).not.toContain(copy.credentialAbsent);
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("links to an anchor the credential panel really publishes", () => {
    // A dead fragment is a path that looks like one. `#byok-heading` is the id
    // the panel's own `aria-labelledby` points at, so it cannot be renamed
    // without that association breaking too.
    expect(readFileSync(join(REPO, "src/features/byok/credential-panel.tsx"), "utf8"))
      .toContain('id="byok-heading"');
  });
});

describe("2O-AICONFIG-009 and 2O-COST-005: the family renders itself without calling or forecasting", () => {
  /** Every module this slice added or wired, scanned as source. */
  function familySources(): { paths: string[]; text: string } {
    const paths: string[] = [];
    const chunks: string[] = [];
    for (const dir of ["src/features/ai-config", "src/features/quotas"]) {
      for (const name of readdirSync(join(REPO, dir))) {
        if (!/\.(ts|tsx)$/.test(name) || /\.test\.(ts|tsx)$/.test(name)) continue;
        paths.push(`${dir}/${name}`);
        chunks.push(readFileSync(join(REPO, dir, name), "utf8"));
      }
    }
    return { paths, text: chunks.join("\n") };
  }

  const FAMILY = familySources();

  it("is non-vacuous: the corpus is the modules this slice ships", () => {
    // `R-2O-16`. An absence over an empty corpus is not evidence, and a scan
    // that silently found nothing is how this repository has passed a guard for
    // the wrong reason before.
    expect(FAMILY.paths.length).toBeGreaterThan(4);
    expect(FAMILY.paths).toContain("src/features/ai-config/ai-config-section.tsx");
    expect(FAMILY.paths).toContain("src/features/quotas/usage.ts");
    expect(FAMILY.text.length).toBeGreaterThan(5_000);
  });

  it("imports no AI provider and issues no model call", () => {
    for (const forbidden of [
      /from "@\/lib\/ai\/provider"/,
      /getAIProvider/,
      /extractEntry|embedText|answerFromKnowledge/,
      /api\.openai\.com/,
      /\bfetch\s*\(/,
    ]) {
      expect(forbidden.test(FAMILY.text), `${forbidden} reaches the AI config family`).toBe(false);
    }
  });

  it("proves that scan can fail, on a module that really does call a provider", () => {
    // The planted counter-example, taken from the tree rather than invented, so
    // it also proves the patterns above describe what a real call looks like.
    const realCaller = readFileSync(join(REPO, "src/features/chat/actions.ts"), "utf8");
    expect(/getAIProvider/.test(realCaller)).toBe(true);
  });

  it("forecasts no price, and states no rate", () => {
    // `2O-COST-005` / `R-2O-18`. The slice removed a hardcoded `$0.02 / 1M` from
    // the settings form for this reason; nothing in the family may reintroduce
    // one, and prices live in `ai_model_pricing` where they are recorded facts.
    for (const forbidden of [/\$\s?\d/, /\/\s?1M/, /per million/i, /usd_per_million/]) {
      expect(forbidden.test(FAMILY.text), `${forbidden} states a price`).toBe(false);
    }
    /*
     * Commentary stripped before the check — §78's rule, and this test earned it
     * the same way. The form's comment **explains** that `$0.02 / 1M` was
     * removed and why, so a naive scan fails on the very file that documents the
     * fix. Strip the commentary; never delete the comment.
     */
    const form = readFileSync(join(REPO, "src/features/profile/settings-form.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    expect(form).not.toContain("$0.02");
    expect(form, "the rendered chip must carry no rate").not.toMatch(/\/\s?1M/);
    // Non-vacuous: the stripping did not empty the file.
    expect(form.length).toBeGreaterThan(5_000);
    expect(form).toContain("ai-routes-fixed");
  });
});
