import { useState } from "react";

// Double-entry bookkeeping. Step through a young company's
// transactions: each posts equal debits + credits, and the accounting
// equation Assets = Liabilities + Equity stays balanced at every step —
// the invariant Luca Pacioli codified in 1494.

const W = 460;
const H = 320;

type AcctType = "A" | "L" | "E";
interface Acct {
  name: string;
  type: AcctType;
  bal: number;
}
interface Stage {
  label: string;
  entry: string;
  accts: Acct[];
}

const STAGES: Stage[] = [
  {
    label: "Invest",
    entry: "Dr Cash 50,000 / Cr Owner's Equity 50,000",
    accts: [
      { name: "Cash", type: "A", bal: 50000 },
      { name: "Owner's Equity", type: "E", bal: 50000 },
    ],
  },
  {
    label: "Buy equip",
    entry: "Dr Equipment 20,000 / Cr Cash 20,000",
    accts: [
      { name: "Cash", type: "A", bal: 30000 },
      { name: "Equipment", type: "A", bal: 20000 },
      { name: "Owner's Equity", type: "E", bal: 50000 },
    ],
  },
  {
    label: "Borrow",
    entry: "Dr Cash 30,000 / Cr Loan Payable 30,000",
    accts: [
      { name: "Cash", type: "A", bal: 60000 },
      { name: "Equipment", type: "A", bal: 20000 },
      { name: "Loan Payable", type: "L", bal: 30000 },
      { name: "Owner's Equity", type: "E", bal: 50000 },
    ],
  },
  {
    label: "Earn rev",
    entry: "Dr Cash 10,000 / Cr Revenue 10,000",
    accts: [
      { name: "Cash", type: "A", bal: 70000 },
      { name: "Equipment", type: "A", bal: 20000 },
      { name: "Loan Payable", type: "L", bal: 30000 },
      { name: "Owner's Equity", type: "E", bal: 50000 },
      { name: "Revenue", type: "E", bal: 10000 },
    ],
  },
];

const TYPE_COLOR: Record<AcctType, string> = { A: "#38bdf8", L: "#fbbf24", E: "#4ade80" };
const fmt = (n: number) => n.toLocaleString("en-US");

interface Props {
  stage?: number;
}

export function LedgerTAccounts({ stage: ctlStage }: Props = {}) {
  const [intStage, setIntStage] = useState(0);
  const idx = Math.min(ctlStage ?? intStage, STAGES.length - 1);
  const stage = STAGES[idx];
  const sum = (t: AcctType) =>
    stage.accts.filter((a) => a.type === t).reduce((s, a) => s + a.bal, 0);
  const A = sum("A");
  const L = sum("L");
  const E = sum("E");
  const balanced = A === L + E;
  const barX = 16;
  const barW = W - 32;
  const scale = A > 0 ? barW / A : 0;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">Double-entry ledger</div>
        <div className="flex gap-1">
          {STAGES.map((s, i) => (
            <button
              key={s.label}
              onClick={() => setIntStage(i)}
              disabled={ctlStage !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                idx === i
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent"
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto bg-[#0b1228] rounded-md"
        role="img"
        aria-label="Double-entry T-accounts and the accounting equation"
      >
        <text x={16} y={20} fill="#cbd1e6" fontSize="10">Journal entry: <tspan fill="#fff" fontWeight="bold">{stage.entry}</tspan></text>

        {/* T-accounts as type-colored boxes */}
        {stage.accts.map((a, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const bx = 16 + col * 150;
          const by = 36 + row * 70;
          return (
            <g key={a.name}>
              <rect x={bx} y={by} width={138} height={58} rx={4} fill={TYPE_COLOR[a.type]} fillOpacity={0.12} stroke={TYPE_COLOR[a.type]} strokeWidth={1} />
              <text x={bx + 8} y={by + 16} fill={TYPE_COLOR[a.type]} fontSize="10" fontWeight="bold">{a.name}</text>
              <text x={bx + 8} y={by + 34} fill="#9aa3b8" fontSize="8">{a.type === "A" ? "debit bal" : "credit bal"}</text>
              <text x={bx + 130} y={by + 48} fill="#fff" fontSize="14" textAnchor="end" fontWeight="bold">{fmt(a.bal)}</text>
            </g>
          );
        })}

        {/* Accounting equation bar */}
        <text x={16} y={H - 70} fill="#cbd1e6" fontSize="10">Assets = Liabilities + Equity {balanced ? <tspan fill="#4ade80">✓ balanced</tspan> : <tspan fill="#ff6b6b">✗</tspan>}</text>
        <g transform={`translate(0 ${H - 58})`}>
          <rect x={barX} y={0} width={Math.max(0, A * scale)} height={22} fill={TYPE_COLOR.A} fillOpacity={0.5} stroke={TYPE_COLOR.A} />
          <text x={barX + 6} y={15} fill="#fff" fontSize="10">A {fmt(A)}</text>
          <rect x={barX} y={28} width={Math.max(0, L * scale)} height={22} fill={TYPE_COLOR.L} fillOpacity={0.5} stroke={TYPE_COLOR.L} />
          <rect x={barX + Math.max(0, L * scale)} y={28} width={Math.max(0, E * scale)} height={22} fill={TYPE_COLOR.E} fillOpacity={0.5} stroke={TYPE_COLOR.E} />
          <text x={barX + 6} y={43} fill="#fff" fontSize="10">L {fmt(L)} + E {fmt(E)}</text>
        </g>
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Every transaction posts equal <b>debits</b> and <b>credits</b>, so
        Assets always equal Liabilities + Equity — the self-checking
        invariant of double-entry bookkeeping, codified by Luca Pacioli in
        his 1494 <i>Summa de arithmetica</i> and used by the Medici banks
        before him. Assets carry debit balances; liabilities + equity carry
        credit balances. This equation is the skeleton of the balance sheet
        and the reason the books must "balance."
      </div>
    </div>
  );
}
