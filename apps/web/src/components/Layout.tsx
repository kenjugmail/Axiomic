import { useEffect, useRef, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  Menu,
  Monitor,
  Moon,
  Search,
  Sun,
  X as XIcon,
} from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { useThemeStore } from "../stores/theme";
import { SearchDialog } from "./SearchDialog";
import { NotificationBell } from "./NotificationBell";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";

const PRIMARY_NAV: Array<{ to: string; label: string }> = [
  { to: "/wiki", label: "Wiki" },
  { to: "/forum", label: "Forum" },
  { to: "/news", label: "News" },
  { to: "/paths", label: "Paths" },
];

const SECONDARY_NAV_PUBLIC: Array<{ to: string; label: string }> = [
  { to: "/challenge", label: "Daily challenge" },
  { to: "/leaderboard", label: "Leaderboard" },
];

const SECONDARY_NAV_USER: Array<{ to: string; label: string }> = [
  { to: "/feed", label: "Feed" },
  { to: "/flashcards", label: "Flashcards" },
  { to: "/review/mistakes", label: "Review mistakes" },
];

export function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useKeyboardShortcuts(() => setSearchOpen(true));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setShortcutsOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Close the "More" dropdown on outside click or Esc.
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [moreOpen]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  const cycleTheme = () => {
    const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
  };

  const secondary = [
    ...SECONDARY_NAV_PUBLIC,
    ...(user ? SECONDARY_NAV_USER : []),
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border bg-card/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-6">
            <button
              type="button"
              className="sm:hidden -ml-1 p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" strokeWidth={2} />
            </button>
            <Link to="/" className="font-display text-lg font-semibold tracking-tight">
              Axiomic
            </Link>
            <nav className="hidden sm:flex items-center gap-5 text-sm">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="text-muted-foreground hover:text-foreground transition-colors duration-fast"
                >
                  {item.label}
                </Link>
              ))}
              <div ref={moreRef} className="relative">
                <button
                  type="button"
                  onClick={() => setMoreOpen((v) => !v)}
                  className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors duration-fast"
                  aria-expanded={moreOpen}
                  aria-haspopup="menu"
                >
                  More
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-fast ${
                      moreOpen ? "rotate-180" : ""
                    }`}
                    strokeWidth={2}
                  />
                </button>
                {moreOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-2 min-w-[200px] rounded-lg border border-border bg-card shadow-elevated py-1 animate-fade-in"
                  >
                    {secondary.map((item) => (
                      <Link
                        key={item.to}
                        to={item.to}
                        role="menuitem"
                        onClick={() => setMoreOpen(false)}
                        className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-input bg-background text-sm text-muted-foreground hover:text-foreground transition-colors duration-fast"
              aria-label="Search"
            >
              <Search className="w-3.5 h-3.5" strokeWidth={2} />
              <kbd className="hidden sm:inline-block text-[10px] bg-muted px-1 rounded">/</kbd>
            </button>

            <button
              onClick={cycleTheme}
              className="p-2 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors duration-fast"
              title={`Theme: ${theme}`}
              aria-label={`Theme: ${theme}`}
            >
              {theme === "dark" ? (
                <Moon className="w-4 h-4" strokeWidth={2} />
              ) : theme === "light" ? (
                <Sun className="w-4 h-4" strokeWidth={2} />
              ) : (
                <Monitor className="w-4 h-4" strokeWidth={2} />
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-2 text-sm">
                <NotificationBell />
                <Link
                  to="/settings"
                  className="text-muted-foreground hover:text-foreground transition-colors duration-fast hidden sm:inline px-2"
                  title="Settings"
                >
                  {user.displayName || user.username}
                </Link>
                <button
                  onClick={handleLogout}
                  className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors duration-fast"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm">
                <Link
                  to="/login"
                  className="hidden sm:inline text-muted-foreground hover:text-foreground transition-colors duration-fast px-2"
                >
                  Sign in
                </Link>
                <Link
                  to="/signup"
                  className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors duration-fast"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <div
          className="sm:hidden fixed inset-0 z-50 bg-background/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setMobileNavOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-72 max-w-[80%] bg-card border-r border-border shadow-floating flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border">
              <span className="font-display text-lg font-semibold">Axiomic</span>
              <button
                onClick={() => setMobileNavOpen(false)}
                className="p-2 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                aria-label="Close menu"
              >
                <XIcon className="w-5 h-5" strokeWidth={2} />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2">
              <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Browse
              </div>
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className="block px-4 py-2.5 text-sm text-foreground hover:bg-accent/40"
                >
                  {item.label}
                </Link>
              ))}
              <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Practice
              </div>
              {secondary.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className="block px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40"
                >
                  {item.label}
                </Link>
              ))}
              {user && (
                <>
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Account
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setMobileNavOpen(false)}
                    className="block px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      setMobileNavOpen(false);
                      handleLogout();
                    }}
                    className="block w-full text-left px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  >
                    Sign out
                  </button>
                </>
              )}
              {!user && (
                <>
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Account
                  </div>
                  <Link
                    to="/login"
                    onClick={() => setMobileNavOpen(false)}
                    className="block px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  >
                    Sign in
                  </Link>
                  <Link
                    to="/signup"
                    onClick={() => setMobileNavOpen(false)}
                    className="block px-4 py-2.5 text-sm text-primary hover:bg-accent/40"
                  >
                    Sign up
                  </Link>
                </>
              )}
            </nav>
          </div>
        </div>
      )}

      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Axiomic — Deep Knowledge, Beautifully Structured
      </footer>
      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
