import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { CommandPalette } from "./command-palette";
import { isApplePlatform } from "./shortcut-hint";

/**
 * Life Brain D.3 — `Ctrl+K` read `Ctrl+K` on a Mac, where the key is ⌘
 * (B.7 closing report §6; the iPhone half was fixed in B.7 by hiding the hint
 * on a coarse pointer).
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("isApplePlatform", () => {
  it("knows a Mac by the client hints, by platform, or by the user agent", () => {
    expect(isApplePlatform({ userAgentData: { platform: "macOS" } })).toBe(true);
    expect(isApplePlatform({ platform: "MacIntel" })).toBe(true);
    expect(isApplePlatform({ platform: "iPad" })).toBe(true);
    expect(isApplePlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)" })).toBe(true);
  });

  it("is false on Windows, Linux, Android and when nothing is known", () => {
    expect(isApplePlatform({ userAgentData: { platform: "Windows" }, platform: "Win32" })).toBe(false);
    expect(isApplePlatform({ platform: "Linux x86_64" })).toBe(false);
    expect(isApplePlatform({ userAgent: "Mozilla/5.0 (Linux; Android 14)" })).toBe(false);
    expect(isApplePlatform({})).toBe(false);
  });
});

describe("the trigger's hint", () => {
  it("reads ⌘K on a Mac", () => {
    vi.stubGlobal("navigator", { ...navigator, platform: "MacIntel", userAgent: "Macintosh" });
    render(<CommandPalette locale="pt-BR" />);
    expect(screen.getByRole("button", { name: /Buscar e agir/ }).querySelector("kbd")).toHaveTextContent("⌘K");
  });

  it("reads Ctrl+K elsewhere", () => {
    vi.stubGlobal("navigator", { ...navigator, platform: "Win32", userAgent: "Windows NT 10.0" });
    render(<CommandPalette locale="en" />);
    expect(screen.getByRole("button", { name: /Search and act/ }).querySelector("kbd")).toHaveTextContent("Ctrl+K");
  });
});
