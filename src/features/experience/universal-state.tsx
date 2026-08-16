/**
 * `2I-LANG-004` / `2I-LANG-005` — the six universal states, one implementation.
 *
 * Every surface in the product renders empty, loading, interpreting, failure
 * and offline through this component. Before it, each surface wrote its own,
 * which is how "saved, still being interpreted" ended up expressed nowhere at
 * all despite being the product's most common intermediate state.
 *
 * **This component performs no writes.** It takes an `onAction` handler and
 * calls it. `phase-2i-experience-guard.test.ts` asserts the whole
 * `src/features/experience/` directory constructs no Supabase client — the
 * component-layer expression of Phase 2F's one-write-path rule
 * (`2I-TRUST-008`).
 */

import { createElement } from "react";
import Link from "next/link";
import {
  Archive,
  CircleCheck,
  Info,
  OctagonAlert,
  Sparkles,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { getExperienceCopy } from "./copy";
import {
  TONE_DEFINITIONS,
  UNIVERSAL_STATE_DEFINITIONS,
  type ExperienceTone,
  type UniversalState,
  stateClassName,
  toneClassName,
} from "./state-vocabulary";

/**
 * Icon-name → component. The vocabulary module stays data-only so a test can
 * import it without React; this map is the one place that binds it to lucide.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = {
  Info,
  CircleCheck,
  TriangleAlert,
  OctagonAlert,
  Sparkles,
  Archive,
};

function toneIconComponent(tone: ExperienceTone): LucideIcon {
  return ICONS[TONE_DEFINITIONS[tone].icon] ?? Info;
}

/**
 * A tone's icon, as a component rather than as a value.
 *
 * Resolving the icon into a capitalised local inside a render body trips
 * `react-hooks/static-components` — the rule is right: a component identity
 * that changes every render remounts its subtree. Declaring the lookup here,
 * once, at module scope, keeps the identity stable and the call sites simple.
 */
export function ToneIcon({
  tone,
  size = 16,
  className,
}: {
  tone: ExperienceTone;
  size?: number;
  className?: string;
}) {
  // `createElement` rather than `const Icon = …; <Icon />`. Binding the looked-up
  // component to a capitalised local is what the lint rule flags, and it is
  // right to: JSX over a local reads as a component defined during render.
  return createElement(toneIconComponent(tone), { size, className, "aria-hidden": true });
}

export type UniversalStateViewProps = {
  readonly state: UniversalState;
  readonly locale: string;
  /** Overrides the typed copy when a surface has something more specific. */
  readonly title?: string;
  readonly description?: string;
  /** Called when the user takes the action out. The handler owns the write. */
  readonly onAction?: () => void;
  /**
   * `2O-RECOVER-003` — the action out, as a destination rather than a handler.
   *
   * Two things need this and neither can use `onAction`. A **Server Component**
   * cannot pass a function across the RSC boundary at all, and most of this
   * product's empty states are rendered by server-rendered pages; before this
   * prop, adopting the shared component would have meant turning a page into a
   * client component to give it an action. And `error_terminal` owes the user
   * **a way to leave**, which is navigation by definition — a retry handler is
   * precisely the control that state must not offer.
   */
  readonly actionHref?: string;
  readonly actionLabel?: string;
  readonly className?: string;
  /**
   * The element the title renders as. `p` by default, so no existing call site
   * changes.
   *
   * A state that occupies the **whole page** — the app error boundary is the
   * one in this repository — owes a real heading: a screen-reader user
   * navigates by headings, and a page whose only content is a state would
   * otherwise have none at all. A state inside a populated page must NOT emit
   * one, because it would appear in the document outline as a peer of the
   * page's own sections. The surface is the only thing that knows which it is.
   */
  readonly titleAs?: "p" | "h1" | "h2" | "h3";
  /**
   * Whether **this instance** is the thing that announces the state.
   *
   * The vocabulary decides *how* a state is announced; only the surface knows
   * whether something else on the page is already announcing it. `AccountMenu`
   * renders its failure twice on purpose — a visible paragraph and a separate
   * live region — and making the visible copy a second live region announces
   * the same sentence to a screen-reader user twice. Slice 2O.2 shipped exactly
   * that defect once already.
   */
  readonly announce?: boolean;
  /**
   * Content the surface owns, rendered inside the state.
   *
   * Chat's empty state carries up to three suggestions derived from the
   * reader's own people and projects (`2K-SUGG-003`). That is still an `empty`
   * state — it says the list has nothing in it — so the alternative to a slot
   * was leaving one surface outside the vocabulary, which is what
   * `2O-RECOVER-001` forbids. The slot renders **after** the action, so a
   * surface cannot use it to smuggle in a second, competing recovery.
   */
  readonly children?: React.ReactNode;
};

export function UniversalStateView({
  state,
  locale,
  title,
  description,
  onAction,
  actionHref,
  actionLabel,
  className,
  titleAs = "p",
  announce = true,
  children,
}: UniversalStateViewProps) {
  const definition = UNIVERSAL_STATE_DEFINITIONS[state];
  const text = getExperienceCopy(locale).states[state];
  const live = announce ? definition.announce : null;

  // A retry is offered only when the state is recoverable AND a handler exists.
  // A retry button on a terminal error is a control that cannot work.
  const showRetry = definition.recoverable && typeof onAction === "function";
  /*
   * A way out is offered when the state is recoverable (a link is a legitimate
   * recovery — "go and configure the thing that is missing") or when the
   * vocabulary says this state owes an exit. `loading` and `interpreting` are
   * neither, so a caller cannot bolt an action onto a state that is simply
   * waiting: the guard plants exactly that call and expects nothing rendered.
   */
  const showExit =
    typeof actionHref === "string"
    && actionHref.length > 0
    && (definition.recoverable || definition.offersExit);

  return (
    <div
      className={[stateClassName(state), toneClassName(definition.tone), className]
        .filter(Boolean)
        .join(" ")}
      // `announce` is null for `empty`: a list that is empty on arrival is not
      // an event, and announcing it interrupts a screen-reader user who is
      // still hearing the page.
      role={live === "assertive" ? "alert" : live ? "status" : undefined}
      aria-live={live ?? undefined}
      data-ux-state={state}
      data-content-safe={definition.contentIsSafe ? "true" : "false"}
    >
      <ToneIcon tone={definition.tone} size={18} className="ux-state-icon" />
      <div className="ux-state-body">
        {createElement(titleAs, { className: "ux-state-title" }, title ?? text.title)}
        <p className="ux-state-description">{description ?? text.description}</p>
        {/* The reassurance. On `interpreting` this is the most important
            sentence on the screen, so it renders whenever the vocabulary says
            the content is safe rather than when a surface remembers to pass it. */}
        {definition.contentIsSafe && text.safety ? (
          <p className="ux-state-safety">{text.safety}</p>
        ) : null}
        {showRetry ? (
          <button type="button" className="ux-state-action" onClick={onAction}>
            {actionLabel ?? text.action}
          </button>
        ) : null}
        {showExit ? (
          <Link className="ux-state-action" data-ux-state-exit={definition.offersExit ? "true" : undefined} href={actionHref}>
            {actionLabel ?? text.action}
          </Link>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/**
 * `2O-RECOVER-001` / `-002` — the same seven states at section density.
 *
 * ## Why a second component and not a second implementation
 *
 * The census this slice ran found two structurally different things being
 * called an empty state. A **surface** state is the whole view saying it has
 * nothing — a page with a list and no rows. A **section** absence is one
 * section of a populated page saying that one relation is empty, and a project
 * page has five of them. Rendering the full bordered block five times on a page
 * that is not empty makes a populated page look broken, which is why those
 * sections wrote their own muted sentence in the first place.
 *
 * Answering that with an exception list would have been the wrong fix: the
 * state would still be rendered outside the vocabulary, and `2O-RECOVER-001`
 * says *wherever it is rendered at all*. So the density changes and the
 * vocabulary does not. Both components emit `data-ux-state`, both take their
 * tone from `TONE_DEFINITIONS`, and the guard reads the attribute rather than
 * the component name — so neither can drift from the other.
 */
export type UniversalStateLineProps = {
  readonly state: UniversalState;
  readonly locale: string;
  /**
   * The section's own sentence. Sections almost always have one.
   *
   * A node rather than a string because three of the converted sections lead
   * with a bolded heading — `<strong>{copy.emptyHeading}</strong> {body}` —
   * and flattening that to a string would have lost emphasis the surface
   * already had.
   */
  readonly description?: React.ReactNode;
  readonly actionHref?: string;
  readonly actionLabel?: string;
  readonly className?: string;
  /** See `UniversalStateViewProps.announce`. */
  readonly announce?: boolean;
};

export function UniversalStateLine({
  state,
  locale,
  description,
  actionHref,
  actionLabel,
  className,
  announce = true,
}: UniversalStateLineProps) {
  const definition = UNIVERSAL_STATE_DEFINITIONS[state];
  const text = getExperienceCopy(locale).states[state];
  const live = announce ? definition.announce : null;
  const showExit =
    typeof actionHref === "string"
    && actionHref.length > 0
    && (definition.recoverable || definition.offersExit);

  return (
    <p
      className={["ux-state-line", toneClassName(definition.tone), className].filter(Boolean).join(" ")}
      role={live === "assertive" ? "alert" : live ? "status" : undefined}
      aria-live={live ?? undefined}
      data-ux-state={state}
      data-ux-density="line"
      data-content-safe={definition.contentIsSafe ? "true" : "false"}
    >
      <ToneIcon tone={definition.tone} size={14} className="ux-state-line-icon" />
      <span className="ux-state-line-text">{description ?? text.description}</span>
      {showExit ? (
        <Link className="ux-state-line-action" href={actionHref}>
          {actionLabel ?? text.action}
        </Link>
      ) : null}
    </p>
  );
}

/** A skeleton whose shape matches the list it replaces, so nothing reflows. */
export function UniversalSkeleton({ rows = 3, label }: { rows?: number; label?: string }) {
  return (
    <div className="ux-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label ?? "Loading"}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="ux-skeleton-row" aria-hidden="true" />
      ))}
    </div>
  );
}

/**
 * `2I-LANG-002` — the four kinds of text, distinguished without colour.
 *
 * The label is rendered, not implied: a border style alone is invisible to a
 * screen-reader user, and "the AI suggested this" is exactly the distinction
 * that must survive.
 */
export type AuthoredKind = "user" | "interpretation" | "suggestion" | "confirmed";

export function AuthoredBlock({
  kind,
  label,
  children,
}: {
  kind: AuthoredKind;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`ux-authored ux-authored-${kind}`} data-authored={kind}>
      <span className="ux-authored-label">{label}</span>
      {children}
    </div>
  );
}
