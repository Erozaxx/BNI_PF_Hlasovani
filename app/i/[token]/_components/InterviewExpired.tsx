/**
 * Shown when the interview magic link token is invalid, expired, revoked, or
 * rate-limited. Static view, uniform message regardless of the underlying
 * reason (EN-001 - no status enumeration).
 */
export function InterviewExpired() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">&#x231B;</div>
        <h1 className="text-2xl font-bold text-text-main">Odkaz neplatí</h1>
        <p className="text-text-muted text-sm">
          Odkaz na pohovor neplatí nebo vypršel. Nový ti pošle vedení.
        </p>
      </div>
    </div>
  );
}
