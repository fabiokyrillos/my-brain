import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { TaskSensitivity } from "@/features/sensitivity/task-derivation";
import { ProtectedContent } from "./protected-content";
import { getWorkCopy } from "./copy";

afterEach(cleanup);

/**
 * `2L-PRIVACY-003`, `-004`, `-007`, `-008` — the one component every Work
 * surface withholds content through.
 *
 * The convergence requirement is structural: the list, the detail and every
 * surface after them mount *this*, so "the list and the detail agree" is not a
 * property anybody has to maintain. What is asserted here is therefore the
 * behaviour of the single component — masked in place, revealed locally, and
 * never persisted.
 */

const masked: TaskSensitivity = { kind: "derived", level: "highly_sensitive" };
const ordinary: TaskSensitivity = { kind: "derived", level: "normal" };
const undetermined: TaskSensitivity = { kind: "undetermined" };

function renderProtected(sensitivity: TaskSensitivity, locale: "pt-BR" | "en" = "en") {
  return render(
    <ProtectedContent locale={locale} revealKey="task-1" sensitivity={sensitivity}>
      <span>Revisar o contrato</span>
    </ProtectedContent>,
  );
}

describe("ProtectedContent", () => {
  it("renders an ordinary task's content untouched", () => {
    renderProtected(ordinary);
    expect(screen.getByText("Revisar o contrato")).toBeVisible();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders a manual task's content untouched", () => {
    // `2L-PRIVACY-004`: no source, no derivable classification, and no mask —
    // and, just as importantly, no invented `normal`.
    renderProtected(undetermined);
    expect(screen.getByText("Revisar o contrato")).toBeVisible();
  });

  it("shows a highly sensitive task's content in the clear, with no reveal control", () => {
    // Life Brain E.8 (ADR-178): nothing the owner said is withheld from them.
    renderProtected(masked);
    expect(screen.getByText("Revisar o contrato")).toBeVisible();
    expect(screen.queryByText(getWorkCopy("en").protected.label)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows two highly sensitive items side by side, in both locales", () => {
    // ADR-178: no per-item reveal exists to share or not share.
    for (const locale of ["pt-BR", "en"] as const) {
      cleanup();
      render(
        <>
          <ProtectedContent locale={locale} revealKey="task-1" sensitivity={masked} describedAs="First">
            <span>First secret</span>
          </ProtectedContent>
          <ProtectedContent locale={locale} revealKey="task-2" sensitivity={masked} describedAs="Second">
            <span>Second secret</span>
          </ProtectedContent>
        </>,
      );
      expect(screen.getByText("First secret")).toBeVisible();
      expect(screen.getByText("Second secret")).toBeVisible();
      expect(screen.queryByRole("button")).toBeNull();
    }
  });

  it("renders a highly sensitive row's own content rather than a protected stub link", () => {
    // ADR-178: the stub link is never drawn; the caller's children are the way in.
    render(
      <ProtectedContent
        href="/en/app/work/task-1"
        locale="en"
        revealKey="task-1"
        sensitivity={masked}
      >
        <span>Revisar o contrato</span>
      </ProtectedContent>,
    );
    expect(screen.getByText("Revisar o contrato")).toBeVisible();
    expect(screen.queryByRole("link", { name: getWorkCopy("en").protected.label })).toBeNull();
  });

  it("persists nothing — the reveal is local and transient (OD-2J-1)", () => {
    // Asserted on the source rather than on behaviour, in the shape
    // `sensitivity-convergence.test.ts` established: a component that wrote the
    // reveal anywhere would still pass every behavioural test above.
    const code = readFileSync(join(__dirname, "protected-content.tsx"), "utf8");
    expect(code).not.toMatch(/localStorage|sessionStorage|document\.cookie|agent_preferences/);
  });
});
