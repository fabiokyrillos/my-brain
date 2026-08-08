"use client";

/**
 * `2J-CAPTURE-001` … `2J-CAPTURE-007` — one capture surface, several modalities.
 *
 * ## What this component is
 *
 * A **dispatcher**. It owns the choice of modality and nothing else. Text goes
 * to `captureEntry`; a file goes to `uploadAttachment`; voice, when it lands in
 * slice 2J.4, plugs into the `voice` slot and confirms through the *text*
 * contract, because a confirmed transcript is text.
 *
 * ## What it deliberately is not
 *
 * It is **not a unifying write**. `T-2I-02` is inherited from Phase 2I, and
 * unified capture is the feature most likely to break it: "one surface" reads as
 * an invitation to write one record that later fans out. That record would need
 * its own table, its own idempotency, its own failure semantics and its own
 * retry — a second entry-write path with a friendly name.
 *
 * So both actions arrive as **props**. This file imports neither, touches no
 * Supabase client, declares no `"use server"`, and is asserted on all three
 * counts by `capture-write-path-guard.test.ts` — which was written and proved
 * against a planted second caller *before* this component existed (gate G-2J.3).
 *
 * ## Why the two contracts stay separate behind one surface
 *
 * They are genuinely different. An entry is text the worker interprets against
 * the entry schema; an attachment is a file the `process_attachment` job
 * analyses into its own shape, with `extracted_text` and its own retry. Merging
 * them would mean inventing a third thing that is neither, and then teaching
 * every consumer about it. The user should not have to choose; the code still
 * should.
 */

import { useState, type ReactNode } from "react";
import { FileUp, Mic, PenLine } from "lucide-react";

import type { Locale } from "@/lib/preferences";

export const CAPTURE_MODES = ["text", "attachment", "voice"] as const;
export type CaptureMode = (typeof CAPTURE_MODES)[number];

const copy = {
  "pt-BR": {
    legend: "Como você quer capturar",
    text: "Escrever",
    attachment: "Arquivo",
    voice: "Falar",
    /** `2J-CAPTURE-005`. Stated, because the absence of a rule is invisible. */
    noClassification: "Não precisa classificar nada antes. Escreva e confirme.",
  },
  en: {
    legend: "How do you want to capture",
    text: "Write",
    attachment: "File",
    voice: "Speak",
    noClassification: "Nothing needs classifying first. Write it and confirm.",
  },
} as const;

const ICONS: Record<CaptureMode, ReactNode> = {
  text: <PenLine size={16} aria-hidden="true" />,
  attachment: <FileUp size={16} aria-hidden="true" />,
  voice: <Mic size={16} aria-hidden="true" />,
};

export function UnifiedCapture({
  locale,
  textAction,
  attachmentAction,
  voice,
  onModeChange,
}: {
  locale: Locale;
  /** The rendered `QuickCaptureForm`, already bound to `captureEntry`. */
  textAction: ReactNode;
  /** The rendered `UploadForm`, already bound to `uploadAttachment`. */
  attachmentAction: ReactNode;
  /**
   * The voice composer, when slice 2J.4 has landed.
   *
   * Absent rather than disabled while it does not exist: `2I-PALETTE-007`
   * settled this shape for the palette and the reasoning carries -- an
   * unavailable action is **absent**, never shown-and-refused, because refusing
   * it also announces it.
   */
  voice?: ReactNode;
  /** Content-free. Reports which modality the user chose, nothing about what. */
  onModeChange?: (mode: CaptureMode) => void;
}) {
  const [mode, setMode] = useState<CaptureMode>("text");
  const text = copy[locale];

  const available: CaptureMode[] = voice ? ["text", "attachment", "voice"] : ["text", "attachment"];

  function choose(next: CaptureMode) {
    if (next === mode) return;
    setMode(next);
    onModeChange?.(next);
  }

  return (
    <div className="unified-capture">
      {/*
        A tablist rather than a row of buttons: the panels below are alternative
        views of one task, which is exactly what the pattern is for, and it gives
        arrow-key traversal without inventing a keyboard contract.
      */}
      <div className="capture-modes" role="tablist" aria-label={text.legend}>
        {available.map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            id={`capture-tab-${candidate}`}
            aria-selected={mode === candidate}
            aria-controls={`capture-panel-${candidate}`}
            tabIndex={mode === candidate ? 0 : -1}
            className="capture-mode"
            onClick={() => choose(candidate)}
          >
            {ICONS[candidate]}
            <span>{text[candidate]}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`capture-panel-${mode}`}
        aria-labelledby={`capture-tab-${mode}`}
        className="capture-panel"
      >
        {mode === "text" ? textAction : null}
        {mode === "attachment" ? attachmentAction : null}
        {mode === "voice" ? voice : null}
      </div>

      <p className="capture-no-classification">{text.noClassification}</p>
    </div>
  );
}
