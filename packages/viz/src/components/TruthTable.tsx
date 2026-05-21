import { useMemo, useState } from "react";

// Interactive propositional-logic truth table. Pick a formula
// template; toggle atoms P, Q, R; see all 2^n rows + the truth
// value of the formula at each. Tautologies / contradictions
// highlighted. Connectives: ¬ ∧ ∨ → ↔. Boolean evaluator is a
// hand-rolled recursive-descent parser.

const W = 460;
const H = 320;

type Env = Record<string, boolean>;

// Tokenize then parse the small grammar:
//   formula := iff
//   iff     := imp ('<->' imp)*
//   imp     := or ('->' or)*
//   or      := and ('|' and | 'v' and)*
//   and     := not ('&' not | '^' not)*
//   not     := '!' not | '~' not | atom
//   atom    := letter | '(' formula ')'

type Tok =
  | { t: "atom"; v: string }
  | { t: "op"; v: "!" | "&" | "|" | "->" | "<->" }
  | { t: "lp" }
  | { t: "rp" };

function tokenize(s: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") {
      i++;
      continue;
    }
    if (c === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (c === "!" || c === "~" || c === "¬") { toks.push({ t: "op", v: "!" }); i++; continue; }
    if (c === "&" || c === "∧") { toks.push({ t: "op", v: "&" }); i++; continue; }
    if (c === "|" || c === "∨" || c === "v") { toks.push({ t: "op", v: "|" }); i++; continue; }
    if (s.slice(i, i + 3) === "<->" || s.slice(i, i + 1) === "↔") { toks.push({ t: "op", v: "<->" }); i += s.slice(i, i + 3) === "<->" ? 3 : 1; continue; }
    if (s.slice(i, i + 2) === "->" || s.slice(i, i + 1) === "→") { toks.push({ t: "op", v: "->" }); i += s.slice(i, i + 2) === "->" ? 2 : 1; continue; }
    if (/[A-Za-z]/.test(c)) { toks.push({ t: "atom", v: c }); i++; continue; }
    i++;
  }
  return toks;
}

function parse(toks: Tok[]): (env: Env) => boolean {
  let pos = 0;
  function peek(): Tok | undefined { return toks[pos]; }
  function eat(): Tok | undefined { return toks[pos++]; }
  function parseAtom(): (env: Env) => boolean {
    const tok = peek();
    if (!tok) return () => false;
    if (tok.t === "lp") {
      eat();
      const e = parseIff();
      if (peek()?.t === "rp") eat();
      return e;
    }
    if (tok.t === "atom") {
      eat();
      return (env: Env) => env[tok.v] ?? false;
    }
    return () => false;
  }
  function parseNot(): (env: Env) => boolean {
    const tok = peek();
    if (tok && tok.t === "op" && tok.v === "!") {
      eat();
      const sub = parseNot();
      return (env) => !sub(env);
    }
    return parseAtom();
  }
  function parseAnd(): (env: Env) => boolean {
    let left = parseNot();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "&") {
      eat();
      const right = parseNot();
      const l = left;
      left = (env) => l(env) && right(env);
    }
    return left;
  }
  function parseOr(): (env: Env) => boolean {
    let left = parseAnd();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "|") {
      eat();
      const right = parseAnd();
      const l = left;
      left = (env) => l(env) || right(env);
    }
    return left;
  }
  function parseImp(): (env: Env) => boolean {
    let left = parseOr();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "->") {
      eat();
      const right = parseOr();
      const l = left;
      left = (env) => !l(env) || right(env);
    }
    return left;
  }
  function parseIff(): (env: Env) => boolean {
    let left = parseImp();
    while (peek()?.t === "op" && (peek() as { v: string }).v === "<->") {
      eat();
      const right = parseImp();
      const l = left;
      left = (env) => l(env) === right(env);
    }
    return left;
  }
  return parseIff();
}

function uniqueAtoms(toks: Tok[]): string[] {
  const set = new Set<string>();
  for (const t of toks) if (t.t === "atom") set.add(t.v);
  return Array.from(set).sort();
}

const PRESETS: Array<{ label: string; formula: string }> = [
  { label: "P→Q", formula: "P -> Q" },
  { label: "¬(P∧Q)", formula: "!(P & Q)" },
  { label: "P∨¬P (LEM)", formula: "P | !P" },
  { label: "(P→Q)↔(¬P∨Q)", formula: "(P -> Q) <-> (!P | Q)" },
  { label: "modus ponens", formula: "((P -> Q) & P) -> Q" },
];

interface Props {
  formula?: string;
}

