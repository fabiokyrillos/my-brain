/**
 * The authenticated layout refuses before it renders anything.
 *
 * `loading.tsx` wraps this segment's children in Suspense, so a gate that ran
 * only in the page would be reached after the shell had already been flushed
 * and its `redirect()` would arrive as a client-side navigation rather than a
 * 307 (the whole story is in
 * `src/lib/closeout/server-side-gate-guard.test.ts`). These cases assert the
 * ordering that makes the refusal server-side: the gate is awaited first, and
 * when it refuses, neither the identity read nor the shell happens at all.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const requireUser = vi.fn();
const loadAccountIdentity = vi.fn();

vi.mock("@/lib/auth/require-user", () => ({ requireUser: (locale: string) => requireUser(locale) }));
vi.mock("@/features/shell/account-identity", () => ({
  loadAccountIdentity: (locale: string) => loadAccountIdentity(locale),
}));
vi.mock("@/features/shell/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div>,
}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import AuthenticatedLayout from "./layout";

describe("the authenticated layout gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ supabase: {}, user: { id: "owner" } });
    loadAccountIdentity.mockResolvedValue({ displayName: "Fábio" });
  });

  it("awaits the gate before reading identity or rendering the shell", async () => {
    const order: string[] = [];
    requireUser.mockImplementation(async () => {
      order.push("gate");
      return { supabase: {}, user: { id: "owner" } };
    });
    loadAccountIdentity.mockImplementation(async () => {
      order.push("identity");
      return { displayName: "Fábio" };
    });

    await AuthenticatedLayout({ children: null, params: Promise.resolve({ locale: "pt-BR" }) });

    expect(order).toEqual(["gate", "identity"]);
    expect(requireUser).toHaveBeenCalledWith("pt-BR");
  });

  it("renders nothing when the gate refuses", async () => {
    // `redirect()` throws, which is how a Server Component refusal reaches
    // Next. The point of the case is what does NOT happen behind it.
    requireUser.mockRejectedValue(new Error("NEXT_REDIRECT:/pt-BR/consent"));

    await expect(
      AuthenticatedLayout({ children: null, params: Promise.resolve({ locale: "pt-BR" }) }),
    ).rejects.toThrow("NEXT_REDIRECT:/pt-BR/consent");
    expect(loadAccountIdentity).not.toHaveBeenCalled();
  });

  it("rejects an unknown locale before authenticating", async () => {
    await expect(
      AuthenticatedLayout({ children: null, params: Promise.resolve({ locale: "de" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(requireUser).not.toHaveBeenCalled();
  });
});
