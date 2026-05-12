// Phase 8E (prototype parity) — small form-control helpers used by
// TweaksPanel. Ported from tweaks-panel.jsx (TweakSelect, TweakRadio,
// TweakColor, TweakSlider, TweakToggle, TweakButton, TweakSection).
//
// These are intentionally lightweight (no design-system dependency
// beyond inline styles) so the panel stays small and isolated from
// the rest of the app's styling.

import type { CSSProperties, ReactNode } from "react";

const CONTROL_STYLE: CSSProperties = {
  appearance: "none",
  width: "100%",
  height: 26,
  padding: "0 8px",
  border: ".5px solid rgba(0,0,0,.1)",
  borderRadius: 7,
  background: "rgba(255,255,255,.6)",
  color: "inherit",
  font: "inherit",
  outline: "none",
};

const LABEL_STYLE: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  color: "rgba(41,38,27,.72)",
  fontSize: 11.5,
};

const VALUE_STYLE: CSSProperties = {
  color: "rgba(41,38,27,.5)",
  fontVariantNumeric: "tabular-nums",
};

const ROW_STYLE: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
};

export function TweakSection({ label }: { label: string }): JSX.Element {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: ".06em",
        textTransform: "uppercase",
        color: "rgba(41,38,27,.45)",
        padding: "10px 0 0",
      }}
    >
      {label}
    </div>
  );
}

interface SelectOpt {
  value: string;
  label: string;
}

export function TweakSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: SelectOpt[];
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div style={ROW_STYLE}>
      <span style={LABEL_STYLE}>
        <span style={{ fontWeight: 500 }}>{label}</span>
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...CONTROL_STYLE,
          paddingRight: 22,
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>\")",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 8px center",
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function TweakRadio<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: ReadonlyArray<V>;
  onChange: (v: V) => void;
}): JSX.Element {
  return (
    <div style={ROW_STYLE}>
      <span style={LABEL_STYLE}>
        <span style={{ fontWeight: 500 }}>{label}</span>
      </span>
      <div
        style={{
          display: "grid",
          gridAutoFlow: "column",
          gridAutoColumns: "1fr",
          padding: 2,
          borderRadius: 8,
          background: "rgba(0,0,0,.06)",
          gap: 2,
        }}
      >
        {options.map((opt) => {
          const on = opt === value;
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChange(opt)}
              aria-pressed={on}
              style={{
                appearance: "none",
                border: 0,
                borderRadius: 6,
                padding: "4px 6px",
                fontSize: 11,
                cursor: "default",
                color: on ? "#29261b" : "rgba(41,38,27,.6)",
                background: on ? "#fff" : "transparent",
                fontWeight: on ? 600 : 400,
                textTransform: "capitalize",
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TweakColor({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}): JSX.Element {
  return (
    <div style={ROW_STYLE}>
      <span style={LABEL_STYLE}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={VALUE_STYLE}>{value}</span>
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map((c) => {
          const on = c === value;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              aria-pressed={on}
              aria-label={`Pick ${c}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: c,
                border: on
                  ? "2px solid #fff"
                  : "1px solid rgba(0,0,0,.15)",
                outline: on ? `2px solid ${c}` : "none",
                cursor: "default",
                padding: 0,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function TweakSlider({
  label,
  value,
  min,
  max,
  step = 0.01,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div style={ROW_STYLE}>
      <span style={LABEL_STYLE}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={VALUE_STYLE}>
          {step >= 1 ? Math.round(value) : value.toFixed(2)}
          {unit ? unit : ""}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          appearance: "none",
          width: "100%",
          height: 4,
          margin: "6px 0",
          borderRadius: 999,
          background: "rgba(0,0,0,.12)",
          outline: "none",
        }}
      />
    </div>
  );
}

export function TweakToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): JSX.Element {
  return (
    <div
      style={{
        ...ROW_STYLE,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <span style={{ fontSize: 11.5, color: "rgba(41,38,27,.72)" }}>
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        aria-pressed={value}
        style={{
          width: 28,
          height: 16,
          borderRadius: 999,
          background: value ? "#7a4cc7" : "rgba(0,0,0,.18)",
          position: "relative",
          border: 0,
          cursor: "default",
          padding: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: value ? 14 : 2,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: "#fff",
            transition: "left .15s",
            boxShadow: "0 1px 2px rgba(0,0,0,.2)",
          }}
        />
      </button>
    </div>
  );
}

export function TweakButton({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        appearance: "none",
        width: "100%",
        height: 28,
        padding: "0 8px",
        border: ".5px solid rgba(0,0,0,.1)",
        borderRadius: 7,
        background: variant === "danger" ? "rgba(180,40,40,.08)" : "rgba(255,255,255,.6)",
        color: variant === "danger" ? "#b42828" : "#29261b",
        font: "inherit",
        cursor: "default",
      }}
    >
      {label}
    </button>
  );
}

export function TweakRow({ children }: { children: ReactNode }): JSX.Element {
  return <div style={ROW_STYLE}>{children}</div>;
}
