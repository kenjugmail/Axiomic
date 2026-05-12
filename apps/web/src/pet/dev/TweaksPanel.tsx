// Phase 8E (prototype parity) — TweaksPanel.
//
// Floating bottom-right panel ported from the prototype's
// tweaks-panel.jsx + app.jsx Tweaks section. Lets designers /
// developers see how the pet system responds to direction / theme /
// accent / density / rarity-intensity / pet-size changes in real
// time, plus demo controls for re-triggering level-up + reset.
//
// Visibility: ONLY rendered when isDevTweaksEnabled() returns true.
// In dev (`import.meta.env.DEV === true`) it's always on. In prod
// builds it requires `localStorage.devTweaks = "1"` so a designer
// can opt in without a flag flip.

import { useState } from "react";
import { useThemeStore, type Theme, type Direction, DIRECTION_OPTIONS } from "../../stores/theme";
import { useDevSpeciesSet } from "./DevSpeciesContext";
import { petMoments } from "../store";
import { ConfirmDialog } from "../components/ConfirmDialog";
import {
  TweakSection,
  TweakSelect,
  TweakRadio,
  TweakColor,
  TweakSlider,
  TweakButton,
} from "./TweakControls";

const ACCENT_OPTIONS: Record<Direction, string[]> = {
  "warm-scholarly": ["#7a4cc7", "#b45309", "#1f7a4a", "#1d4ed8"],
  "academic-neutral": ["#1d4ed8", "#7c3aed", "#dc2626", "#0f766e"],
  "modern-productivity": ["#5b5bd6", "#dc2626", "#059669", "#d97706"],
  "tech-forward": ["#6ee7b7", "#38bdf8", "#fbbf24", "#f87171"],
  "editorial-print": ["#8a2c2c", "#2a5c8a", "#4a6a2c", "#6a2c8a"],
};

const SPECIES_OPTIONS = [
  "cat",
  "dog",
  "fox",
  "owl",
  "rabbit",
  "turtle",
  "dragon",
  "penguin",
  "bear",
  "hedgehog",
  "axolotl",
  "frog",
  "panda",
  "capybara",
  "otter",
  "ferret",
  "seal",
];

export function isDevTweaksEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem("axiomic.devTweaks") === "1";
  } catch {
    return false;
  }
}

export function TweaksPanel(): JSX.Element | null {
  const theme = useThemeStore((s) => s.theme);
  const direction = useThemeStore((s) => s.direction);
  const density = useThemeStore((s) => s.density);
  const rarityI = useThemeStore((s) => s.rarityIntensity);
  const setTheme = useThemeStore((s) => s.setTheme);
  const setDirection = useThemeStore((s) => s.setDirection);
  const setDensity = useThemeStore((s) => s.setDensity);
  const setRarityIntensity = useThemeStore((s) => s.setRarityIntensity);
  const setDevSpecies = useDevSpeciesSet();

  const [open, setOpen] = useState(true);
  const [species, setSpecies] = useState<string>("");
  const [accent, setAccent] = useState<string>(
    ACCENT_OPTIONS[direction]?.[0] ?? "#7a4cc7",
  );
  const [confirmReset, setConfirmReset] = useState(false);

  if (!isDevTweaksEnabled()) return null;

  const applyAccent = (c: string) => {
    setAccent(c);
    document.documentElement.style.setProperty("--accent", c);
  };

  const onSpeciesChange = (s: string) => {
    setSpecies(s);
    setDevSpecies(s || null);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 2147483646,
          padding: "6px 10px",
          borderRadius: 999,
          background: "rgba(250,249,247,.78)",
          color: "#29261b",
          border: ".5px solid rgba(0,0,0,.1)",
          backdropFilter: "blur(20px) saturate(140%)",
          boxShadow: "0 8px 24px rgba(0,0,0,.15)",
          fontSize: 11,
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          fontWeight: 500,
        }}
      >
        Tweaks
      </button>
    );
  }

  return (
    <>
      <aside
        style={{
          position: "fixed",
          right: 16,
          bottom: 16,
          zIndex: 2147483646,
          width: 280,
          maxHeight: "calc(100vh - 32px)",
          display: "flex",
          flexDirection: "column",
          background: "rgba(250,249,247,.78)",
          color: "#29261b",
          backdropFilter: "blur(24px) saturate(160%)",
          border: ".5px solid rgba(255,255,255,.6)",
          borderRadius: 14,
          boxShadow:
            "0 1px 0 rgba(255,255,255,.5) inset, 0 12px 40px rgba(0,0,0,.18)",
          font: "11.5px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif",
          overflow: "hidden",
        }}
        aria-label="Tweaks panel"
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 8px 10px 14px",
            userSelect: "none",
            borderBottom: ".5px solid rgba(0,0,0,.06)",
          }}
        >
          <b style={{ fontSize: 12, fontWeight: 600 }}>Tweaks</b>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close tweaks panel"
            style={{
              appearance: "none",
              border: 0,
              background: "transparent",
              color: "rgba(41,38,27,.55)",
              width: 22,
              height: 22,
              borderRadius: 6,
              fontSize: 13,
              cursor: "default",
            }}
          >
            ×
          </button>
        </header>
        <div
          style={{
            padding: "2px 14px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            overflowY: "auto",
            overflowX: "hidden",
            minHeight: 0,
          }}
        >
          <TweakSection label="Direction" />
          <TweakSelect
            label="Visual direction"
            value={direction}
            options={DIRECTION_OPTIONS.map((d) => ({
              value: d.value,
              label: d.label,
            }))}
            onChange={(v) => setDirection(v as Direction)}
          />
          <TweakRadio<Theme>
            label="Theme"
            value={theme}
            options={["light", "dark"]}
            onChange={(v) => setTheme(v)}
          />
          <TweakColor
            label="Accent"
            value={accent}
            options={ACCENT_OPTIONS[direction] ?? ACCENT_OPTIONS["warm-scholarly"]}
            onChange={applyAccent}
          />

          <TweakSection label="Pets" />
          <TweakSelect
            label="Species (test)"
            value={species}
            options={[
              { value: "", label: "(use your actual pet)" },
              ...SPECIES_OPTIONS.map((s) => ({ value: s, label: s })),
            ]}
            onChange={onSpeciesChange}
          />

          <TweakSection label="System" />
          <TweakSlider
            label="Rarity intensity"
            value={rarityI}
            min={0}
            max={1.2}
            step={0.05}
            onChange={(v) => setRarityIntensity(v)}
          />
          <TweakSlider
            label="Density"
            value={density}
            min={0}
            max={1}
            step={0.05}
            onChange={(v) => setDensity(v)}
          />

          <TweakSection label="Demo controls" />
          <TweakButton
            label="Trigger level-up"
            onClick={() => {
              petMoments.show({
                kind: "level-up",
                pet: {
                  species: "fox",
                  level: 2,
                  maxLevel: 3,
                  name: "Aristotle",
                  speciesLabel: "Fox",
                },
              });
            }}
          />
          <TweakButton
            label="Reset state"
            variant="danger"
            onClick={() => setConfirmReset(true)}
          />
        </div>
      </aside>
      <ConfirmDialog
        open={confirmReset}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          try {
            localStorage.clear();
          } catch {
            /* ignore */
          }
          window.location.reload();
        }}
        title="Reset all local state?"
        body="This clears localStorage (theme, tweaks, draft caches) and reloads the page. Your account data on the server is untouched."
        confirmLabel="Reset and reload"
        danger
      />
    </>
  );
}
