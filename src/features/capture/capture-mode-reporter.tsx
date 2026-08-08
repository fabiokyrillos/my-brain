"use client";

/**
 * `2J-METRICS-003` — the thin client wrapper that reports the chosen modality.
 *
 * `UnifiedCapture` stays free of analytics: it takes an `onModeChange` callback
 * and knows nothing about product events, which is what lets its own tests
 * assert the callback shape without mocking a telemetry module. This wrapper is
 * the one place the two meet, and it exists as a separate file because the
 * capture page is a Server Component and the emitter is client-only.
 *
 * It reports a **closed enum member** and nothing else. There is no parameter
 * here through which a draft, a filename or a transcript could travel.
 */

import { useRef, type ReactNode } from "react";

import { recordCaptureModeSelected } from "@/features/product-analytics/interaction-events";
import type { Locale } from "@/lib/preferences";

import { UnifiedCapture, type CaptureMode } from "./unified-capture";

export function CaptureModeReporter({
  locale,
  textAction,
  attachmentAction,
  voice,
}: {
  locale: Locale;
  textAction: ReactNode;
  attachmentAction: ReactNode;
  voice?: ReactNode;
}) {
  // One attempt id per mount, so switching between modalities during a single
  // visit is attributable to that visit rather than to the account.
  const attemptIdRef = useRef<string | null>(null);
  if (attemptIdRef.current === null) attemptIdRef.current = crypto.randomUUID();

  return (
    <UnifiedCapture
      locale={locale}
      textAction={textAction}
      attachmentAction={attachmentAction}
      voice={voice}
      onModeChange={(mode: CaptureMode) =>
        recordCaptureModeSelected({
          attemptId: attemptIdRef.current!,
          captureMode: mode,
          locale,
        })
      }
    />
  );
}
