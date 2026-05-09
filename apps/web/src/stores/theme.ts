import { create } from "zustand";
import type { ThemePreference } from "@axiomic/types";
import { api } from "../lib/api";

export type Theme = ThemePreference;

export const THEME_OPTIONS: Array<{
  value: Theme;
  label: string;
  description: string;
}> = [
  { value: "system", label: "System", description: "Follow OS preference" },
  { value: "light", label: "Light", description: "Bright neutral" },
  { value: "dark", label: "Dark", description: "Cool deep navy" },
  { value: "dim", label: "Dim", description: "Softer dark, easier on eyes" },
  { value: "sepia", label: "Sepia", description: "Warm, paperwhite reading" },
  {
    value: "high-contrast",
    label: "High contrast",
    description: "Maximum legibility",
  },
];

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  hydrateFromServer: () => Promise<void>;
}

const ALL_THEME_CLASSES = [
  "dark",
  "theme-sepia",
  "theme-dim",
  "theme-high-contrast",
];

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove(...ALL_THEME_CLASSES);

  // `dim` and `dark` both add the `dark` class so Tailwind's `dark:`
  // variants resolve correctly; `dim` then layers a token override on top.
  // `high-contrast` follows the OS preference for light vs dark and layers
  // its own tokens.
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  switch (theme) {
    case "system":
      if (prefersDark) root.classList.add("dark");
      break;
    case "light":
      break;
    case "dark":
      root.classList.add("dark");
      break;
    case "dim":
      root.classList.add("dark", "theme-dim");
      break;
    case "sepia":
      root.classList.add("theme-sepia");
      break;
    case "high-contrast":
      root.classList.add("theme-high-contrast");
      if (prefersDark) root.classList.add("dark");
      break;
  }
}

// Storage helpers — localStorage may throw on read/write under private
// mode, quota exhaustion, or sandbox/security policies. Treating these
// as fatal would crash theme switching for affected users; we silently
// fall back to in-memory state instead.
function readStoredTheme(): Theme | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem("axiomic-theme") as Theme | null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("axiomic-theme", theme);
    }
  } catch {
    // ignore quota / unavailable
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initial: Theme = readStoredTheme() ?? "system";

  if (typeof document !== "undefined") {
    applyTheme(initial);
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        const t = useThemeStore.getState().theme;
        if (t === "system" || t === "high-contrast") applyTheme(t);
      });
  }

  return {
    theme: initial,
    setTheme: (theme) => {
      writeStoredTheme(theme);
      applyTheme(theme);
      set({ theme });
      api.settings.update({ theme }).catch(() => {});
    },
    hydrateFromServer: async () => {
      try {
        const { settings } = await api.settings.get();
        if (settings.theme && settings.theme !== get().theme) {
          writeStoredTheme(settings.theme);
          applyTheme(settings.theme);
          set({ theme: settings.theme });
        }
      } catch {
        // anon or network blip — keep local value
      }
    },
  };
});
