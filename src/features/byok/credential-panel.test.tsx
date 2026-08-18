import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ByokActionState } from "./actions";
import { CredentialPanel } from "./credential-panel";
import type { CredentialMetadata } from "./credential-view";

/**
 * The panel's contract: metadata only, no reveal, no prefill — and feedback
 * that belongs to the action the user actually took.
 *
 * That last one is not a style point. `useActionState` retains its result
 * forever, so the original `saveState.status !== "idle" ? saveState :
 * removeState` meant that once a save had succeeded, every later **removal**
 * still rendered the save's message. The C11 Settings journey caught the panel
 * saying "Key replaced and validated" directly beside "No key configured".
 */

const absent: CredentialMetadata = {
  configured: false,
  status: "absent",
  provider: null,
  fingerprint: null,
  validatedAt: null,
  lastFailureCode: null,
  observedUpdatedAt: null,
};

/**
 * A key the account **had and deleted**.
 *
 * Distinct from `absent` in the one way that matters to a person: something was
 * here. The row survives removal — which is why `status` can be `removed` at
 * all — so the fingerprint of what was removed is still readable while the
 * credential itself is gone.
 */
const removed: CredentialMetadata = {
  configured: false,
  status: "removed",
  provider: "openai",
  fingerprint: "sk-proj · a3f9c1",
  validatedAt: null,
  lastFailureCode: null,
  observedUpdatedAt: "2026-08-02T12:00:00+00:00",
};

const active: CredentialMetadata = {
  configured: true,
  status: "active",
  provider: "openai",
  fingerprint: "sk-proj · a3f9c1",
  validatedAt: "2026-08-02T12:00:00+00:00",
  lastFailureCode: null,
  observedUpdatedAt: "2026-08-02T12:00:00+00:00",
};

function renderPanel(
  credential: CredentialMetadata,
  {
    saveResult = { status: "success", message: "Key replaced and validated." } as ByokActionState,
    removeResult = { status: "success", message: "Key removed." } as ByokActionState,
  } = {},
) {
  const saveAction = vi.fn(async () => saveResult);
  const removeAction = vi.fn(async () => removeResult);
  const interpretPendingAction = vi.fn(async () => ({ status: "idle" }) as ByokActionState);

  render(
    <CredentialPanel timeZone="America/Sao_Paulo"
      credential={credential}
      interpretPendingAction={interpretPendingAction}
      locale="en"
      pending={{ count: 0, atLeast: false }}
      removeAction={removeAction}
      saveAction={saveAction}
    />,
  );

  return { saveAction, removeAction };
}

