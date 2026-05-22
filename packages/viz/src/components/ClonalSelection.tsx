import { useEffect, useMemo, useRef, useState } from "react";

// Clonal-selection visualization. Diverse naive lymphocyte repertoire
// (~10^11 unique BCRs/TCRs); antigen exposure selects clones whose
// receptors bind sufficiently well; bound clones proliferate
// exponentially; affinity maturation (somatic hypermutation in B
// cells) drives binding strength up; memory cells persist after
// clearance for faster secondary response.

const W = 460;
const H = 320;

interface Clone {
  id: number;
  // 2D position in "receptor space" — antigen has a target position;
  // distance from antigen determines affinity (1 / (1+d²)).
  x: number;
  y: number;
  abundance: number;  // log scale
  isMemory: boolean;
}

interface Props {
  antigen?: "viral" | "bacterial" | "tumor";
}

const ANTIGEN_POSITIONS: Record<string, { x: number; y: number; label: string }> = {
  viral: { x: 0.7, y: 0.3, label: "viral epitope" },
  bacterial: { x: 0.25, y: 0.6, label: "bacterial LPS" },
  tumor: { x: 0.5, y: 0.45, label: "tumor neoantigen" },
};

function affinityOf(clone: Clone, antigen: { x: number; y: number }): number {
  const dx = clone.x - antigen.x;
  const dy = clone.y - antigen.y;
  const d2 = dx * dx + dy * dy;
  return 1 / (1 + 25 * d2);
}

function makeRepertoire(N: number): Clone[] {
  const clones: Clone[] = [];
  for (let i = 0; i < N; i++) {
    clones.push({
      id: i,
      x: Math.random(),
      y: Math.random(),
      abundance: 1,
      isMemory: false,
    });
  }
  return clones;
}

