import { render, screen, waitFor } from "@testing-library/react";
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
    <CredentialPanel
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

  it("discloses who is billed and that decryption is possible operator-side", () => {
    renderPanel(active);

    expect(screen.getByText(/billed directly to your OpenAI account/)).toBeVisible();
    expect(screen.getByText(/stored encrypted and is never shown again/)).toBeVisible();
    expect(screen.getByText(/authoritative figure is in your own OpenAI dashboard/)).toBeVisible();
  });
});
