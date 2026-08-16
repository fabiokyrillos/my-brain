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

  // There is no error sink in this product yet (H7 remains open in docs/TODO.md).
  // Until there is, this boundary must simply stop claiming the failure was
  // recorded — the previous copy promised exactly that while discarding the
  // `error` prop entirely.
  //
  // Being precise about what this line is worth: an error boundary is a Client
  // Component, so it reaches the BROWSER console, never a host log. And for an
  // error thrown in a Server Component, Next replaces `error.message` with a
  // generic string in production and exposes only `error.digest` to correlate
  // with the server-side log. So the digest is the only durable value here, and
  // it is the one thing shown to the user to quote.
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
