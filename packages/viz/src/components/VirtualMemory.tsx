import { useState } from "react";

// Virtual memory address translation. A virtual address splits into a
// virtual page number (VPN) and a page offset. The hardware MMU first
// checks the TLB (translation lookaside buffer, a small cache of recent
// translations); on a hit it forms the physical address in ~1 cycle. On a
// miss it walks the page table to find the physical frame number (PFN) and
// refills the TLB (~100s of cycles). If the page-table entry's valid bit is
// clear, the page is not resident — a PAGE FAULT traps to the OS, which
// loads the page from disk (millions of cycles), updates the entry, and
// retries. This demand-paging scheme dates to the Atlas computer
// (Manchester, Kilburn et al., 1962).

const W = 480;
const H = 372;
const PAGE = 0x1000; // 4 KB pages
const OFFSET = 0x1c0;

type Scenario = "TLB hit" | "TLB miss" | "Page fault";
const SCN: Record<Scenario, { vpn: number; pfn: number; valid: boolean; inTlb: boolean }> = {
  "TLB hit": { vpn: 0x2, pfn: 0x5, valid: true, inTlb: true },
  "TLB miss": { vpn: 0x7, pfn: 0x1, valid: true, inTlb: false },
  "Page fault": { vpn: 0xb, pfn: 0x8, valid: false, inTlb: false },
};
const ORDER: Scenario[] = ["TLB hit", "TLB miss", "Page fault"];
const hex = (n: number) => "0x" + n.toString(16).toUpperCase();

interface Props {
  scenario?: Scenario;
}

