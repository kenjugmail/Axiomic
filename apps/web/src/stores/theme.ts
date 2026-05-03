import { create } from "zustand";
import { api } from "../lib/api";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  // Hydrate from server (called after auth.fetchUser succeeds). Server is
  // the source of truth for signed-in users; localStorage is a fallback
  // for anon users and a fast path for instant theme on next page load.
  hydrateFromServer: () => Promise<void>;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  } else {
    root.classList.toggle("dark", theme === "dark");
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const stored = (typeof localStorage !== "undefined" && localStorage.getItem("axiomic-theme")) as Theme | null;
  const initial = stored || "system";

  if (typeof document !== "undefined") {
    applyTheme(initial);
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const state = useThemeStore.getState();
      if (state.theme === "system") applyTheme("system");
    });
  }

  return {
    theme: initial,
    setTheme: (theme) => {
      localStorage.setItem("axiomic-theme", theme);
      applyTheme(theme);
      set({ theme });
      // Persist to server in the background. Anon users get 401 — ignored.
      api.settings.update({ theme }).catch(() => {});
    },
    hydrateFromServer: async () => {
      try {
        const { settings } = await api.settings.get();
        if (settings.theme && settings.theme !== get().theme) {
          localStorage.setItem("axiomic-theme", settings.theme);
          applyTheme(settings.theme);
          set({ theme: settings.theme });
        }
      } catch {
        // anon or network blip — keep local value
      }
    },
  };
});
