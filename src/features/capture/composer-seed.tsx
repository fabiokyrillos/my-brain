"use client";

/**
 * Life Brain B.7 — how a chip **fills** the composer without sending anything.
 *
 * ## What the owner actually asked for
 *
 * 5 November 2026, watching his own screen recording: *"note que não parece um
 * chat de verdade. Porque os atalhos aqui não são atalhos, são só sugestões. Se
 * eu aperto aqui, não preenche lá em cima."* And then the rule, in his words:
 * *"Para eu clicar, e já preencher isso embaixo. **Mas lembre que é preencher,
 * não enviar.**"*
 *
 * The starter chips were `ButtonLink`s to `?q=…`. Every tap was a **full
 * navigation**: the page re-rendered on the server, a skeleton appeared, and the
 * field filled a second later — which from the outside is indistinguishable from
 * a tap that did nothing. The question was never the problem; the round trip
 * was.
 *
 * ## Why a channel and not a prop
 *
 * The composer and the chips are not in the same subtree and must not be. The
 * composer is the page's first interactive element (UX-07), the suggestions are
 * derived on the server and sit under the conversation list, and a shared
 * `useState` would mean lifting the composer's uncontrolled field into a
 * controlled one — re-rendering the whole surface on every keystroke, which is
 * what `composer.tsx` deliberately avoids.
 *
 * So the composer **registers a filler** and the chips **call it**. The field
 * stays uncontrolled, the chip stays a one-line button, and neither knows
 * anything about the other except this interface.
 *
 * ## `ready` is not decoration
 *
 * A chip that silently does nothing is the very defect this fixes. `ready` says
 * whether a composer is listening, so a surface can render the degraded path —
 * the old link — instead of a button that looks live and is not. Nothing here
 * submits: `fill` writes into a field and returns.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The longest question that may be put in the field by a chip or by `?q=`.
 *
 * One constant for both paths. It lived in `chat/page.tsx` while the only way to
 * seed the field was a query string; the client fill has to honour the same
 * bound, and two numbers would be one edit away from disagreeing.
 */
export const MAX_SEED_LENGTH = 240;

/** Trimmed and bounded. The same treatment `?q=` has always had. */
export function boundSeed(text: string): string {
  return text.trim().slice(0, MAX_SEED_LENGTH);
}

type Filler = (text: string) => void;

export type ComposerSeedChannel = {
  /**
   * Puts bounded text in the composer and focuses it. **Never submits.**
   *
   * Returns `false` when no composer is listening, so a caller can tell "I
   * filled it" from "there was nothing to fill" instead of assuming.
   */
  readonly fill: (text: string) => boolean;
  /** Whether a composer is mounted and listening. */
  readonly ready: boolean;
  /** Called by the composer itself; `null` on unmount. */
  readonly register: (filler: Filler | null) => void;
};

const ComposerSeedContext = createContext<ComposerSeedChannel | null>(null);

export function ComposerSeedProvider({ children }: { children: ReactNode }) {
  /*
    A ref rather than state for the filler, and that is the load-bearing half:
    the filler closes over the composer's `<textarea>` ref, so re-registering it
    on every render of the composer would re-render every chip on the page for a
    value none of them reads.
  */
  const filler = useRef<Filler | null>(null);
  const [ready, setReady] = useState(false);

  const register = useCallback((next: Filler | null) => {
    filler.current = next;
    setReady(next !== null);
  }, []);

  const fill = useCallback((text: string) => {
    const target = filler.current;
    if (target === null) return false;
    const bounded = boundSeed(text);
    if (bounded === "") return false;
    target(bounded);
    return true;
  }, []);

  const value = useMemo<ComposerSeedChannel>(
    () => ({ fill, ready, register }),
    [fill, ready, register],
  );

  return <ComposerSeedContext.Provider value={value}>{children}</ComposerSeedContext.Provider>;
}

/**
 * The channel, or `null` where no provider wraps the surface.
 *
 * `null` rather than a throwing hook: a chip is additive context and a surface
 * that renders one outside a provider should degrade to its link, not fail the
 * page the owner came to read.
 */
export function useComposerSeed(): ComposerSeedChannel | null {
  return useContext(ComposerSeedContext);
}

/**
 * Registers this surface's field as the one a chip fills.
 *
 * The indirection through a ref is what lets the composer pass a fresh closure
 * every render without re-registering — the effect depends on `register` alone,
 * which is stable, so registration happens once per mount.
 */
export function useRegisterComposerSeed(filler: Filler): void {
  const channel = useContext(ComposerSeedContext);
  const register = channel?.register;
  const latest = useRef(filler);

  // After commit rather than during render: a ref written while rendering is
  // the shape React Compiler refuses, and the initial value above already
  // covers the first paint — nothing can call the filler before this runs.
  useEffect(() => {
    latest.current = filler;
  });

  useEffect(() => {
    if (register === undefined) return;
    register((text) => latest.current(text));
    return () => register(null);
  }, [register]);
}

/**
 * The one rule for putting text into a field that already has some.
 *
 * `2P-CAPTURE-006` settled this for a voice transcript — *join the sentence
 * rather than replace it* — and a suggestion is the same kind of arrival, so it
 * gets the same rule rather than a second one. The owner's own words never lose
 * to a chip.
 *
 * The exception is a previous fill: tapping a second chip replaces the first
 * one's text instead of concatenating two questions, because the common
 * mistake is tapping the wrong chip and the common fix is tapping another.
 * Tracked by value, so a single character typed into the field makes it the
 * owner's text again and protects it.
 */
export function fillField(
  field: HTMLTextAreaElement,
  text: string,
  previousFill: string | null,
): string {
  const current = field.value;
  const replaceable = current.trim() === "" || current === previousFill;
  const next = replaceable ? text : `${current.trimEnd()} ${text}`;
  field.value = next;
  field.focus();
  field.setSelectionRange(next.length, next.length);
  return next;
}
