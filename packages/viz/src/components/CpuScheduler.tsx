import { useMemo, useState } from "react";

// CPU scheduling algorithms on one workload. FCFS runs jobs in arrival
// order (simple, but a long job at the front inflates everyone's wait — the
// "convoy effect"). SJF (shortest-job-first) minimizes average waiting time
// but can starve long jobs and needs burst-length knowledge. Round-robin
// time-slices by a quantum, giving fair, responsive sharing (the basis of
// interactive time-sharing since CTSS/Multics) at the cost of context-switch
// overhead. The Gantt chart + average waiting time make the trade-offs
// concrete.

const W = 480;
const H = 300;

interface Proc { id: number; arrival: number; burst: number; }
const PROCS: Proc[] = [
  { id: 1, arrival: 0, burst: 7 },
  { id: 2, arrival: 2, burst: 4 },
  { id: 3, arrival: 4, burst: 1 },
  { id: 4, arrival: 5, burst: 4 },
];
const COLORS: Record<number, string> = { 1: "#38bdf8", 2: "#fbbf24", 3: "#4ade80", 4: "#a78bfa" };

interface Seg { pid: number; start: number; end: number; }
type Algo = "FCFS" | "SJF" | "Round-robin";
const ORDER: Algo[] = ["FCFS", "SJF", "Round-robin"];

function schedule(algo: Algo, q: number): { segs: Seg[]; comp: Record<number, number> } {
  const segs: Seg[] = [];
  const comp: Record<number, number> = {};
  const push = (pid: number, start: number, end: number) => {
    const last = segs[segs.length - 1];
    if (last && last.pid === pid && last.end === start) last.end = end;
    else segs.push({ pid, start, end });
  };

  if (algo === "FCFS" || algo === "SJF") {
    const rem = new Set(PROCS.map((p) => p.id));
    let t = 0;
    while (rem.size) {
      const avail = PROCS.filter((p) => rem.has(p.id) && p.arrival <= t);
      if (!avail.length) { t = Math.min(...PROCS.filter((p) => rem.has(p.id)).map((p) => p.arrival)); continue; }
      const pick = algo === "FCFS"
        ? avail.sort((a, b) => a.arrival - b.arrival || a.id - b.id)[0]
        : avail.sort((a, b) => a.burst - b.burst || a.id - b.id)[0];
      push(pick.id, t, t + pick.burst);
      t += pick.burst;
      comp[pick.id] = t;
      rem.delete(pick.id);
    }
  } else {
    const rem: Record<number, number> = {};
    PROCS.forEach((p) => (rem[p.id] = p.burst));
    const byArr = [...PROCS].sort((a, b) => a.arrival - b.arrival || a.id - b.id);
    let ptr = 0;
    let t = 0;
    const queue: number[] = [];
    const enqueueArrivals = (upto: number) => {
      while (ptr < byArr.length && byArr[ptr].arrival <= upto) queue.push(byArr[ptr++].id);
    };
    enqueueArrivals(t);
    let done = 0;
    while (done < PROCS.length) {
      if (!queue.length) { t = byArr[ptr].arrival; enqueueArrivals(t); continue; }
      const pid = queue.shift()!;
      const run = Math.min(q, rem[pid]);
      push(pid, t, t + run);
      t += run;
      rem[pid] -= run;
      enqueueArrivals(t); // arrivals during the slice re-enter before the preempted job
      if (rem[pid] > 0) queue.push(pid);
      else { comp[pid] = t; done++; }
    }
  }
  return { segs, comp };
}

interface Props { algo?: Algo; }

export function CpuScheduler({ algo: ctl }: Props = {}) {
  const [intAlgo, setIntAlgo] = useState<Algo>("FCFS");
  const [q, setQ] = useState(2);
  const algo = ctl ?? intAlgo;

  const { segs, comp, avgWait, avgTurn, makespan } = useMemo(() => {
    const { segs, comp } = schedule(algo, q);
    let wait = 0, turn = 0;
    for (const p of PROCS) {
      const tr = comp[p.id] - p.arrival;
      turn += tr;
      wait += tr - p.burst;
    }
    const makespan = Math.max(...Object.values(comp));
    return { segs, comp, avgWait: wait / PROCS.length, avgTurn: turn / PROCS.length, makespan };
  }, [algo, q]);

  const baseX = 36;
  const plotW = W - baseX - 14;
  const xOf = (t: number) => baseX + (t / makespan) * plotW;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{algo}{algo === "Round-robin" ? ` (q=${q})` : ""} · avg wait {avgWait.toFixed(2)}</div>
        <div className="flex gap-1">
          {ORDER.map((a) => (
            <button key={a} onClick={() => setIntAlgo(a)} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${algo === a ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{a}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="CPU scheduling Gantt chart">
        {/* process table */}
        <text x={baseX} y={26} fill="#9aa3b8" fontSize="8.5">processes (arrival / burst):</text>
        {PROCS.map((p, i) => (
          <g key={p.id}>
            <rect x={baseX + i * 108} y={34} width={12} height={12} fill={COLORS[p.id]} rx={2} />
            <text x={baseX + i * 108 + 18} y={44} fill="#cbd1e6" fontSize="8.5">P{p.id}: a={p.arrival} b={p.burst}</text>
          </g>
        ))}

        {/* Gantt */}
        <text x={baseX} y={86} fill="#cbd1e6" fontSize="9" fontWeight="bold">Gantt chart</text>
        {segs.map((s, i) => (
          <g key={i}>
            <rect x={xOf(s.start)} y={94} width={xOf(s.end) - xOf(s.start)} height={40} fill={COLORS[s.pid]} opacity={0.85} stroke="#0b1228" strokeWidth={1} />
            <text x={(xOf(s.start) + xOf(s.end)) / 2} y={118} fill="#06121f" fontSize="9" textAnchor="middle" fontWeight="bold">P{s.pid}</text>
          </g>
        ))}
        {/* time ticks */}
        {Array.from({ length: makespan + 1 }).map((_, t) => (
          (t % 2 === 0 || t === makespan) && (
            <g key={t}><line x1={xOf(t)} y1={134} x2={xOf(t)} y2={140} stroke="#64748b" strokeWidth={0.5} /><text x={xOf(t)} y={150} fill="#9aa3b8" fontSize="7.5" textAnchor="middle">{t}</text></g>
          )
        ))}

        {/* metrics */}
        <rect x={baseX} y={170} width={plotW} height={56} rx={5} fill="#111a33" />
        <text x={W / 2} y={192} fill="#e5e9f5" fontSize="10" textAnchor="middle">average waiting time = {avgWait.toFixed(2)}</text>
        <text x={W / 2} y={210} fill="#9aa3b8" fontSize="9" textAnchor="middle">average turnaround = {avgTurn.toFixed(2)} · makespan = {makespan}</text>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">round-robin quantum: {q}{algo !== "Round-robin" ? " (applies to Round-robin)" : ""}
          <input type="range" min={1} max={5} step={1} value={q} onChange={(e) => setQ(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Round-robin time quantum" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>FCFS</b> is trivially fair by arrival but suffers the
        <b> convoy effect</b> — P1's long burst makes everyone wait.
        <b> SJF</b> provably minimizes average waiting time, yet needs to
        know burst lengths and can starve long jobs. <b>Round-robin</b>
        slices the CPU by a <b>quantum</b> for responsive time-sharing; too
        small a quantum drowns in context-switch overhead, too large and it
        degrades toward FCFS. Switch algorithms to watch average waiting time
        move.
      </div>
    </div>
  );
}
