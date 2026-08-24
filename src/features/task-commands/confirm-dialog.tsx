"use client";

/**
 * The destructive-confirmation dialog (PRD 2E-A11Y-004, 2E-DESTRUCTIVE-005).
 *
 * **Hand-rolled `role="dialog" aria-modal="true"`, not `<dialog>` +
 * `showModal()`.** That is not a preference. jsdom 29.1.1 — the version this
 * repository runs — implements `HTMLDialogElement` with **no** `showModal`,
 * `show` or `close` method: calling `showModal()` throws `TypeError`. The only
 * accessibility gate CI runs is Vitest with jsdom, so a native dialog would
 * make 2E-A11Y-004 literally unassertable in the one place it is checked, and
 * the requirement would ship on a manual read of the source. Verified by
 * execution, not by reading the version number.
 *
 * The three behaviours `showModal()` would have supplied are therefore
 * implemented here, and each has a test:
 *
 *   * initial focus moves into the dialog (2E-A11Y-002),
 *   * Tab cycles within it and cannot reach the page behind,
 *   * Escape closes it and focus returns to the control that opened it.
 *
 * Inert-ing the background is done with `aria-hidden` on the console body plus
 * the focus cycle above, rather than with the `inert` attribute, which React
 * 19 supports but jsdom does not reflect — the same reason the dialog itself is
 * hand-rolled.
 *
 * ## What the second device checkpoint added (slice 2R.3, corrective round two)
 *
 * *"Com o modal aberto, ainda consigo rolar a página atrás dele."* and *"Tocar
 * fora do modal não fecha o modal."* Both were true of **every** dialog in the
 * product, because both belong here and neither existed: the backdrop was a
 * `<div>` with no handler, and no code in this repository had ever touched the
 * document's scroll.
 *
 * They are fixed together and in this file on purpose. Six consumers mount this
 * component, and a fix written into one of them would have left the other five
 * behaving differently from each other — which is how a shared dialog stops
 * being shared.
 *
 * The third half is the one that makes an outside tap safe rather than merely
 * possible: a dialog holding something the owner typed must **ask** before
 * discarding it. That is `discard`, and it is a required prop precisely so a
 * consumer cannot acquire an editable field later and silently start throwing
 * work away — see its own note below.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useScrollLock } from "@/features/shell/use-scroll-lock";

/**
 * `type="hidden"` is excluded, and that exclusion is load-bearing rather than
 * tidy.
 *
 * Every form inside this dialog carries hidden fields — the locale, the origin
 * and the session envelope — and a hidden input matches `input:not([disabled])`
 * perfectly well. Without the exclusion, "the first focusable element" resolves
 * to a hidden field, `.focus()` on it is a silent no-op, and the dialog opens
 * with focus still on the page behind it. The Tab cycle fails the same way: the
 * wrap-to-first jump lands on nothing and focus never moves. Both were real,
 * and both were caught by the tests in `command-console.test.tsx` rather than
 * by reading this line.
 */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * The default id prefix, which is also the one the first three consumers were
 * written against.
 *
 * The ids used to be literals. That was safe while one dialog existed; slice
 * 2P.6 mounts this component on three more surfaces, and two dialogs rendered at
 * once would have produced duplicate `id`s — which does not throw, it silently
 * gives `aria-labelledby` the wrong element. A prefix with this default keeps
 * every existing consumer's DOM byte-for-byte identical while making a
 * collision impossible for anyone who passes their own.
 */
const DEFAULT_ID_PREFIX = "task-command-dialog";

/**
 * The words a dialog uses to ask before losing what it holds.
 *
 * **It carries no `isDirty`, and that is the design.** Whether anything has
 * changed is derived here, from the dialog's own content, because every consumer
 * that had to answer it would answer it slightly differently and one of them
 * would be wrong. A consumer supplies the sentence; the dialog supplies the
 * fact.
 */
export type DiscardGuard = {
  /** The question, e.g. *Descartar o que você escreveu?* */
  prompt: string;
  /** The affirmative, which closes and loses the draft. */
  confirmLabel: string;
  /** The way back, which changes nothing at all. */
  resumeLabel: string;
};

