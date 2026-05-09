// Sprint 65a — AI tutor user settings persisted in localStorage.
//
// Today the sidebar exposes coach suggestions + auto-mode-routing on
// every open. Some users find the suggestions noisy or the auto-mode
// surprising. This loader gives them an off switch without rolling
// back the underlying behavior server-side.
//
// Defaults preserve existing behavior — both flags true.

const STORAGE_KEY = "axiomic.ai.settings";

export interface AITutorSettings {
  showSuggestions: boolean;
  autoSelectMode: boolean;
}

export const DEFAULT_SETTINGS: AITutorSettings = {
  showSuggestions: true,
  autoSelectMode: true,
};

export function loadAISettings(): AITutorSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { ...DEFAULT_SETTINGS };
    return {
      showSuggestions:
        typeof parsed.showSuggestions === "boolean"
          ? parsed.showSuggestions
          : DEFAULT_SETTINGS.showSuggestions,
      autoSelectMode:
        typeof parsed.autoSelectMode === "boolean"
          ? parsed.autoSelectMode
          : DEFAULT_SETTINGS.autoSelectMode,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAISettings(settings: AITutorSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage unavailable; silent.
  }
}
