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

  // There is no error sink in this product yet (see docs/TODO.md). Until there
  // is, the boundary must not claim the failure was recorded — so it records
  // what it truthfully can (a structured line in the host's stdout, with the
  // digest that correlates it to the server-side stack) and shows the user the
  // same digest to quote. The previous copy promised recording while the
  // `error` prop was discarded entirely.
  useEffect(() => {
    console.error(
      JSON.stringify({
        event: "app_error_boundary",
        digest: error.digest ?? null,
        message: error.message,
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