/**
 * Everything the owner has said inside this dialog, as one comparable string.
 *
 * ## Why the forms rather than the consumer's state
 *
 * *"Alterado deve ser derivado do estado real do formulário comparado ao estado
 * inicial."* Some of what a dialog holds never reaches React state at all — the
 * reminder composer's importance tickbox and linked task live only in the DOM —
 * so a check built from a consumer's own variables would call that dialog clean
 * while holding both, and throw them away without asking.
 *
 * Reading the forms also makes two requirements true by construction rather than
 * by care:
 *
 *   * **a focused field is not a changed one**, because focus changes no value;
 *   * **undoing an edit by hand returns to clean**, because the same contents
 *     serialise to the same string however they got there.
 *
 * Entries are sorted, so a pane that re-renders its inputs in another order has
 * not been edited. A `File` has no stable string form, so its name stands in —
 * enough to notice a different file, which is all this has to do.
 */
function contentsOf(panel: HTMLElement | null): string | null {
  if (panel === null) return null;
  return [...panel.querySelectorAll("form")]
    .flatMap((form) => [...new FormData(form).entries()])
    .map(([field, value]) => `${field}=${typeof value === "string" ? value : value.name}`)
    .sort()
    .join("&");
}

export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  className,
  idPrefix = DEFAULT_ID_PREFIX,
  onClose,
  discard,
  busy = false,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  /**
   * An extra class on the panel, for a consumer whose content is a real form
   * rather than one submit button.
   *
   * `.task-command-dialog form { display: inline }` is correct for the three
   * consumers that put a single-button form in a row, and wrong for a dialog
   * holding a labelled field. The modifier is opt-in so those three keep exactly
   * the layout they have.
   */
  className?: string;
  /** Namespaces the two generated ids. Defaults to the original literals. */
  idPrefix?: string;
  onClose: () => void;
  /**
   * **Required, and nullable — the nullability is the point.**
   *
   * `null` is a consumer saying *there is nothing here the owner could lose*,
   * which is true of the three dialogs whose whole content is hidden inputs and
   * a button. The other three hold a title, a textarea or a whole form.
   *
   * Optional would have been friendlier and wrong: a dialog that gains an
   * editable field later would keep compiling and start discarding work on the
   * first tap outside it, silently. Required makes that a type error at the one
   * moment somebody is looking at the call site. The checkpoint's contract asks
   * for exactly this trade — *"se tornar a prop obrigatória for a forma segura
   * de impedir consumidores silenciosamente errados, atualize todos
   * deliberadamente"* — and all six were updated deliberately.
   */
  discard: DiscardGuard | null;
  /**
   * A write is in flight, so the dialog refuses to close and its cancel refuses
   * to fire — *"durante save pendente, não fechar nem permitir dupla ação"*.
   *
   * Optional, unlike `discard`, because the two failures are not comparable:
   * forgetting this leaves a consumer exactly as it behaves today, while
   * forgetting `discard` destroys something the owner wrote.
   */
  busy?: boolean;
  /**
   * Anything. A consumer that renders **its own** close control inside the
   * dialog marks it `data-dialog-close` rather than wiring a handler — see the
   * panel's click delegation below.
   */
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement | null>(null);
  const prompt = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);
  /** The dialog's contents as it opened — see `contentsOf`. */
  const baseline = useRef<string | null>(null);
  /**
   * Whether the backdrop press that is currently in progress **started** on the
   * backdrop.
   *
   * *"Interação iniciada dentro e terminada fora não deve fechar
   * acidentalmente."* Selecting the text of a field and releasing the pointer
   * past the edge of the panel produces a `click` whose target is the backdrop,
   * and closing on that alone throws away a draft in the middle of editing it.
   */
  const pressedBackdrop = useRef(false);

  const [confirming, setConfirming] = useState(false);
  /**
   * Reset during render rather than from an effect.
   *
   * A dialog closed from outside while its discard prompt was up would
   * otherwise re-open showing that prompt over a form nobody had touched. The
   * effect that would fix it is a `setState` inside `useEffect`, which this
   * repository has recorded three times as the version that flickers and which
   * the linter refuses outright.
   */
  const [openedAs, setOpenedAs] = useState(open);
  if (openedAs !== open) {
    setOpenedAs(open);
    setConfirming(false);
  }

  // The page behind does not move while this is up -- and the hook is called
  // before the early return below, because hooks cannot be conditional.
  useScrollLock(open);

  /** The only region the keyboard may reach: the prompt if it is up, else all. */
  const reachable = useCallback(
    () => (confirming ? prompt.current : panel.current),
    [confirming],
  );

  /**
   * Every way out of this dialog, in one place.
   *
   * The backdrop, Escape and the explicit cancel button all route through here,
   * because the checkpoint's contract says so three times — *"Escape segue a
   * mesma regra do backdrop"*, *"botão explícito Fechar/Cancelar segue a mesma
   * regra quando houver alterações"* — and because three copies of one rule is
   * how two of them end up different.
   */
  const requestClose = useCallback(() => {
    if (busy) return;
    const changed = baseline.current !== null && contentsOf(panel.current) !== baseline.current;
    if (discard !== null && changed) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onClose();
  }, [busy, discard, onClose]);

  useEffect(() => {
    if (!open) return;
    // Remembered before focus moves, so Escape can put it back exactly where
    // the user left it. 2E-A11Y-002: focus is never lost.
    opener.current = document.activeElement;
    /*
      The baseline, taken once per opening.

      An effect is the right place and the only place: it runs after the panel
      and its children are in the DOM, which is when there is a form to read, and
      before the owner can reach the keyboard. Reading a ref here is also what
      keeps this out of render, where `react-hooks/refs` correctly forbids it.
    */
    baseline.current = contentsOf(panel.current);
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    return () => {
      const previous = opener.current;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [open]);

  // Focus follows the question. Without this the prompt is announced to nobody
  // and Tab is still cycling through a form the owner cannot see.
  useEffect(() => {
    if (!confirming) return;
    prompt.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(reachable()?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // The cycle is what keeps focus inside a dialog the browser is not
      // treating as modal, because nothing here called `showModal()`.
      if (event.shiftKey && (active === first || !reachable()?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose, reachable]);

  if (!open) return null;

  return (
    <div
      className="task-command-dialog-backdrop"
      /*
        Two events, not one. `click` alone closes on a drag that began inside a
        field and ended out here; `pointerdown` alone closes before the press has
        resolved, which on a phone fires under a finger that was only scrolling.
        Requiring both to land on the backdrop is what makes the gesture mean
        cancel rather than merely happen.
      */
      onClick={(event) => {
        const started = pressedBackdrop.current;
        pressedBackdrop.current = false;
        if (!started || event.target !== event.currentTarget) return;
        requestClose();
      }}
      onPointerDown={(event) => {
        pressedBackdrop.current = event.target === event.currentTarget;
      }}
    >
      <div
        aria-describedby={`${idPrefix}-description`}
        aria-labelledby={`${idPrefix}-title`}
        aria-modal="true"
        className={className ? `task-command-dialog ${className}` : "task-command-dialog"}
        /*
          A consumer's own close control, routed through the same rule.

          The memory composer's writing pane has a *Cancelar* beside its
          *Revisar*, and it called that component's own `closeDialog` — straight
          past the discard question, on the one dialog most obviously holding
          something to lose. Marking the button `data-dialog-close` is all a
          consumer has to do; there is no handler to forget and no
          `requestClose` to thread through render.
        */
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-dialog-close]") === null) return;
          requestClose();
        }}
        ref={panel}
        role="dialog"
      >
        <h3 id={`${idPrefix}-title`}>{title}</h3>
        <p id={`${idPrefix}-description`}>{description}</p>

        {/*
          Hidden, never unmounted.

          Unmounting the form would throw away exactly what the question is
          asking whether to throw away: every uncontrolled field in it — an
          importance tickbox, a linked task — would come back empty when the
          owner chose *continuar editando*. `display: contents` keeps the
          wrapper out of the layout it sits in, and the paired `[hidden]` rule
          in `task-commands.css` is what lets `hidden` still win.
        */}
        <div className="task-command-dialog-body" hidden={confirming}>
          {children}
          <button
            className="task-command-dialog-cancel"
            disabled={busy}
            onClick={requestClose}
            type="button"
          >
            {cancelLabel}
          </button>
        </div>

        {confirming && discard !== null ? (
          <div className="task-command-dialog-discard" ref={prompt}>
            <p>{discard.prompt}</p>
            <div className="task-command-dialog-actions">
              {/*
                The way back is first, and it is the one focus lands on. The
                destructive answer to a question about destroying something
                should never be the default.
              */}
              <button
                className="task-command-dialog-resume"
                onClick={() => setConfirming(false)}
                type="button"
              >
                {discard.resumeLabel}
              </button>
              <button
                className="task-command-dialog-confirm-discard"
                onClick={() => {
                  setConfirming(false);
                  onClose();
                }}
                type="button"
              >
                {discard.confirmLabel}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
