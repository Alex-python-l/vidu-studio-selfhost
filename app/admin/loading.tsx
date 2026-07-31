export default function AdminLoading() {
  return (
    <main className="admin-shell" aria-busy="true">
      <div className="admin-loading" role="status" aria-live="polite">
        <span className="ui-button-spinner" aria-hidden="true" />
        <span>正在载入管理后台…</span>
      </div>
    </main>
  );
}