export function ClonalSelection({ antigen: ctlAntigen }: Props = {}) {
  const [antigenKey, setAntigenKey] = useState<keyof typeof ANTIGEN_POSITIONS>("viral");
  const [clones, setClones] = useState<Clone[]>(() => makeRepertoire(80));
  const [phase, setPhase] = useState<"naive" | "expansion" | "contraction" | "memory">("naive");
  const [day, setDay] = useState(0);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const effective = ctlAntigen ?? antigenKey;
  const antigen = ANTIGEN_POSITIONS[effective];

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setDay((d) => d + 1);
      }, 300);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  // Advance dynamics on day change
  useEffect(() => {
    if (day === 0) return;
    setClones((cs) => {
      const next = cs.map((c) => ({ ...c }));
      const aff = next.map((c) => affinityOf(c, antigen));
      if (phase === "naive" && day >= 1) setPhase("expansion");
      for (let i = 0; i < next.length; i++) {
        const a = aff[i];
        if (phase === "expansion" && a > 0.15) {
          // Proliferate (more if higher affinity)
          next[i].abundance = Math.min(40, next[i].abundance * (1 + 1.5 * a));
          // Affinity maturation — small drift toward antigen
          if (Math.random() < 0.3) {
            next[i].x += (antigen.x - next[i].x) * 0.1 * a;
            next[i].y += (antigen.y - next[i].y) * 0.1 * a;
          }
        } else if (phase === "contraction" && next[i].abundance > 1) {
          // Contraction — most effectors die, high-affinity become memory
          if (a > 0.4 && Math.random() < 0.3 && !next[i].isMemory) {
            next[i].isMemory = true;
            next[i].abundance = Math.max(3, next[i].abundance * 0.4);
          } else {
            next[i].abundance *= 0.85;
            if (next[i].abundance < 1) next[i].abundance = 1;
          }
        }
      }
      return next;
    });
    if (day === 7) setPhase("contraction");
    if (day === 15) {
      setPhase("memory");
      setRunning(false);
    }
  }, [day, phase, antigen]);

  const reset = () => {
    setClones(makeRepertoire(80));
    setDay(0);
    setPhase("naive");
    setRunning(false);
  };

  const baseX = 30;
  const baseY = 30;
  const plotW = W - baseX - 30;
  const plotH = H - baseY - 80;

  const totalEffector = clones.reduce((s, c) => s + (c.isMemory ? 0 : c.abundance > 2 ? c.abundance : 0), 0);
  const totalMemory = clones.reduce((s, c) => s + (c.isMemory ? c.abundance : 0), 0);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Clonal selection · {antigen.label} · day {day} · {phase} · effector {totalEffector.toFixed(0)} · memory {totalMemory.toFixed(0)}</div>
        <div className="flex gap-1">
          <button onClick={() => setRunning((r) => !r)} className="px-2 py-0.5 rounded text-[10px] bg-primary text-primary-foreground">
            {running ? "Pause" : "Run"}
          </button>
          <button onClick={reset} className="px-2 py-0.5 rounded text-[10px] bg-muted hover:bg-accent">Reset</button>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Clonal selection">
        <rect x={baseX} y={baseY} width={plotW} height={plotH} fill="none" stroke="#1f2937" strokeWidth={0.5} />
        <text x={baseX + plotW / 2} y={baseY - 6} fill="#9aa3b8" fontSize="9" textAnchor="middle">receptor-space (BCR/TCR diversity)</text>
        {/* Antigen target marker */}
        <g>
          <circle cx={baseX + antigen.x * plotW} cy={baseY + antigen.y * plotH} r={18} fill="none" stroke="#fbbf24" strokeOpacity={0.4} strokeWidth={1} strokeDasharray="3,2" />
          <circle cx={baseX + antigen.x * plotW} cy={baseY + antigen.y * plotH} r={5} fill="#fbbf24" />
          <text x={baseX + antigen.x * plotW + 8} y={baseY + antigen.y * plotH + 3} fill="#fbbf24" fontSize="9">{antigen.label}</text>
        </g>
        {/* Clones */}
        {clones.map((c) => {
          const cx = baseX + c.x * plotW;
          const cy = baseY + c.y * plotH;
          const r = Math.max(1.5, Math.sqrt(c.abundance) * 1.5);
          const color = c.isMemory ? "#a78bfa" : c.abundance > 2 ? "#4ecdc4" : "#475569";
          return <circle key={c.id} cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.7} />;
        })}
        {/* Legend */}
        <g transform={`translate(${baseX}, ${H - 40})`}>
          <circle cx={6} cy={6} r={3} fill="#475569" />
          <text x={14} y={9} fill="#cbd1e6" fontSize="9">naive</text>
          <circle cx={66} cy={6} r={3} fill="#4ecdc4" />
          <text x={74} y={9} fill="#cbd1e6" fontSize="9">effector</text>
          <circle cx={140} cy={6} r={3} fill="#a78bfa" />
          <text x={148} y={9} fill="#cbd1e6" fontSize="9">memory</text>
          <circle cx={210} cy={6} r={3} fill="#fbbf24" />
          <text x={218} y={9} fill="#cbd1e6" fontSize="9">antigen</text>
        </g>
      </svg>

      <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
        <span className="text-muted-foreground mr-1">Antigen:</span>
        {(Object.keys(ANTIGEN_POSITIONS) as Array<keyof typeof ANTIGEN_POSITIONS>).map((k) => (
          <button key={k} onClick={() => { setAntigenKey(k); reset(); }} disabled={ctlAntigen !== undefined} className={`px-1.5 py-0.5 rounded ${effective === k ? "bg-[#fbbf24] text-black" : "bg-muted hover:bg-accent"}`}>{k}</button>
        ))}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Burnet 1957 clonal selection theory: a diverse pre-existing
        repertoire of B + T cells (~10^11 unique receptors via V(D)J
        recombination — Tonegawa Nobel 1987 — and RAG1/2 mediated
        rearrangement) means that for nearly any antigen, some clones
        already bind. Antigen-driven activation triggers proliferation
        + differentiation. In B cells, somatic hypermutation (AID,
        Honjo) + germinal-center selection (Nussenzweig)
        progressively raises affinity. After clearance, ~5-10% of
        responders persist as memory cells, enabling faster + larger
        secondary responses. Vaccines exploit this — primary
        exposure generates memory for later real-pathogen encounters.
      </div>
    </div>
  );
}
