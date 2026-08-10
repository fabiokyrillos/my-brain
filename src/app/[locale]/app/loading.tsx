export default function AuthenticatedLoading() {
  return (
    <main aria-label="Carregando página" aria-live="polite" className="route-loading" role="status">
      <span className="sr-only">Carregando página</span>
      <div className="route-loading-heading" data-loading-block />
      <div className="route-loading-summary" data-loading-block />
      <div className="route-loading-grid">
        <div className="route-loading-card" data-loading-block />
        <div className="route-loading-card" data-loading-block />
      </div>
    </main>
  );
}
