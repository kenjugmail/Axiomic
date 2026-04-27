import { Outlet, Link } from "react-router-dom";

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            Axiomic
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link to="/wiki" className="text-muted-foreground hover:text-foreground transition-colors">
              Wiki
            </Link>
            <Link to="/paths" className="text-muted-foreground hover:text-foreground transition-colors">
              Mastery Paths
            </Link>
            <Link to="/login" className="text-muted-foreground hover:text-foreground transition-colors">
              Sign In
            </Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>Axiomic — Deep Knowledge, Beautifully Structured</p>
      </footer>
    </div>
  );
}
