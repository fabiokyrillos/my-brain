"use client";

import { useEffect } from "react";

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

  return (
    <div className="content-page">
      <div className="empty-list" role="alert">
        <h1>{pt ? "Não foi possível carregar" : "We could not load this page"}</h1>
        <p>{pt ? "Tente novamente." : "Try again."}</p>
        {error.digest ? (
          <p>
            {pt ? "Código para relatar o problema: " : "Code to report the problem: "}
            <code>{error.digest}</code>
          </p>
        ) : null}
        <button className="row-action" type="button" onClick={reset}>
          {pt ? "Tentar novamente" : "Try again"}
        </button>
      </div>
    </div>
  );
}