export function VirtualMemory({ scenario: ctl }: Props = {}) {
  const [intScn, setIntScn] = useState<Scenario>("TLB hit");
  const scn = ctl ?? intScn;
  const s = SCN[scn];
  const tlbHit = s.inTlb;
  const walkPT = !s.inTlb;
  const fault = !s.valid;
  const physAddr = s.pfn * PAGE + OFFSET;

  const steps =
    scn === "TLB hit"
      ? `VPN ${hex(s.vpn)} found in TLB → frame ${hex(s.pfn)} → physical ${hex(physAddr)}  (~1 cycle)`
      : scn === "TLB miss"
        ? `TLB miss → walk page table → frame ${hex(s.pfn)} (valid) → refill TLB → ${hex(physAddr)}  (~100 cycles)`
        : `PTE invalid → PAGE FAULT → OS loads page from disk → frame ${hex(s.pfn)} → retry  (~10⁷ cycles)`;

  const on = (active: boolean) => (active ? 1 : 0.3);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{scn}</div>
        <div className="flex gap-1">
          {ORDER.map((k) => (
            <button
              key={k}
              onClick={() => setIntScn(k)}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                scn === k ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Virtual memory address translation">
        {/* virtual address */}
        <text x={12} y={20} fill="#9aa3b8" fontSize="9">virtual address</text>
        <rect x={120} y={10} width={90} height={20} fill="#0e1a3a" stroke="#38bdf8" strokeWidth={1} />
        <text x={165} y={24} fill="#38bdf8" fontSize="9" textAnchor="middle">VPN {hex(s.vpn)}</text>
        <rect x={210} y={10} width={130} height={20} fill="#0e1a3a" stroke="#64748b" strokeWidth={0.7} />
        <text x={275} y={24} fill="#cbd1e6" fontSize="9" textAnchor="middle">offset {hex(OFFSET)}</text>

        {/* TLB */}
        <g opacity={1}>
          <rect x={20} y={56} width={130} height={86} rx={5} fill="#0e1a3a" stroke={tlbHit ? "#4ade80" : "#fbbf24"} strokeWidth={1.4} />
          <text x={85} y={72} fill="#cbd1e6" fontSize="9.5" textAnchor="middle" fontWeight="bold">TLB</text>
          <text x={30} y={90} fill="#9aa3b8" fontSize="8">VPN 0x0 → f 0x3</text>
          <text x={30} y={106} fill={s.vpn === 0x2 ? "#4ade80" : "#9aa3b8"} fontSize="8" fontWeight={s.vpn === 0x2 ? "bold" : "normal"}>VPN 0x2 → f 0x5</text>
          <text x={30} y={122} fill="#9aa3b8" fontSize="8">VPN 0x4 → f 0x6</text>
          <text x={85} y={138} fill={tlbHit ? "#4ade80" : "#fbbf24"} fontSize="8" textAnchor="middle">{tlbHit ? "HIT ✓" : "miss ✗"}</text>
        </g>

        {/* Page table */}
        <g opacity={on(walkPT)}>
          <rect x={180} y={56} width={140} height={104} rx={5} fill="#0e1a3a" stroke={walkPT ? (fault ? "#f87171" : "#4ade80") : "#334155"} strokeWidth={1.4} />
          <text x={250} y={72} fill="#cbd1e6" fontSize="9.5" textAnchor="middle" fontWeight="bold">Page Table</text>
          <text x={190} y={90} fill="#9aa3b8" fontSize="8">VPN  PFN  valid</text>
          <text x={190} y={106} fill={s.vpn === 0x7 ? "#4ade80" : "#9aa3b8"} fontSize="8">0x7 → 0x1   1</text>
          <text x={190} y={122} fill="#9aa3b8" fontSize="8">0x9 → 0x4   1</text>
          <text x={190} y={138} fill={s.vpn === 0xb ? "#f87171" : "#9aa3b8"} fontSize="8">0xB → ----   0  (on disk)</text>
          <text x={250} y={154} fill={walkPT ? (fault ? "#f87171" : "#4ade80") : "#64748b"} fontSize="8" textAnchor="middle">{walkPT ? (fault ? "valid=0 → FAULT" : "valid=1 → PFN") : "(skipped on TLB hit)"}</text>
        </g>

        {/* Disk */}
        <g opacity={on(fault)}>
          <rect x={350} y={56} width={114} height={70} rx={5} fill="#160d0d" stroke={fault ? "#f87171" : "#334155"} strokeWidth={fault ? 1.4 : 0.7} />
          <text x={407} y={74} fill={fault ? "#f87171" : "#64748b"} fontSize="9.5" textAnchor="middle" fontWeight="bold">Disk (swap)</text>
          <text x={407} y={94} fill="#9aa3b8" fontSize="8" textAnchor="middle">backing store</text>
          <text x={407} y={110} fill={fault ? "#f87171" : "#64748b"} fontSize="8" textAnchor="middle">{fault ? "load page →" : "idle"}</text>
        </g>

        {/* arrows TLB→PT, PT→disk */}
        <line x1={150} y1={99} x2={180} y2={99} stroke={walkPT ? "#fbbf24" : "#334155"} strokeWidth={1} markerEnd="url(#vmA)" />
        <line x1={320} y1={99} x2={350} y2={91} stroke={fault ? "#f87171" : "#334155"} strokeWidth={1} markerEnd="url(#vmA)" />

        {/* physical memory */}
        <text x={12} y={196} fill="#9aa3b8" fontSize="9">physical memory frames</text>
        {Array.from({ length: 10 }).map((_, i) => (
          <g key={i}>
            <rect x={20 + i * 44} y={206} width={40} height={26} rx={3} fill={i === s.pfn ? "#14321f" : "#111a33"} stroke={i === s.pfn ? "#4ade80" : "#334155"} strokeWidth={i === s.pfn ? 1.4 : 0.6} />
            <text x={40 + i * 44} y={223} fill={i === s.pfn ? "#4ade80" : "#64748b"} fontSize="8" textAnchor="middle">f {hex(i)}</text>
          </g>
        ))}

        {/* physical address result */}
        <rect x={120} y={258} width={240} height={28} rx={5} fill="#0e1a3a" stroke="#38bdf8" strokeWidth={1.2} />
        <text x={240} y={276} fill="#38bdf8" fontSize="10" textAnchor="middle" fontWeight="bold">physical address = {hex(physAddr)}</text>
        <text x={240} y={300} fill="#9aa3b8" fontSize="8" textAnchor="middle">= frame {hex(s.pfn)} × 4KB + offset {hex(OFFSET)}</text>

        {/* step caption */}
        <rect x={12} y={314} width={W - 24} height={46} rx={5} fill="#111a33" />
        <text x={W / 2} y={332} fill="#e5e9f5" fontSize="8.2" textAnchor="middle">{steps.length > 78 ? steps.slice(0, 78) : steps}</text>
        {steps.length > 78 && <text x={W / 2} y={348} fill="#e5e9f5" fontSize="8.2" textAnchor="middle">{steps.slice(78)}</text>}

        <defs>
          <marker id="vmA" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#9aa3b8" /></marker>
        </defs>
      </svg>

      <div className="mt-2 text-[10px] text-muted-foreground">
        The <b>MMU</b> translates a virtual address by splitting it into a
        <b> VPN</b> and <b>offset</b>. It first probes the <b>TLB</b>; a hit
        yields the physical frame in about one cycle. A miss forces a
        <b> page-table walk</b>; if the entry's valid bit is set the frame is
        returned and the TLB refilled, otherwise a <b>page fault</b> traps to
        the OS, which pages in from disk. Demand paging originated with the
        <b> Atlas</b> machine (Kilburn et al., 1962); the TLB exists because
        a page-table walk is far too slow to do on every access.
      </div>
    </div>
  );
}
