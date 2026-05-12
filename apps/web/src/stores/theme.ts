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

export type Direction =
  | "warm-scholarly"
  | "academic-neutral"
  | "modern-productivity"
  | "tech-forward"
  | "editorial-print";

export const DIRECTIONS: ReadonlyArray<Direction> = [
  "warm-scholarly",
  "academic-neutral",
  "modern-productivity",
  "tech-forward",
  "editorial-print",
];

export interface DirectionMeta {
  value: Direction;
  label: string;
  description: string;
  /** Preview swatches read by the settings DirectionPicker tile (light variant). */
  preview: { bg: string; bgElev: string; accent: string; ink: string };
  /** Display font family — short label shown under the swatches. */
  fontLabel: string;
}

export const DIRECTION_OPTIONS: ReadonlyArray<DirectionMeta> = [
  {
    value: "warm-scholarly",
    label: "Warm scholarly",
    description: "Parchment + aubergine. The default.",
    preview: {
      bg: "#f6f2ea",
      bgElev: "#fbf8f2",
      accent: "#7a4cc7",
      ink: "#1d1b16",
    },
    fontLabel: "Newsreader",
  },
  {
    value: "academic-neutral",
    label: "Academic neutral",
    description: "Cool gray + indigo, calm and library-like.",
    preview: {
      bg: "#f4f4f5",
      bgElev: "#ffffff",
      accent: "#1d4ed8",
      ink: "#18181b",
    },
    fontLabel: "Geist",
  },
  {
    value: "modern-productivity",
    label: "Modern productivity",
    description: "Crisp neutrals + violet. Linear-ish.",
    preview: {
      bg: "#fafafa",
      bgElev: "#ffffff",
      accent: "#5b5bd6",
      ink: "#0a0a0a",
    },
    fontLabel: "Geist",
  },
  {
    value: "tech-forward",
    label: "Tech forward",
    description: "Near-black + mint. Dark-by-default; light variant available.",
    preview: {
      bg: "#0c0d10",
      bgElev: "#16181d",
      accent: "#6ee7b7",
      ink: "#e8e8ea",
    },
    fontLabel: "Geist Mono",
  },
  {
    value: "editorial-print",
    label: "Editorial print",
    description: "Warm paper + crimson serif headings.",
    preview: {
      bg: "#efece4",
      bgElev: "#f7f4ec",
      accent: "#8a2c2c",
      ink: "#161514",
    },
    fontLabel: "Newsreader",
  },
];

interface ThemeState {
  theme: Theme;
  direction: Direction;
  density: number;
  rarityIntensity: number;
  rhythmicGrid: boolean;
  setTheme: (theme: Theme) => void;
  setDirection: (direction: Direction) => void;
  setDensity: (n: number) => void;
  setRarityIntensity: (n: number) => void;
  setRhythmicGrid: (b: boolean) => void;
  hydrateFromServer: () => Promise<void>;
}

const ALL_THEME_CLASSES = [
  "dark",
  "theme-sepia",
  "theme-dim",
  "theme-high-contrast",
];

const DEFAULT_DIRECTION: Direction = "warm-scholarly";
const DEFAULT_DENSITY = 1;
const DEFAULT_RARITY_I = 0.6;
const DEFAULT_RHYTHMIC = false;

const STORAGE_KEY_THEME = "axiomic-theme";
const STORAGE_KEY_DIR = "axiomic-direction";
const STORAGE_KEY_DENSITY = "axiomic-density";
const STORAGE_KEY_RARITY = "axiomic-rarity-i";
const STORAGE_KEY_RHYTHMIC = "axiomic-rhythmic-grid";

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

function applyDirection(direction: Direction) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (direction === DEFAULT_DIRECTION) {
    root.removeAttribute("data-dir");
  } else {
    root.setAttribute("data-dir", direction);
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function applyDensity(n: number) {
  if (typeof document === "undefined") return;
  const v = clamp01(n);
  const root = document.documentElement;
  root.style.setProperty("--density", String(v));
  // Pet-dense ranges 24..40 px (24 + 16 * density).
  root.style.setProperty("--pet-dense", `${Math.round(24 + v * 16)}px`);
}

function applyRarityIntensity(n: number) {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--rarity-i", String(clamp01(n)));
}

// Storage helpers — localStorage may throw on read/write under private
// mode, quota exhaustion, or sandbox/security policies. Treating these
// as fatal would crash theme switching for affected users; we silently
// fall back to in-memory state instead.
function readStoredTheme(): Theme | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY_THEME) as Theme | null;
  } catch {
    return null;
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_THEME, theme);
    }
  } catch {
    // ignore quota / unavailable
  }
}

function readStoredDirection(): Direction {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_DIRECTION;
    const raw = localStorage.getItem(STORAGE_KEY_DIR);
    if (raw && (DIRECTIONS as ReadonlyArray<string>).includes(raw)) {
      return raw as Direction;
    }
    return DEFAULT_DIRECTION;
  } catch {
    return DEFAULT_DIRECTION;
  }
}

function writeStoredDirection(direction: Direction): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY_DIR, direction);
    }
  } catch {
    // ignore
  }
}

function readStoredNumber(key: string, fallback: number): number {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) return fallback;
    return clamp01(n);
  } catch {
    return fallback;
  }
}

function writeStoredNumber(key: string, n: number): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, String(n));
    }
  } catch {
    // ignore
  }
}

function readStoredBool(key: string, fallback: boolean): boolean {
  try {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === "true" || raw === "1";
  } catch {
    return fallback;
  }
}

function writeStoredBool(key: string, b: boolean): void {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, b ? "true" : "false");
    }
  } catch {
    // ignore
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialTheme: Theme = readStoredTheme() ?? "system";
  const initialDirection: Direction = readStoredDirection();
  const initialDensity = readStoredNumber(STORAGE_KEY_DENSITY, DEFAULT_DENSITY);
  const initialRarity = readStoredNumber(STORAGE_KEY_RARITY, DEFAULT_RARITY_I);
  const initialRhythmic = readStoredBool(STORAGE_KEY_RHYTHMIC, DEFAULT_RHYTHMIC);

  if (typeof document !== "undefined") {
    applyTheme(initialTheme);
    applyDirection(initialDirection);
    applyDensity(initialDensity);
    applyRarityIntensity(initialRarity);
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", () => {
        const t = useThemeStore.getState().theme;
        if (t === "system" || t === "high-contrast") applyTheme(t);
      });
  }

  return {
    theme: initialTheme,
    direction: initialDirection,
    density: initialDensity,
    rarityIntensity: initialRarity,
    rhythmicGrid: initialRhythmic,
    setTheme: (theme) => {
      writeStoredTheme(theme);
      applyTheme(theme);
      set({ theme });
      api.settings.update({ theme }).catch(() => {});
    },
    setDirection: (direction) => {
      writeStoredDirection(direction);
      applyDirection(direction);
      set({ direction });
    },
    setDensity: (n) => {
      const v = clamp01(n);
      writeStoredNumber(STORAGE_KEY_DENSITY, v);
      applyDensity(v);
      set({ density: v });
    },
    setRarityIntensity: (n) => {
      const v = clamp01(n);
      writeStoredNumber(STORAGE_KEY_RARITY, v);
      applyRarityIntensity(v);
      set({ rarityIntensity: v });
    },
    setRhythmicGrid: (b) => {
      writeStoredBool(STORAGE_KEY_RHYTHMIC, b);
      set({ rhythmicGrid: b });
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
