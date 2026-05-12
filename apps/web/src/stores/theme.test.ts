import { describe, test, expect, beforeEach, vi } from "vitest";

// Mock the api module so the theme store doesn't try to PUT settings
// when running in jsdom. This module is imported transitively from the
// theme store; mocking before importing the store is essential.
vi.mock("../lib/api", () => ({
  api: {
    settings: {
      get: vi.fn().mockRejectedValue(new Error("anon")),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

describe("theme store", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-dir");
    document.documentElement.removeAttribute("style");
    localStorage.clear();
    vi.resetModules();
    setMatchMedia(false);
  });

  test("light theme leaves the html bare", async () => {
    setMatchMedia(false);
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(
      document.documentElement.classList.contains("theme-sepia"),
    ).toBe(false);
  });

  test("dark theme adds dark class", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      document.documentElement.classList.contains("theme-dim"),
    ).toBe(false);
  });

  test("dim layers theme-dim on top of dark", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("dim");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(
      document.documentElement.classList.contains("theme-dim"),
    ).toBe(true);
  });

  test("sepia adds theme-sepia and not dark", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("sepia");
    expect(
      document.documentElement.classList.contains("theme-sepia"),
    ).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("high-contrast adds theme-high-contrast (light OS preference)", async () => {
    setMatchMedia(false);
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("high-contrast");
    expect(
      document.documentElement.classList.contains("theme-high-contrast"),
    ).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("high-contrast layers dark when OS prefers dark", async () => {
    setMatchMedia(true);
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("high-contrast");
    expect(
      document.documentElement.classList.contains("theme-high-contrast"),
    ).toBe(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("system follows prefers-color-scheme", async () => {
    setMatchMedia(true);
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("system");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(useThemeStore.getState().theme).toBe("system");
  });

  test("setTheme persists to localStorage", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("sepia");
    expect(localStorage.getItem("axiomic-theme")).toBe("sepia");
  });

  test("switching themes clears the previous theme class", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setTheme("dim");
    expect(
      document.documentElement.classList.contains("theme-dim"),
    ).toBe(true);
    useThemeStore.getState().setTheme("sepia");
    expect(
      document.documentElement.classList.contains("theme-dim"),
    ).toBe(false);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(
      document.documentElement.classList.contains("theme-sepia"),
    ).toBe(true);
  });
});

describe("theme store — direction / density / rarity / rhythmic", () => {
  beforeEach(() => {
    document.documentElement.className = "";
    document.documentElement.removeAttribute("data-dir");
    document.documentElement.removeAttribute("style");
    localStorage.clear();
    vi.resetModules();
    setMatchMedia(false);
  });

  test("setDirection persists + writes data-dir attribute", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setDirection("academic-neutral");
    expect(document.documentElement.getAttribute("data-dir")).toBe(
      "academic-neutral",
    );
    expect(localStorage.getItem("axiomic-direction")).toBe("academic-neutral");
    expect(useThemeStore.getState().direction).toBe("academic-neutral");
  });

  test("setDirection back to warm-scholarly clears the data-dir attribute", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setDirection("tech-forward");
    expect(document.documentElement.getAttribute("data-dir")).toBe(
      "tech-forward",
    );
    useThemeStore.getState().setDirection("warm-scholarly");
    expect(document.documentElement.hasAttribute("data-dir")).toBe(false);
    expect(useThemeStore.getState().direction).toBe("warm-scholarly");
  });

  test("setDensity clamps to [0,1] and writes --density + --pet-dense", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setDensity(0.5);
    expect(document.documentElement.style.getPropertyValue("--density")).toBe(
      "0.5",
    );
    expect(
      document.documentElement.style.getPropertyValue("--pet-dense"),
    ).toBe("32px");

    useThemeStore.getState().setDensity(2);
    expect(useThemeStore.getState().density).toBe(1);
    expect(
      document.documentElement.style.getPropertyValue("--pet-dense"),
    ).toBe("40px");

    useThemeStore.getState().setDensity(-1);
    expect(useThemeStore.getState().density).toBe(0);
    expect(
      document.documentElement.style.getPropertyValue("--pet-dense"),
    ).toBe("24px");
  });

  test("setRarityIntensity clamps and writes --rarity-i", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setRarityIntensity(0.42);
    expect(
      document.documentElement.style.getPropertyValue("--rarity-i"),
    ).toBe("0.42");
    useThemeStore.getState().setRarityIntensity(99);
    expect(useThemeStore.getState().rarityIntensity).toBe(1);
  });

  test("setRhythmicGrid persists boolean and reads back", async () => {
    const { useThemeStore } = await import("./theme");
    useThemeStore.getState().setRhythmicGrid(true);
    expect(useThemeStore.getState().rhythmicGrid).toBe(true);
    expect(localStorage.getItem("axiomic-rhythmic-grid")).toBe("true");
  });

  test("hydrates direction + density + rarity from localStorage on boot", async () => {
    localStorage.setItem("axiomic-direction", "modern-productivity");
    localStorage.setItem("axiomic-density", "0.75");
    localStorage.setItem("axiomic-rarity-i", "0.2");
    localStorage.setItem("axiomic-rhythmic-grid", "true");
    const { useThemeStore } = await import("./theme");
    const s = useThemeStore.getState();
    expect(s.direction).toBe("modern-productivity");
    expect(s.density).toBeCloseTo(0.75);
    expect(s.rarityIntensity).toBeCloseTo(0.2);
    expect(s.rhythmicGrid).toBe(true);
    expect(document.documentElement.getAttribute("data-dir")).toBe(
      "modern-productivity",
    );
    expect(
      document.documentElement.style.getPropertyValue("--pet-dense"),
    ).toBe("36px");
  });

  test("invalid stored direction falls back to warm-scholarly", async () => {
    localStorage.setItem("axiomic-direction", "not-a-real-direction");
    const { useThemeStore } = await import("./theme");
    expect(useThemeStore.getState().direction).toBe("warm-scholarly");
    expect(document.documentElement.hasAttribute("data-dir")).toBe(false);
  });
});
