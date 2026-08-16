"use client";

import { useLinkStatus } from "next/link";
import { UniversalStateLine } from "@/features/experience/universal-state";
import type { Locale } from "@/lib/preferences";

export function NavigationPendingIndicator({ locale }: { locale: Locale }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  /*
   * `2O-RECOVER-001`. A pending navigation is the `loading` state, and `loading`
   * is the one state where that is the honest word: nothing has been written,
   * so there is nothing to reassure the reader about. `interpreting` would be
   * the lie in the other direction.
   */
  return (
    <UniversalStateLine
      className="navigation-pending"
      description={locale === "pt-BR" ? "Abrindo…" : "Opening…"}
      locale={locale}
      state="loading"
    />
  );
}
