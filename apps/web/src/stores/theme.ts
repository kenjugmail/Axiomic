import { create } from "zustand";

type Theme = "light" | "dark" | "system";

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
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

export const useThemeStore = create<ThemeState>((set) => {
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
    },
  };
});
