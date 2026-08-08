/**
 * `2I-TRUST-001` … `2I-TRUST-008` — the shared trust and action vocabulary.
 *
 * ## The rule that shapes every component here
 *
 * **None of them performs a write.** Each takes a handler and calls it; the
 * handler is an existing Server Action or RPC owned by a feature. Phase 2F
 * established one write path with per-action authorization, audit and undo, and
 * a component library is the most attractive place to grow a second one —
 * because a `<ConfirmationCard onConfirm={…}>` that "just" took a table name
 * and an id would be less duplicated code by every local measure.
 *
 * `phase-2i-experience-guard.test.ts` asserts this directory constructs no
 * Supabase client of any kind and imports no server action module. That is
 * `2I-TRUST-008`, and it is structural rather than advisory.
 *
 * ## AI proposes; the user controls
 *
 * `SuggestionCard` always renders confirm **and** dismiss, and
 * `ConfirmationCard` refuses to render a destructive confirmation without an
 * explicit consequence line — a destructive action whose consequence is
 * unstated is the shape this product has spent several phases removing.
 */

import { type ReactNode } from "react";

import { getExperienceCopy } from "./copy";
import { type ExperienceTone, toneClassName } from "./state-vocabulary";
import { ToneIcon } from "./universal-state";

/* ------------------------------------------------------------------ chips */

export type EntityChipKind = "person" | "project" | "organization" | "context";

/**
 * `2I-TRUST-006`. The label comes from the caller, which reads the vocabulary
 * layer — this component never renders a raw database enum, and it has no way
 * to, because it takes a string.
 */
