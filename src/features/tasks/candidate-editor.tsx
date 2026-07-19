"use client";

import type { ActionableCandidateView } from "@/features/daily-cycle/contracts";
import type { CandidateEditCommand } from "./candidate-edit-contract";

export type CandidateEditorProps = {
  candidate: ActionableCandidateView;
  locale: "pt-BR" | "en";
  onEditChange: (edit: CandidateEditCommand | null) => void;
  selected: boolean;
  timezone: string;
};

export function CandidateEditor(_props: CandidateEditorProps) {
  void _props;
  return (
    <div data-phase-2c-placeholder="candidate-editor">
      Phase 2C candidate editor is not implemented
    </div>
  );
}
