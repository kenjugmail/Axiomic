import { useEffect, useRef, useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import {
  Check,
  ChevronDown,
  Menu,
  Palette,
  Search,
  X as XIcon,
} from "lucide-react";
import { useAuthStore } from "../stores/auth";
import { THEME_OPTIONS, useThemeStore, type Theme } from "../stores/theme";
import { SearchDialog } from "./SearchDialog";
import { NotificationBell } from "./NotificationBell";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { NAV_PILLARS } from "../marketing/hubs";
import { AUDIENCES } from "../marketing/audiences";
import { VerifyEmailBanner } from "./VerifyEmailBanner";
import { FeedbackWidget } from "./FeedbackWidget";
import { PetMomentsHost } from "./pet/PetMomentsHost";

type NavItem = { to: string; label: string };
type NavSection = { heading: string; links: NavItem[] };

const MORE_NAV_PUBLIC_SECTIONS: NavSection[] = [
  {
    heading: "Community",
    links: [
      { to: "/forum", label: "Forum" },
      { to: "/news", label: "News" },
      { to: "/cohorts", label: "Cohorts" },
      { to: "/leaderboard", label: "Leaderboard" },
    ],
  },
  {
    heading: "Discover",
    links: [
      { to: "/challenge", label: "Daily challenge" },
      { to: "/grants", label: "Funding" },
      { to: "/lab/safety-certs", label: "Safety certifications" },
      { to: "/lab/equipment", label: "Equipment manuals" },
      { to: "/misconceptions", label: "Misconception marketplace" },
      { to: "/capstones/review-queue", label: "Peer review queue" },
      { to: "/verify", label: "Verify a transcript" },
      { to: "/demo/competency-loop", label: "Competency loop tour" },
      { to: "/explore/pets", label: "Pet showcase" },
      { to: "/skins", label: "All skins" },
      { to: "/shop", label: "Shop" },
    ],
  },
];

const MORE_NAV_USER_SECTION: NavSection = {
  heading: "My workspace",
  links: [
    { to: "/feed", label: "Feed" },
    { to: "/me/pet", label: "My pet" },
    { to: "/me/inventory", label: "Inventory" },
    { to: "/flashcards", label: "Flashcards" },
    { to: "/review/mistakes", label: "Review mistakes" },
    { to: "/me/lab", label: "My lab" },
    { to: "/me/mri", label: "Knowledge MRI" },
    { to: "/me/weak-concepts", label: "Weak concepts" },
    { to: "/me/mentors", label: "Mentors" },
  ],
};

export function Layout() {
  const { user, logout } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const themeRef = useRef<HTMLDivElement | null>(null);

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

  // Close theme popover on outside click / Esc.
  useEffect(() => {
    if (!themeOpen) return;
    const onClick = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setThemeOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [themeOpen]);

  const pickTheme = (t: Theme) => {
    setTheme(t);
    setThemeOpen(false);
  };

  const moreSections = [
    ...MORE_NAV_PUBLIC_SECTIONS,
    ...(user ? [MORE_NAV_USER_SECTION] : []),
  ];
  const focusAudience = user?.primaryPersona
    ? AUDIENCES[user.primaryPersona as keyof typeof AUDIENCES]
    : null;

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
            {focusAudience && (
              <Link
                to={focusAudience.primaryCta.to}
                className="hidden lg:inline text-xs text-muted-foreground hover:text-foreground"
              >
                Your focus: {focusAudience.title}
              </Link>
            )}
            <nav className="hidden sm:flex items-center gap-5 text-sm">
              {NAV_PILLARS.map((item) => (
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
                    tabIndex={-1}
                    onKeyDown={(e) => {
                      // Phase K — arrow-key traversal between menuitems.
                      // ArrowDown/Up move focus through links in DOM
                      // order; wraps at the ends.
                      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                      e.preventDefault();
                      const items = Array.from(
                        e.currentTarget.querySelectorAll<HTMLAnchorElement>(
                          '[role="menuitem"]',
                        ),
                      );
                      if (items.length === 0) return;
                      const idx = items.indexOf(
                        document.activeElement as HTMLAnchorElement,
                      );
                      const next =
                        e.key === "ArrowDown"
                          ? items[(idx + 1) % items.length]
                          : items[(idx - 1 + items.length) % items.length];
                      next?.focus();
                    }}
                    className="absolute left-0 top-full mt-2 min-w-[260px] rounded-lg border border-border bg-card shadow-elevated py-2 animate-fade-in"
                  >
                    {moreSections.map((section) => (
                      <div key={section.heading} className="py-1">
                        <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {section.heading}
                        </div>
                        {section.links.map((item) => (
                          <Link
                            key={item.to}
                            to={item.to}
                            role="menuitem"
                            onClick={() => setMoreOpen(false)}
                            className="block px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40 focus:bg-accent/40 focus:outline-none"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>
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

            <div ref={themeRef} className="relative">
              <button
                onClick={() => setThemeOpen((v) => !v)}
                className="p-2 rounded-md hover:bg-accent/40 text-muted-foreground hover:text-foreground transition-colors duration-fast"
                title={`Theme: ${theme}`}
                aria-label="Pick theme"
                aria-haspopup="menu"
                aria-expanded={themeOpen}
              >
                <Palette className="w-4 h-4" strokeWidth={2} />
              </button>
              {themeOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-card shadow-elevated p-1 animate-fade-in"
                >
                  <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Theme
                  </div>
                  {THEME_OPTIONS.map((opt) => {
                    const active = opt.value === theme;
                    return (
                      <button
                        key={opt.value}
                        role="menuitemradio"
                        aria-checked={active}
                        onClick={() => pickTheme(opt.value)}
                        className={`w-full flex items-start gap-2 px-3 py-2 text-left rounded-md text-sm transition-colors duration-fast ${
                          active
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        }`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block font-medium text-foreground">
                            {opt.label}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {opt.description}
                          </span>
                        </span>
                        {active && (
                          <Check
                            className="w-4 h-4 text-primary mt-0.5 shrink-0"
                            strokeWidth={2.5}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

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
        <div className="sm:hidden fixed inset-0 z-50 animate-fade-in">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
          />
          <div className="absolute left-0 top-0 bottom-0 w-72 max-w-[80%] bg-card border-r border-border shadow-floating flex flex-col">
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
              {NAV_PILLARS.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNavOpen(false)}
                  className="block px-4 py-2.5 text-sm text-foreground hover:bg-accent/40"
                >
                  {item.label}
                </Link>
              ))}
              {moreSections.map((section) => (
                <div key={section.heading}>
                  <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {section.heading}
                  </div>
                  {section.links.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileNavOpen(false)}
                      className="block px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/40"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
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

      <VerifyEmailBanner />

      <main className="flex-1">
        <Outlet />
      </main>
      <FeedbackWidget />
      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        Axiomic — Deep Knowledge, Beautifully Structured
      </footer>
      <SearchDialog isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PetMomentsHost />
    </div>
  );
}