export function TruthTable({ formula: ctlFormula }: Props = {}) {
  const [formula, setFormula] = useState(ctlFormula ?? "P -> Q");
  const { rows, atoms, fn, allTrue, allFalse } = useMemo(() => {
    const toks = tokenize(formula);
    const atoms = uniqueAtoms(toks);
    const fn = parse(toks);
    const rows: Array<{ env: Env; value: boolean }> = [];
    const N = atoms.length;
    if (N === 0 || N > 5) {
      return { rows: [], atoms, fn, allTrue: false, allFalse: false };
    }
    for (let mask = 0; mask < (1 << N); mask++) {
      const env: Env = {};
      for (let i = 0; i < N; i++) {
        env[atoms[i]] = ((mask >> (N - 1 - i)) & 1) === 1;
      }
      rows.push({ env, value: fn(env) });
    }
    const allTrue = rows.length > 0 && rows.every((r) => r.value);
    const allFalse = rows.length > 0 && rows.every((r) => !r.value);
    return { rows, atoms, fn, allTrue, allFalse };
  }, [formula]);

  const status = allTrue ? "tautology" : allFalse ? "contradiction" : "contingent";
  const statusColor = allTrue ? "#4ecdc4" : allFalse ? "#ff6b6b" : "#fbbf24";

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Truth table · <span style={{ color: statusColor }}>{status}</span> · {atoms.length} atom{atoms.length === 1 ? "" : "s"}</div>
      </div>
      <input
        type="text"
        value={formula}
        onChange={(e) => setFormula(e.target.value)}
        disabled={ctlFormula !== undefined}
        className="w-full px-2 py-1 mb-2 rounded border border-border bg-background text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="e.g. (P -> Q) & (Q -> P)"
        aria-label="Formula"
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Truth table">
        {rows.length === 0 ? (
          <text x={W / 2} y={H / 2} fill="#ff6b6b" fontSize="11" textAnchor="middle">parse error or too many atoms (max 5)</text>
        ) : (() => {
          const colW = Math.min(70, (W - 80) / (atoms.length + 1));
          const rowH = Math.min(20, (H - 50) / (rows.length + 1));
          const x0 = 24;
          const y0 = 24;
          return (
            <g>
              {/* Header */}
              {atoms.map((a, i) => (
                <text key={`h-${a}`} x={x0 + i * colW + colW / 2} y={y0} fill="#cbd1e6" fontSize="11" textAnchor="middle" fontWeight={600}>{a}</text>
              ))}
              <text x={x0 + atoms.length * colW + colW / 2} y={y0} fill="#fbbf24" fontSize="11" textAnchor="middle" fontWeight={600}>formula</text>
              <line x1={x0 - 4} y1={y0 + 4} x2={x0 + (atoms.length + 1) * colW + 4} y2={y0 + 4} stroke="#475569" strokeWidth={0.5} />
              {/* Rows */}
              {rows.map((row, ri) => {
                const ry = y0 + 14 + ri * rowH;
                return (
                  <g key={`r-${ri}`}>
                    {atoms.map((a, i) => (
                      <text key={`v-${ri}-${a}`} x={x0 + i * colW + colW / 2} y={ry + 9} fill={row.env[a] ? "#4ecdc4" : "#9aa3b8"} fontSize="10" textAnchor="middle">{row.env[a] ? "T" : "F"}</text>
                    ))}
                    <text x={x0 + atoms.length * colW + colW / 2} y={ry + 9} fill={row.value ? "#4ecdc4" : "#ff6b6b"} fontSize="10" fontWeight={600} textAnchor="middle">{row.value ? "T" : "F"}</text>
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>

      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span className="text-muted-foreground mr-1">Presets:</span>
        {PRESETS.map((p) => (
          <button key={p.label} onClick={() => setFormula(p.formula)} disabled={ctlFormula !== undefined} className="px-1.5 py-0.5 rounded bg-muted hover:bg-accent">{p.label}</button>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Propositional logic: 2ⁿ rows enumerate all truth assignments
        to n atoms; the formula's column reveals whether it's a
        tautology (all T), contradiction (all F), or contingent.
        Connectives: ¬ (!) negation, ∧ (&) conjunction, ∨ (|)
        disjunction, → (-&gt;) material conditional, ↔ (&lt;-&gt;)
        biconditional. The decidability of propositional logic via
        truth tables contrasts with first-order logic, where validity
        is undecidable (Church-Turing 1936). Frege's 1879
        Begriffsschrift introduced the modern apparatus; Tarski 1933
        defined semantic truth. Modal logic (Kripke 1959) adds □ and
        ◇ over possible worlds.
      </div>
    </div>
  );
}
