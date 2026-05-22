import { useState } from "react";

// The JavaScript event loop. Synchronous code runs to completion on the
// call stack first. Async callbacks wait in queues: Promise reactions go on
// the MICROTASK queue, timers/I/O on the MACROTASK (task) queue. When the
// stack empties, the loop drains ALL microtasks, then takes exactly ONE
// macrotask, then drains microtasks again — which is why a Promise.then
// always runs before a setTimeout(…, 0) queued earlier. This single-
// threaded, run-to-completion model (HTML spec; V8/Node libuv) is the
// source of nearly every "why did this log in that order?" puzzle.

const W = 480;
const H = 320;

interface Frame {
  stack: string[];
  micro: string[];
  macro: string[];
  out: string[];
  note: string;
}
type Scenario = "setTimeout + Promise" | "Promise chain";

const FRAMES: Record<Scenario, Frame[]> = {
  "setTimeout + Promise": [
    { stack: ["main()"], micro: [], macro: [], out: [], note: "run the script (main task)" },
    { stack: ["main()", "log('A')"], micro: [], macro: [], out: ["A"], note: "console.log('A') — synchronous" },
    { stack: ["main()"], micro: [], macro: ["timer cb → B"], out: ["A"], note: "setTimeout(…,0) → MACROtask queued" },
    { stack: ["main()"], micro: ["then cb → C"], macro: ["timer cb → B"], out: ["A"], note: "Promise.then → MICROtask queued" },
    { stack: ["main()", "log('D')"], micro: ["then cb → C"], macro: ["timer cb → B"], out: ["A", "D"], note: "console.log('D'); main() returns" },
    { stack: [], micro: ["then cb → C"], macro: ["timer cb → B"], out: ["A", "D"], note: "stack empty → drain ALL microtasks" },
    { stack: ["then cb"], micro: [], macro: ["timer cb → B"], out: ["A", "D", "C"], note: "microtask C runs" },
    { stack: ["timer cb"], micro: [], macro: [], out: ["A", "D", "C", "B"], note: "then ONE macrotask: B" },
  ],
  "Promise chain": [
    { stack: ["main()"], micro: [], macro: [], out: [], note: "run the script" },
    { stack: ["main()"], micro: [], macro: ["timer cb → 2"], out: ["1"], note: "log 1; setTimeout → macrotask" },
    { stack: ["main()"], micro: ["then → 3"], macro: ["timer cb → 2"], out: ["1"], note: "first .then → microtask" },
    { stack: [], micro: ["then → 3"], macro: ["timer cb → 2"], out: ["1", "5"], note: "log 5; main() returns" },
    { stack: ["then cb"], micro: ["then → 4"], macro: ["timer cb → 2"], out: ["1", "5", "3"], note: "microtask 3 runs, queues the next .then" },
    { stack: ["then cb"], micro: [], macro: ["timer cb → 2"], out: ["1", "5", "3", "4"], note: "chained microtask 4 runs (still before any macrotask)" },
    { stack: ["timer cb"], micro: [], macro: [], out: ["1", "5", "3", "4", "2"], note: "finally the macrotask: 2" },
  ],
};
const ORDER: Scenario[] = ["setTimeout + Promise", "Promise chain"];

interface Props {
  scenario?: Scenario;
}

export function EventLoop({ scenario: ctl }: Props = {}) {
  const [intScn, setIntScn] = useState<Scenario>("setTimeout + Promise");
  const [step, setStep] = useState(0);
  const scn = ctl ?? intScn;
  const frames = FRAMES[scn];
  const f = frames[Math.min(step, frames.length - 1)];
  const done = step >= frames.length - 1;

  const Box = ({ x, title, items, color }: { x: number; title: string; items: string[]; color: string }) => (
    <g>
      <text x={x + 50} y={30} fill="#cbd1e6" fontSize="9" textAnchor="middle" fontWeight="bold">{title}</text>
      <rect x={x} y={38} width={100} height={160} rx={4} fill="#0e1a3a" stroke="#1f2937" strokeWidth={0.8} />
      {items.map((it, i) => (
        <g key={i}>
          <rect x={x + 6} y={184 - i * 24} width={88} height={20} rx={3} fill={color} opacity={0.85} />
          <text x={x + 50} y={198 - i * 24} fill="#06121f" fontSize="7.5" textAnchor="middle">{it}</text>
        </g>
      ))}
    </g>
  );

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{done ? "done · " : `step ${step} · `}output: [{f.out.join(", ")}]</div>
        <div className="flex gap-1">
          {ORDER.map((s) => (
            <button key={s} onClick={() => { setIntScn(s); setStep(0); }} disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${scn === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{s}</button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="JavaScript event loop">
        <Box x={16} title="Call stack" items={f.stack} color="#38bdf8" />
        <Box x={132} title="Microtask queue" items={f.micro} color="#a78bfa" />
        <Box x={248} title="Macrotask queue" items={f.macro} color="#fbbf24" />
        <Box x={364} title="Console" items={f.out} color="#4ade80" />
        <rect x={16} y={210} width={W - 32} height={40} rx={4} fill="#111a33" />
        <text x={W / 2} y={234} fill="#e5e9f5" fontSize="9" textAnchor="middle">{f.note}</text>
      </svg>

      <div className="mt-2 flex gap-2">
        <button onClick={() => setStep((s) => Math.min(s + 1, frames.length - 1))} className="px-2 py-1 rounded text-[10px] bg-muted hover:bg-accent">Step ▶</button>
        <button onClick={() => setStep(0)} className="px-2 py-1 rounded text-[10px] bg-muted hover:bg-accent">Reset</button>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        Synchronous code runs first on the <b>call stack</b>. A
        <b> Promise.then</b> callback joins the <b>microtask queue</b>; a
        <b> setTimeout</b> callback joins the <b>macrotask queue</b>. When the
        stack empties, the event loop drains <b>every</b> microtask before
        taking <b>one</b> macrotask — so the Promise callback (C / 3) always
        beats the timer (B / 2) even when the timer was scheduled first. This
        run-to-completion model is defined by the HTML spec and implemented by
        V8 + the host (the browser, or Node's libuv).
      </div>
    </div>
  );
}
