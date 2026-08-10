"use client";

import { useLinkStatus } from "next/link";
import type { Locale } from "@/lib/preferences";

export function NavigationPendingIndicator({ locale }: { locale: Locale }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;

  return <span className="navigation-pending" role="status">{locale === "pt-BR" ? "Abrindo…" : "Opening…"}</span>;
}
