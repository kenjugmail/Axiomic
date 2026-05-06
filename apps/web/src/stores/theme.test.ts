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
