import { useSyncExternalStore } from "react";

/**
 * Life Brain D.3 (ADR-167) — the palette's shortcut, in the keyboard's own words.
 *
 * The handler has always accepted ⌘K as well as Ctrl+K; only the hint said
 * `Ctrl+K` to everyone, which on a Mac names a key combination that does
 * something else. The platform is read from the browser after hydration
 * (`useSyncExternalStore` with a server snapshot), so the server renders
 * `Ctrl+K`, the client corrects it, and React reports no mismatch.
 */

type NavigatorLike = {
  readonly userAgentData?: { readonly platform?: string } | null;
  readonly platform?: string;
  readonly userAgent?: string;
};

export function isApplePlatform(source: NavigatorLike): boolean {
  const hinted = source.userAgentData?.platform;
  if (typeof hinted === "string" && hinted !== "") return /mac|ios/i.test(hinted);
  if (typeof source.platform === "string" && /mac|iphone|ipad|ipod/i.test(source.platform)) return true;
  return typeof source.userAgent === "string" && /macintosh|mac os x|iphone|ipad/i.test(source.userAgent);
}

const subscribe = () => () => {};

/** `true` on an Apple platform, after hydration; `false` on the server. */
export function useApplePlatform(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => isApplePlatform(navigator as unknown as NavigatorLike),
    () => false,
  );
}
