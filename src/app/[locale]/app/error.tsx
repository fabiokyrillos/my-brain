"use client";

import { useEffect } from "react";

import { UniversalStateView } from "@/features/experience/universal-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pt = typeof window === "undefined" || !window.location.pathname.startsWith("/en/");

  /*
   * `2P-CHAT-003`. What this boundary can and cannot claim, corrected.
   *
   * The comment here used to assert that the product had no error sink at all,
   * and pointed at an open backlog item for one. That stopped being true in
   * Phase 2H — `public.error_events` shipped in `202608070080` — and slice 2P.0
   * found the claim still standing, which made it the oldest false statement on
   * this screen. It is deliberately paraphrased rather than quoted here:
   * `phase-2p-foundation-guard.test.ts` asserts the exact sentence is gone, and
   * a comment reciting it would keep that guard failing forever on correct code.
   *
   * The sink is real, and **this component still cannot reach it.** An error
   * boundary is a Client Component: the `console.error` below reaches the
   * BROWSER console and no host log, and a browser-initiated sink write would
   * need a route handler that any page could call, which is a wider surface than
   * this screen is worth. So the honest division is:
   *
   * - a fault a **Server Action** can catch is recorded server-side with a
   *   correlation id the surface quotes — `sendChatMessage` and the task-command
   *   `guard` both do that now, and between them they cover the faults that used
   *   to arrive here;
   * - a fault that reaches **this** boundary was thrown during render, and its
   *   only durable identifier is `error.digest`, which Next generates precisely
   *   so a generic client-side message can be correlated with the server log.
   *   Next replaces `error.message` in production, so the digest is genuinely
   *   all there is.
   *
   * The digest is therefore still the one value shown, and this boundary still
   * does not claim the failure was recorded — because for a render-time fault,
   * it was not.
   */
  useEffect(() => {
    console.error(
      JSON.stringify({
        event: "app_error_boundary",
        digest: error.digest ?? null,
        pathname: typeof window === "undefined" ? null : window.location.pathname,
      }),
    );
  }, [error]);

  /*
   * `2O-RECOVER-001`/`-003`. This boundary used to render its own block under
   * `empty-list` — the class the product uses for "there is nothing here",
   * which is the opposite of what an error boundary means. It is
   * `error_recoverable`, and it is recoverable in the strongest sense the
   * vocabulary has: `reset` is a real retry supplied by the framework.
   *
   * The digest stays, as the state's own content: it is the only durable value
   * on this screen (Next replaces `error.message` in production) and the one
   * thing the reader can quote.
   */
  return (
    <div className="content-page">
      <UniversalStateView
        description={pt ? "Tente novamente." : "Try again."}
        locale={pt ? "pt-BR" : "en"}
        onAction={reset}
        state="error_recoverable"
        title={pt ? "Não foi possível carregar" : "We could not load this page"}
        // The whole page is this state, so its title is the page's only
        // heading. Without `h1` a screen-reader user has nothing to navigate to.
        titleAs="h1"
      >
        {error.digest ? (
          <p className="ux-state-description">
            {pt ? "Código para relatar o problema: " : "Code to report the problem: "}
            <code>{error.digest}</code>
          </p>
        ) : null}
      </UniversalStateView>
    </div>
  );
}