export function EntityChip({
  kind,
  label,
  href,
  onRemove,
  removeLabel,
}: {
  kind: EntityChipKind;
  label: string;
  href?: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  const body = (
    <>
      <span className="ux-chip-kind" aria-hidden="true" data-kind={kind} />
      <span className="ux-chip-label">{label}</span>
    </>
  );

  return (
    <span className="ux-chip" data-chip-kind={kind}>
      {href ? (
        <a className="ux-chip-link" href={href}>
          {body}
        </a>
      ) : (
        body
      )}
      {onRemove ? (
        <button type="button" className="ux-chip-remove" onClick={onRemove} aria-label={removeLabel ?? label}>
          ×
        </button>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------- suggestion */

/**
 * `2I-TRUST-001`. A proposal the user may confirm, edit or dismiss.
 *
 * Dismiss is not optional. A suggestion the user cannot decline is not a
 * suggestion, and `AI proposes; the user controls` is the invariant this
 * component exists to express at the UI layer.
 */
export function SuggestionCard({
  title,
  detail,
  confirmLabel,
  dismissLabel,
  editLabel,
  onConfirm,
  onDismiss,
  onEdit,
  children,
}: {
  title: string;
  detail?: string;
  confirmLabel: string;
  dismissLabel: string;
  editLabel?: string;
  onConfirm: () => void;
  onDismiss: () => void;
  onEdit?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className={`ux-card ux-card-suggestion ${toneClassName("suggestion")}`} data-card="suggestion">
      <header className="ux-card-head">
        <ToneIcon tone="suggestion" className="ux-card-icon" />
        <h3 className="ux-card-title">{title}</h3>
      </header>
      {detail ? <p className="ux-card-detail">{detail}</p> : null}
      {children}
      <div className="ux-card-actions">
        <button type="button" className="ux-action ux-action-primary" onClick={onConfirm}>
          {confirmLabel}
        </button>
        {onEdit && editLabel ? (
          <button type="button" className="ux-action" onClick={onEdit}>
            {editLabel}
          </button>
        ) : null}
        <button type="button" className="ux-action ux-action-quiet" onClick={onDismiss}>
          {dismissLabel}
        </button>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- confirmation */

/**
 * `2I-TRUST-002`. Weight proportional to risk.
 *
 * `consequence` is **required when `destructive`**, enforced by the type rather
 * than by a comment: a destructive confirmation whose consequence is unstated
 * is the exact shape this product removed from task deletion and account
 * deletion, and a shared component that permitted it would reintroduce it
 * everywhere at once.
 */
type ConfirmationProps = {
  title: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  detail?: string;
  children?: ReactNode;
} & (
  | { destructive: true; consequence: string }
  | { destructive?: false; consequence?: string }
);

export function ConfirmationCard(props: ConfirmationProps) {
  const { title, detail, confirmLabel, cancelLabel, onConfirm, onCancel, children } = props;
  const destructive = props.destructive === true;
  const tone: ExperienceTone = destructive ? "risk" : "information";

  return (
    <section
      className={`ux-card ux-card-confirmation ${toneClassName(tone)}`}
      data-card="confirmation"
      data-destructive={destructive ? "true" : "false"}
    >
      <header className="ux-card-head">
        <ToneIcon tone={tone} className="ux-card-icon" />
        <h3 className="ux-card-title">{title}</h3>
      </header>
      {detail ? <p className="ux-card-detail">{detail}</p> : null}
      {destructive ? <p className="ux-card-consequence">{props.consequence}</p> : null}
      {children}
      <div className="ux-card-actions">
        <button
          type="button"
          className={`ux-action ${destructive ? "ux-action-destructive" : "ux-action-primary"}`}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
        <button type="button" className="ux-action ux-action-quiet" onClick={onCancel}>
          {cancelLabel}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ source */

export type SourceKind = "entry" | "task" | "memory" | "person" | "project" | "organization" | "file";

/**
 * `2I-TRUST-003`. Identifies a record and opens it **without losing the
 * origin** — which is why this is a link and not a handler: a real `href`
 * survives a middle-click, a back button and a screen reader's link list.
 */
export function SourceCard({
  kind,
  typeLabel,
  title,
  snippet,
  href,
  meta,
}: {
  kind: SourceKind;
  typeLabel: string;
  title: string;
  snippet?: string;
  href: string;
  meta?: string;
}) {
  return (
    <a className="ux-source" href={href} data-source-kind={kind}>
      {/* The type is text, never colour alone — a result list that encoded type
          by tint would be unreadable to a screen reader and to anyone with a
          colour-vision difference. */}
      <span className="ux-source-type">{typeLabel}</span>
      <span className="ux-source-title">{title}</span>
      {snippet ? <span className="ux-source-snippet">{snippet}</span> : null}
      {meta ? <span className="ux-source-meta">{meta}</span> : null}
    </a>
  );
}

/* -------------------------------------------------------------- processing */

/** `2I-TRUST-004`. Consumes `2I-LANG-005` rather than restating it. */
export function ProcessingBanner({ locale, description }: { locale: string; description?: string }) {
  const text = getExperienceCopy(locale).states.interpreting;
  return (
    <div className={`ux-banner ${toneClassName("information")}`} role="status" aria-live="polite" data-banner="processing">
      <ToneIcon tone="information" />
      <span>
        <strong>{text.title}</strong> {description ?? text.description}{" "}
        <em>{text.safety}</em>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------- undo */

/**
 * `2I-TRUST-005`. A result statement with a real undo where one exists.
 *
 * When `onUndo` is absent the component says the action cannot be undone rather
 * than rendering a disabled control: an undo button that does nothing is worse
 * than none, because the user stops looking for another way back.
 */
export function UndoFeedback({
  message,
  undoLabel,
  noUndoNote,
  onUndo,
}: {
  message: string;
  undoLabel?: string;
  noUndoNote?: string;
  onUndo?: () => void;
}) {
  return (
    <div className={`ux-undo ${toneClassName("success")}`} role="status" aria-live="polite" data-undo={onUndo ? "available" : "none"}>
      <span>{message}</span>
      {onUndo && undoLabel ? (
        <button type="button" className="ux-action ux-action-quiet" onClick={onUndo}>
          {undoLabel}
        </button>
      ) : (
        noUndoNote ? <span className="ux-undo-none">{noUndoNote}</span> : null
      )}
    </div>
  );
}

/* ------------------------------------------------- panel / full-screen pair */

/**
 * `2I-TRUST-007`. One contract, two presentations.
 *
 * Desktop renders a side panel; mobile renders the full-screen equivalent. The
 * difference is CSS, not a second component, because two components is how the
 * two breakpoints drift apart.
 *
 * Focus handling is the caller's: this component declares the dialog semantics
 * and the labelled close, and the surface that opens it restores focus. That
 * split is deliberate — a component that grabbed focus on mount would fight
 * every surface that renders it conditionally.
 */
export function DetailSurface({
  title,
  onClose,
  closeLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <aside
      className="ux-detail"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-detail-surface="true"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="ux-detail-head">
        <h2 className="ux-detail-title">{title}</h2>
        <button type="button" className="ux-detail-close" onClick={onClose} aria-label={closeLabel}>
          ×
        </button>
      </header>
      <div className="ux-detail-body">{children}</div>
    </aside>
  );
}
