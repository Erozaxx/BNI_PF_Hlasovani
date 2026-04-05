/**
 * Shown when the magic link token is expired or revoked.
 * Static view — no interactivity needed.
 */
export function MeetingExpired() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-5xl">&#x231B;</div>
        <h1 className="text-2xl font-bold text-text-main">Link vypršel</h1>
        <p className="text-text-muted text-sm">
          Tento odkaz pro hlasovani uz neni platny. Kontaktujte organizatora
          schuzky pro zaslani noveho odkazu.
        </p>
      </div>
    </div>
  );
}
