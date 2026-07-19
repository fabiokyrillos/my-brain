"use client";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pt = typeof window === "undefined" || !window.location.pathname.startsWith("/en/");

  return (
    <div className="content-page">
      <div className="empty-list" role="alert">
        <h1>{pt ? "Não foi possível carregar" : "We could not load this page"}</h1>
        <p>{pt ? "O problema foi registrado. Tente novamente." : "The problem was recorded. Try again."}</p>
        <button className="row-action" type="button" onClick={reset}>
          {pt ? "Tentar novamente" : "Try again"}
        </button>
      </div>
    </div>
  );
}