describe("CredentialPanel", () => {
  it("shows nothing but metadata for a configured credential", () => {
    renderPanel(active);

    expect(screen.getByText("Configured")).toBeVisible();
    expect(screen.getByText("sk-proj · a3f9c1")).toBeVisible();
    expect(screen.getByLabelText("API key")).toHaveValue("");
    expect(screen.getByLabelText("API key")).toHaveAttribute("type", "password");
  });

  it("offers no way to reveal or recover the key", () => {
    renderPanel(active);

    expect(screen.queryByRole("button", { name: /show|reveal/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("API key")).not.toHaveAttribute("value");
  });

  it("says nothing until the user has done something", () => {
    renderPanel(active);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("reports the removal, not the save that preceded it", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPanel(active);

    await user.type(screen.getByLabelText("API key"), "sk-proj-anything");
    await user.click(screen.getByRole("button", { name: "Replace key" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Key replaced and validated."));

    await user.click(screen.getByRole("button", { name: "Remove key" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Key removed."));
  });

  it("leaves the previous message standing when a removal is cancelled", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel(active);

    await user.type(screen.getByLabelText("API key"), "sk-proj-anything");
    await user.click(screen.getByRole("button", { name: "Replace key" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Key replaced and validated."));

    await user.click(screen.getByRole("button", { name: "Remove key" }));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Key replaced and validated.");
  });

  it("clears the key field once a submission settles", async () => {
    const user = userEvent.setup();
    renderPanel(active);

    await user.type(screen.getByLabelText("API key"), "sk-proj-anything");
    await user.click(screen.getByRole("button", { name: "Replace key" }));

    await waitFor(() => expect(screen.getByLabelText("API key")).toHaveValue(""));
  });

  it("offers no removal when there is nothing to remove", () => {
    renderPanel(absent);

    expect(screen.getByText("No key configured")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove key" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save key" })).toBeVisible();
  });

  /**
   * The polish pass between slices 2O.6 and 2O.7 — presentation only.
   *
   * The panel's three status facts were three inline children of one `<p>` with
   * no rule anywhere in the stylesheets, so "Configurada" ran into the keyed
   * digest beside it and the validation date trailed off with no hierarchy. The
   * assertions below fix the *structure* that made that possible, and each is
   * paired with the security contract it must not weaken.
   */
  describe("the state reads as three separate facts", () => {
    it("puts the badge, the identifier and the validity on three separate lines", () => {
      renderPanel(active);
      const badge = document.querySelector(".byok-badge");
      const identifier = document.querySelector(".byok-identifier");
      const validated = document.querySelector(".byok-validated");
      expect(badge?.textContent).toContain("Configured");
      expect(identifier?.textContent).toContain("sk-proj · a3f9c1");
      expect(validated).not.toBeNull();
      // Three elements, none containing another. The defect was exactly that
      // they were siblings in one paragraph's text flow.
      expect(badge?.contains(identifier!)).toBe(false);
      expect(identifier?.contains(validated!)).toBe(false);
    });

    it("keeps the fingerprint the only `<code>` in the panel", () => {
      // `byok-settings-journey.spec.ts` matches it by element and asserts its
      // shape. A second `<code>` anywhere in this panel breaks that lane, and
      // it would break it in a way that reads as a product defect.
      renderPanel(active);
      const codes = document.querySelectorAll("section.byok-panel code");
      expect(codes).toHaveLength(1);
      expect(codes[0]?.textContent).toBe("sk-proj · a3f9c1");
    });

    it("carries the status on the badge, so each state can be told apart visually", () => {
      renderPanel(active);
      expect(document.querySelector(".byok-badge")?.getAttribute("data-status")).toBe("active");
      cleanup();
      renderPanel(absent);
      expect(document.querySelector(".byok-badge")?.getAttribute("data-status")).toBe("absent");
    });

    /**
     * `2O-ACCESS-003`, applied to a word rather than to a colour.
     *
     * `removed` reused `absent`'s sentence until this slice, so the distinction
     * between "you never entered a key" and "you deleted the key you had"
     * existed **only** in `data-status` — legible to a stylesheet, to a test and
     * to nobody using the product. The owner minted the sentence; this asserts
     * the two states no longer share one.
     */
    it("says a removed key was removed, and not that none was ever configured", () => {
      renderPanel(removed);
      const badge = document.querySelector(".byok-badge");
      expect(badge?.getAttribute("data-status")).toBe("removed");
      expect(badge?.textContent).toContain("Key removed");
      expect(badge?.textContent).not.toContain("No key configured");
    });

    it("gives all four statuses four distinct sentences", () => {
      // The mechanism, asserted rather than the instance: a fifth
      // `CredentialStatus` that reused an existing sentence would pass every
      // test above and fail this one.
      const seen = new Map<string, string>();
      for (const metadata of [active, { ...active, status: "invalid" as const }, removed, absent]) {
        cleanup();
        renderPanel(metadata);
        const badge = document.querySelector(".byok-badge");
        seen.set(metadata.status, badge?.textContent?.trim() ?? "");
      }
      expect(seen.size).toBe(4);
      expect(new Set(seen.values()).size, `two statuses share a sentence: ${[...seen].map(([k, v]) => `${k}=${v}`).join(", ")}`).toBe(4);
    });
  });

  describe("the destructive action stands apart from the primary one", () => {
    it("keeps removal outside the form that saves", () => {
      // Two forms, two actions, and nothing that could submit one by pressing
      // the other. The separation existed already; this asserts it survives the
      // restyling that put a rule between them.
      renderPanel(active);
      const save = document.querySelector("form.byok-form");
      const remove = document.querySelector("form.byok-remove");
      expect(save).not.toBeNull();
      expect(remove).not.toBeNull();
      expect(save!.contains(remove!)).toBe(false);
      expect(document.querySelector(".byok-danger")?.contains(remove!)).toBe(true);
    });

    it("renders no destructive region at all when there is nothing to remove", () => {
      renderPanel(absent);
      expect(document.querySelector(".byok-danger")).toBeNull();
    });
  });

  it("discloses who is billed and that decryption is possible operator-side", () => {
    renderPanel(active);

    expect(screen.getByText(/billed directly to your OpenAI account/)).toBeVisible();
    expect(screen.getByText(/stored encrypted and is never shown again/)).toBeVisible();
    expect(screen.getByText(/authoritative figure is in your own OpenAI dashboard/)).toBeVisible();
  });
});
