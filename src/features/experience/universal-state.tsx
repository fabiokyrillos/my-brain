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
  readonly actionLabel?: string;
  readonly className?: string;
};

export function UniversalStateView({
  state,
  locale,
  title,
  description,
  onAction,
  actionLabel,
  className,
}: UniversalStateViewProps) {
  const definition = UNIVERSAL_STATE_DEFINITIONS[state];
  const text = getExperienceCopy(locale).states[state];

  // An action is offered only when the state is recoverable AND a handler
  // exists. A retry button on a terminal error is a control that cannot work.
  const showAction = definition.recoverable && typeof onAction === "function";

  return (
    <div
      className={[stateClassName(state), toneClassName(definition.tone), className]
        .filter(Boolean)
        .join(" ")}
      // `announce` is null for `empty`: a list that is empty on arrival is not
      // an event, and announcing it interrupts a screen-reader user who is
      // still hearing the page.
      role={definition.announce === "assertive" ? "alert" : definition.announce ? "status" : undefined}
      aria-live={definition.announce ?? undefined}
      data-ux-state={state}
      data-content-safe={definition.contentIsSafe ? "true" : "false"}
    >
      <ToneIcon tone={definition.tone} size={18} className="ux-state-icon" />
      <div className="ux-state-body">
        <p className="ux-state-title">{title ?? text.title}</p>
        <p className="ux-state-description">{description ?? text.description}</p>
        {/* The reassurance. On `interpreting` this is the most important
            sentence on the screen, so it renders whenever the vocabulary says
            the content is safe rather than when a surface remembers to pass it. */}
        {definition.contentIsSafe && text.safety ? (
          <p className="ux-state-safety">{text.safety}</p>
        ) : null}
        {showAction ? (
          <button type="button" className="ux-state-action" onClick={onAction}>
            {actionLabel ?? text.action}
          </button>
        ) : null}
      </div>
    </div>
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
