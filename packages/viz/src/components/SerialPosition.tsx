import { useMemo, useState } from "react";

// The serial-position effect. Asked to recall a list, people remember the
// FIRST items well (the primacy effect — they've been rehearsed into
// long-term memory) and the LAST items well (the recency effect — still in
// short-term memory), but sag in the middle, giving the classic U-shaped
// curve. Glanzer & Cunitz (1966) showed the two ends are dissociable: a
// filled delay before recall wipes out RECENCY (short-term memory clears)
// while leaving PRIMACY intact — strong evidence for distinct memory stores.

const W = 460;
const H = 300;
const L = 15; // list length

type Mode = "Immediate recall" | "Delayed recall";
const ORDER: Mode[] = ["Immediate recall", "Delayed recall"];

function recall(p: number, mode: Mode): number {
  const base = 0.18;
  const primacy = 0.55 * Math.exp(-(p - 1) / 2.2);
  const recency = mode === "Immediate recall" ? 0.6 * Math.exp(-(L - p) / 2.0) : 0;
  return Math.min(0.98, base + primacy + recency);
}

interface Props { mode?: Mode; }

export function SerialPosition({ mode: ctl }: Props = {}) {
  const [intMode, setIntMode] = useState<Mode>("Immediate recall");
  const mode = ctl ?? intMode;

  const baseX = 44, baseY = 250, plotW = W - baseX - 16, plotH = 200;
  const xOf = (p: number) => baseX + ((p - 1) / (L - 1)) * plotW;
  const yOf = (r: number) => baseY - r * plotH;

  const path = useMemo(() => {
    const pts: string[] = [];
    for (let p = 1; p <= L; p++) pts.push(`${p === 1 ? "M" : "L"}${xOf(p).toFixed(1)},${yOf(recall(p, mode)).toFixed(1)}`);
    return pts.join(" ");
  }, [mode]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{mode}{mode === "Delayed recall" ? " — recency gone" : " — primacy + recency"}</div>
        <div className="flex gap-1">
          {ORDER.map((m) => (
            <button key={m} onClick={() => setIntMode(m)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${mode === m ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{m === "Immediate recall" ? "Immediate" : "Delayed"}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Serial position recall curve">
        <line x1={baseX} y1={baseY} x2={baseX + plotW} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        <line x1={baseX} y1={baseY - plotH} x2={baseX} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[0.25, 0.5, 0.75, 1].map((r) => (<g key={r}><line x1={baseX} y1={yOf(r)} x2={baseX + plotW} y2={yOf(r)} stroke="#1f2937" strokeWidth={0.3} /><text x={baseX - 4} y={yOf(r) + 3} fill="#9aa3b8" fontSize="7.5" textAnchor="end">{Math.round(r * 100)}</text></g>))}
        {[1, 5, 10, 15].map((p) => (<text key={p} x={xOf(p)} y={baseY + 12} fill="#9aa3b8" fontSize="8" textAnchor="middle">{p}</text>))}
        <text x={baseX + plotW / 2} y={baseY + 26} fill="#cbd1e6" fontSize="8.5" textAnchor="middle">serial position in list</text>
        <text x={14} y={baseY - plotH / 2} fill="#cbd1e6" fontSize="8.5" textAnchor="middle" transform={`rotate(-90 14 ${baseY - plotH / 2})`}>recall (%)</text>

        {/* region labels */}
        <text x={xOf(2)} y={yOf(recall(1, mode)) - 8} fill="#38bdf8" fontSize="8">primacy</text>
        <text x={xOf(13)} y={mode === "Immediate recall" ? yOf(recall(L, mode)) - 8 : yOf(recall(L, mode)) + 14} fill={mode === "Immediate recall" ? "#4ade80" : "#f87171"} fontSize="8" textAnchor="middle">{mode === "Immediate recall" ? "recency" : "(no recency)"}</text>

        <path d={path} fill="none" stroke="#fbbf24" strokeWidth={2.2} />
        {Array.from({ length: L }).map((_, i) => { const p = i + 1; return <circle key={p} cx={xOf(p)} cy={yOf(recall(p, mode))} r={3} fill="#fbbf24" />; })}
      </svg>

      <div className="mt-1 text-[10px] text-muted-foreground">
        Recall is highest for the <b>first</b> items (<b>primacy</b> —
        rehearsed into long-term memory) and the <b>last</b> items
        (<b>recency</b> — still in short-term memory), dipping in the middle:
        the U-shaped <b>serial-position curve</b>. Inserting a brief
        distractor task before recall (<b>Delayed</b>) flushes short-term
        memory and erases the recency tail while primacy survives — Glanzer &
        Cunitz's classic dissociation of the two memory systems.
      </div>
    </div>
  );
}
