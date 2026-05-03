import { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { SearchDialog } from "./SearchDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

export function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  useKeyboardShortcuts(() => setSearchOpen(true));

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-lg font-semibold tracking-tight">
              Axiomic
            </Link>
            <nav className="hidden sm:flex items-center gap-6 text-sm">
              <Link to="/wiki" className="text-muted-foreground hover:text-foreground transition-colors">
                Wiki
              </Link>
              <Link to="/forum" className="text-muted-foreground hover:text-foreground transition-colors">
                Forum
              </Link>
              <Link to="/paths" className="text-muted-foreground hover:text-foreground transition-colors">
                Mastery Paths
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {/* Search button */}
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden sm:inline">Search</span>
              <kbd className="hidden sm:block text-[10px] bg-muted px-1 rounded">/</kbd>
            </button>

            {/* Theme toggle */}
            <button
              onClick={cycleTheme}
              className="p-2 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title={`Theme: ${theme}`}
            >
              {theme === "dark" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              ) : theme === "light" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              )}
            </button>

            {/* Auth */}
            {user ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted-foreground hidden sm:inline">
                  {user.displayName || user.username}
                </span>
                <button
                  onClick={handleLogout}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Link to="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Axiomic — Deep Knowledge, Beautifully Structured
      </footer>
      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
