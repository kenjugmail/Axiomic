import { useState } from "react";

// Password hashing + key stretching. A password must never be stored
// directly, nor under a single fast hash: a modern GPU computes ~10^10
// SHA-256/sec, so any human-memorable password falls quickly. KEY
// STRETCHING (bcrypt, PBKDF2, scrypt, Argon2) deliberately repeats the hash
// 2^cost times, dividing the attacker's guess rate by the same factor and
// turning a seconds-long crack into centuries. A per-user SALT is stored
// alongside so identical passwords get different hashes — defeating
// precomputed "rainbow tables" and shared cracking across users.

const W = 460;
const H = 300;
const GPU = 1e10; // fast-hash guesses/sec on one modern GPU
const ENTROPY = 44; // bits in a decent password (worst-case 2^44 guesses)

const PRESETS = [
  { label: "Fast hash", w: 0 },
  { label: "bcrypt cost 12", w: 12 },
  { label: "PBKDF2 600k", w: 19 },
];

function humanize(sec: number): string {
  if (sec < 1) return "< 1 second";
  if (sec < 60) return `${sec.toFixed(0)} seconds`;
  if (sec < 3600) return `${(sec / 60).toFixed(0)} minutes`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)} hours`;
  if (sec < 3.15e7) return `${(sec / 86400).toFixed(0)} days`;
  const yr = sec / 3.15e7;
  if (yr < 1e6) return `${Math.round(yr).toLocaleString()} years`;
  return `${(yr / 1e6).toExponential(1)} million yr`;
}

interface Props {
  scheme?: string;
}

export function KeyStretching({ scheme: ctl }: Props = {}) {
  const [intW, setIntW] = useState(0);
  const w = ctl ? (PRESETS.find((p) => p.label === ctl)?.w ?? 0) : intW;
  const rate = GPU / Math.pow(2, w);
  const crackSec = Math.pow(2, ENTROPY) / rate;
  const safe = crackSec > 3.15e7 * 100; // > 100 years

  const barX = 60, barMaxW = W - 120;
  // log scale for rate: 10^0 .. 10^10
  const logRate = Math.max(0, Math.log10(rate));
  const rateW = (logRate / 10) * barMaxW;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold" style={{ color: safe ? "#4ade80" : "#f87171" }}>
          crack time ≈ {humanize(crackSec)} {safe ? "✓" : "⚠"}
        </div>
        <div className="flex gap-1">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setIntW(p.w)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${w === p.w ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{p.label}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Password key stretching: work factor versus crack time">
        {/* pipeline diagram */}
        <rect x={30} y={24} width={70} height={26} rx={4} fill="#0e1a3a" stroke="#38bdf8" strokeWidth={1} />
        <text x={65} y={41} fill="#e5e9f5" fontSize="8.5" textAnchor="middle">password</text>
        <text x={118} y={41} fill="#fbbf24" fontSize="11" textAnchor="middle">+</text>
        <rect x={132} y={24} width={50} height={26} rx={4} fill="#1a2e1a" stroke="#4ade80" strokeWidth={1} />
        <text x={157} y={41} fill="#e5e9f5" fontSize="8.5" textAnchor="middle">salt</text>
        <line x1={184} y1={37} x2={208} y2={37} stroke="#64748b" strokeWidth={1} markerEnd="url(#ksA)" />
        <rect x={210} y={22} width={110} height={30} rx={4} fill="#0e1a3a" stroke="#a78bfa" strokeWidth={1} />
        <text x={265} y={37} fill="#e5e9f5" fontSize="8" textAnchor="middle">hash × 2^{w}</text>
        <text x={265} y={47} fill="#9aa3b8" fontSize="7" textAnchor="middle">{Math.pow(2, w).toLocaleString()} iterations</text>
        <line x1={322} y1={37} x2={346} y2={37} stroke="#64748b" strokeWidth={1} markerEnd="url(#ksA)" />
        <rect x={348} y={24} width={82} height={26} rx={4} fill="#111a33" stroke="#334155" strokeWidth={1} />
        <text x={389} y={41} fill="#cbd1e6" fontSize="8" textAnchor="middle">stored hash</text>
        <defs><marker id="ksA" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 Z" fill="#64748b" /></marker></defs>

        {/* attacker guess rate (log scale) */}
        <text x={barX} y={92} fill="#9aa3b8" fontSize="8.5">attacker guess rate (1 GPU, log scale)</text>
        <rect x={barX} y={100} width={barMaxW} height={16} rx={3} fill="#111a33" />
        <rect x={barX} y={100} width={rateW} height={16} rx={3} fill={safe ? "#4ade80" : "#f87171"} />
        <text x={barX + barMaxW + 6} y={112} fill="#e5e9f5" fontSize="8.5">{rate.toExponential(1)}/s</text>
        {[0, 2, 4, 6, 8, 10].map((e) => (
          <text key={e} x={barX + (e / 10) * barMaxW} y={128} fill="#64748b" fontSize="7" textAnchor="middle">10^{e}</text>
        ))}

        {/* crack-time readout */}
        <rect x={barX} y={146} width={barMaxW} height={56} rx={6} fill={safe ? "#0d2417" : "#2a1212"} stroke={safe ? "#4ade80" : "#f87171"} strokeWidth={1.2} />
        <text x={barX + barMaxW / 2} y={168} fill="#cbd1e6" fontSize="9" textAnchor="middle">time to brute-force a {ENTROPY}-bit password</text>
        <text x={barX + barMaxW / 2} y={190} fill={safe ? "#4ade80" : "#f87171"} fontSize="15" textAnchor="middle" fontWeight="bold">{humanize(crackSec)}</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">work factor (2^cost iterations): cost = {w}
          <input type="range" min={0} max={20} step={1} value={w} onChange={(e) => setIntW(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Key-stretching work factor" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Each extra unit of <b>cost</b> doubles the work per guess, halving the
        attacker's rate — so a cost-12 <b>bcrypt</b> hash is 4096× slower to
        attack than a raw hash, and PBKDF2 at 600k iterations pushes a decent
        password from seconds to millennia. The stored <b>salt</b> doesn't
        slow a single guess but makes precomputation (<b>rainbow tables</b>)
        and cross-user cracking useless. Modern guidance (OWASP) favors
        <b> Argon2</b> or bcrypt with a tuned cost — never a bare SHA-256.
      </div>
    </div>
  );
}
