import { useState } from "react";

// Diffie–Hellman key exchange (Whitfield Diffie & Martin Hellman, 1976;
// the core idea was also found earlier in secret by Malcolm Williamson at
// GCHQ). Alice and Bob agree on a public prime p and generator g. Each
// picks a secret exponent (a, b), publishes g^x mod p, and raises the
// OTHER party's public value to their own secret. Both arrive at the same
// shared secret g^(ab) mod p — yet an eavesdropper who sees g, p, A, B
// must solve the discrete logarithm problem to recover it, which is
// believed intractable for large p. This is the asymmetric primitive
// behind TLS key agreement (its elliptic-curve form, ECDHE).

const W = 480;
const H = 350;

function modpow(base: number, exp: number, mod: number): number {
  let r = 1;
  base %= mod;
  while (exp > 0) {
    if (exp & 1) r = (r * base) % mod;
    base = (base * base) % mod;
    exp = Math.floor(exp / 2);
  }
  return r;
}

const PRESETS: Record<string, { g: number; p: number }> = {
  "g=5, p=23": { g: 5, p: 23 },
  "g=2, p=97": { g: 2, p: 97 },
};
const PRESET_ORDER = ["g=5, p=23", "g=2, p=97"];

interface Props {
  preset?: keyof typeof PRESETS;
}

export function KeyExchange({ preset: ctl }: Props = {}) {
  const [intPreset, setIntPreset] = useState<string>("g=5, p=23");
  const [rawA, setRawA] = useState(6);
  const [rawB, setRawB] = useState(15);
  const key = ctl ?? intPreset;
  const { g, p } = PRESETS[key];

  const a = Math.min(rawA, p - 2);
  const b = Math.min(rawB, p - 2);
  const A = modpow(g, a, p); // Alice public
  const B = modpow(g, b, p); // Bob public
  const sA = modpow(B, a, p); // Alice computes
  const sB = modpow(A, b, p); // Bob computes
  const agree = sA === sB;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">
          shared secret = {sA} {agree ? "✓ (both sides match)" : "✗"}
        </div>
        <div className="flex gap-1">
          {PRESET_ORDER.map((k) => (
            <button
              key={k}
              onClick={() => setIntPreset(k)}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                key === k
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Diffie-Hellman key exchange"
      >
        {/* public parameters */}
        <text x={W / 2} y={20} fill="#cbd1e6" fontSize="10" textAnchor="middle">
          public: generator g = {g}, prime p = {p}
        </text>

        {/* Alice */}
        <rect x={16} y={36} width={150} height={92} rx={6} fill="#0e1a3a" stroke="#38bdf8" strokeWidth={1} />
        <text x={91} y={52} fill="#38bdf8" fontSize="10" textAnchor="middle" fontWeight="bold">Alice</text>
        <text x={26} y={70} fill="#9aa3b8" fontSize="8.5">secret a = {a}</text>
        <text x={26} y={86} fill="#e5e9f5" fontSize="8.5">A = g^a mod p = {A}</text>
        <text x={26} y={108} fill="#4ade80" fontSize="8.5">B^a mod p = {sA}</text>

        {/* Bob */}
        <rect x={314} y={36} width={150} height={92} rx={6} fill="#0e1a3a" stroke="#a78bfa" strokeWidth={1} />
        <text x={389} y={52} fill="#a78bfa" fontSize="10" textAnchor="middle" fontWeight="bold">Bob</text>
        <text x={324} y={70} fill="#9aa3b8" fontSize="8.5">secret b = {b}</text>
        <text x={324} y={86} fill="#e5e9f5" fontSize="8.5">B = g^b mod p = {B}</text>
        <text x={324} y={108} fill="#4ade80" fontSize="8.5">A^b mod p = {sB}</text>

        {/* exchange arrows */}
        <line x1={168} y1={74} x2={312} y2={74} stroke="#38bdf8" strokeWidth={1} markerEnd="url(#kxR)" />
        <text x={240} y={69} fill="#38bdf8" fontSize="8" textAnchor="middle">send A = {A} →</text>
        <line x1={312} y1={92} x2={168} y2={92} stroke="#a78bfa" strokeWidth={1} markerEnd="url(#kxL)" />
        <text x={240} y={104} fill="#a78bfa" fontSize="8" textAnchor="middle">← send B = {B}</text>

        {/* shared secret bar */}
        <rect x={150} y={150} width={180} height={26} rx={5} fill={agree ? "#14321f" : "#3a1414"} stroke={agree ? "#4ade80" : "#f87171"} strokeWidth={1} />
        <text x={240} y={167} fill={agree ? "#4ade80" : "#f87171"} fontSize="10" textAnchor="middle" fontWeight="bold">
          shared key g^(ab) mod p = {sA}
        </text>

        {/* Eve */}
        <rect x={70} y={206} width={340} height={118} rx={6} fill="#160d0d" stroke="#f87171" strokeWidth={0.8} strokeDasharray="4,3" />
        <text x={240} y={224} fill="#f87171" fontSize="10" textAnchor="middle" fontWeight="bold">Eve (eavesdropper) sees everything public</text>
        <text x={240} y={244} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">knows g = {g}, p = {p}, A = {A}, B = {B}</text>
        <text x={240} y={266} fill="#9aa3b8" fontSize="8.5" textAnchor="middle">to get the secret she must find a from A = g^a mod p</text>
        <text x={240} y={284} fill="#fbbf24" fontSize="9" textAnchor="middle" fontWeight="bold">⚠ the DISCRETE LOGARITHM problem</text>
        <text x={240} y={302} fill="#9aa3b8" fontSize="8" textAnchor="middle">trivial for p = {p}, but believed intractable for 2048-bit p</text>
        <text x={240} y={318} fill="#9aa3b8" fontSize="8" textAnchor="middle">she never sees a, b, or g^(ab) mod p</text>

        <defs>
          <marker id="kxR" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#38bdf8" /></marker>
          <marker id="kxL" markerWidth="7" markerHeight="7" refX="2" refY="3.5" orient="auto"><path d="M7,0 L0,3.5 L7,7 Z" fill="#a78bfa" /></marker>
        </defs>
      </svg>

      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <label className="block">
          Alice secret a = {a}
          <input type="range" min={2} max={p - 2} step={1} value={a} onChange={(e) => setRawA(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Alice secret exponent" />
        </label>
        <label className="block">
          Bob secret b = {b}
          <input type="range" min={2} max={p - 2} step={1} value={b} onChange={(e) => setRawB(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Bob secret exponent" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>Diffie–Hellman</b> (1976) lets two parties derive a shared key over
        a public channel without ever transmitting a secret. Both compute
        <b> g^(ab) mod p</b> — Alice as B^a, Bob as A^b — because exponentiation
        commutes. Security rests on the <b>discrete logarithm problem</b>:
        recovering a from g^a mod p is easy here but believed infeasible for
        a 2048-bit prime. Modern TLS uses the elliptic-curve variant
        <b> ECDHE</b> for forward secrecy. Contrast <b>RSA</b> (Rivest–Shamir–
        Adleman, 1977), whose hardness rests instead on integer factorization.
      </div>
    </div>
  );
}
