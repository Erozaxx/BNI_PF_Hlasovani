export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="mb-6">
          <span className="text-6xl font-bold text-primary">404</span>
        </div>
        <h1 className="text-2xl font-bold text-text-main mb-2">
          Stránka nenalezena
        </h1>
        <p className="text-text-muted mb-6">
          Omlouváme se, požadovaná stránka neexistuje nebo byla přesunuta.
        </p>
      </div>
    </div>
  );
}
