import { useMemo, useState } from "react";

// Comparative vertebrate skeletal anatomy — toggle dog/cat/horse/cow/
// bird/human + see homologous bone groups highlighted. Stylized
// outline + bone labels, not anatomically precise — the pedagogy is
// the homology concept, not surgical-grade detail.

const W = 460;
const H = 320;

type Species = "dog" | "cat" | "horse" | "cow" | "bird" | "human";

interface Props {
  species?: Species;
}

interface SpeciesProfile {
  label: string;
  // Rough body-shape parameters for the stylized outline
  bodyLen: number;
  bodyDepth: number;
  legLen: number;
  neckLen: number;
  headSize: number;
  posture: "quadruped" | "biped" | "flying";
  notes: string;
  fact: string;
}

const PROFILES: Record<Species, SpeciesProfile> = {
  dog: { label: "Dog (Canis)", bodyLen: 1.6, bodyDepth: 0.55, legLen: 0.7, neckLen: 0.5, headSize: 0.45, posture: "quadruped", notes: "Digitigrade carnivore; 42 teeth; 13 thoracic vertebrae.", fact: "Dewclaw = vestigial first digit (thumb homolog)." },
  cat: { label: "Cat (Felis)", bodyLen: 1.4, bodyDepth: 0.45, legLen: 0.55, neckLen: 0.45, headSize: 0.4, posture: "quadruped", notes: "Digitigrade obligate carnivore; flexible spine; retractable claws.", fact: "Floating clavicle (free of scapula) allows extreme reach." },
  horse: { label: "Horse (Equus)", bodyLen: 2.4, bodyDepth: 0.95, legLen: 1.4, neckLen: 1.05, headSize: 0.95, posture: "quadruped", notes: "Unguligrade ungulate; single weight-bearing digit (3rd).", fact: "Splint bones = vestigial 2nd + 4th metacarpals." },
  cow: { label: "Cow (Bos)", bodyLen: 2.3, bodyDepth: 1.05, legLen: 1.05, neckLen: 0.9, headSize: 0.95, posture: "quadruped", notes: "Cloven hoof ungulate; 4-chamber stomach; ruminant.", fact: "Cleft hoof = 3rd + 4th digits load-bearing." },
  bird: { label: "Bird (e.g. chicken)", bodyLen: 1.0, bodyDepth: 0.55, legLen: 0.95, neckLen: 0.65, headSize: 0.4, posture: "flying", notes: "Pneumatic bones; fused furcula (wishbone); pygostyle.", fact: "Wing = forelimb with reduced + fused digits; tetrapod homology preserved." },
  human: { label: "Human (Homo)", bodyLen: 1.2, bodyDepth: 0.5, legLen: 1.6, neckLen: 0.4, headSize: 0.55, posture: "biped", notes: "Obligate biped; opposable thumb; large neocortex.", fact: "Same 5-digit hand pattern as ancestral tetrapod; nails = modified claws." },
};

// Homologous bone groups in vertebrate forelimb
const HOMOLOGY = {
  humerus: { color: "#ff6b6b", label: "humerus" },
  radius_ulna: { color: "#fbbf24", label: "radius+ulna" },
  carpals: { color: "#4ecdc4", label: "carpals" },
  digits: { color: "#a78bfa", label: "digits/phalanges" },
};

export function ComparativeAnatomy({ species: ctlSpecies }: Props = {}) {
  const [intSp, setIntSp] = useState<Species>("dog");
  const sp = ctlSpecies ?? intSp;
  const profile = PROFILES[sp];

  const cx = W / 2;
  const cy = H / 2 - 20;
  const scale = 60;

  // Stylized side-view skeleton: spine + head + 4 limbs (or 2 + 2)
  const skeleton = useMemo(() => {
    const elems: JSX.Element[] = [];
    const bL = profile.bodyLen * scale;
    const bD = profile.bodyDepth * scale * 0.4;
    const lL = profile.legLen * scale;
    const nL = profile.neckLen * scale;
    const hS = profile.headSize * scale * 0.4;
    const isBiped = profile.posture === "biped";

    if (isBiped) {
      // Spine vertical
      elems.push(<line key="spine" x1={cx} y1={cy - bL / 2} x2={cx} y2={cy + bL / 2 - bD} stroke="#cbd1e6" strokeWidth={2} />);
      // Skull
      elems.push(<circle key="skull" cx={cx} cy={cy - bL / 2 - hS} r={hS} fill="#475569" />);
      // Arms (forelimbs)
      elems.push(<line key="hum" x1={cx} y1={cy - bL / 2 + 10} x2={cx - 30} y2={cy} stroke={HOMOLOGY.humerus.color} strokeWidth={3} />);
      elems.push(<line key="rad" x1={cx - 30} y1={cy} x2={cx - 45} y2={cy + 30} stroke={HOMOLOGY.radius_ulna.color} strokeWidth={3} />);
      elems.push(<circle key="carp" cx={cx - 45} cy={cy + 30} r={3} fill={HOMOLOGY.carpals.color} />);
      elems.push(<line key="dig" x1={cx - 45} y1={cy + 30} x2={cx - 50} y2={cy + 42} stroke={HOMOLOGY.digits.color} strokeWidth={2} />);
      // Legs
      elems.push(<line key="leg1" x1={cx - 6} y1={cy + bL / 2 - bD} x2={cx - 10} y2={cy + bL / 2 + lL / 2} stroke="#cbd1e6" strokeWidth={3} />);
      elems.push(<line key="leg2" x1={cx + 6} y1={cy + bL / 2 - bD} x2={cx + 10} y2={cy + bL / 2 + lL / 2} stroke="#cbd1e6" strokeWidth={3} />);
    } else {
      // Quadruped or flying: horizontal spine
      elems.push(<line key="spine" x1={cx - bL / 2} y1={cy} x2={cx + bL / 2} y2={cy} stroke="#cbd1e6" strokeWidth={2.5} />);
      // Neck + skull (left end)
      elems.push(<line key="neck" x1={cx - bL / 2} y1={cy} x2={cx - bL / 2 - nL * 0.7} y2={cy - nL * 0.4} stroke="#cbd1e6" strokeWidth={2} />);
      elems.push(<circle key="skull" cx={cx - bL / 2 - nL * 0.7 - hS / 2} cy={cy - nL * 0.4 - hS / 2} r={hS / 2} fill="#475569" />);
      // Tail (right end)
      elems.push(<line key="tail" x1={cx + bL / 2} y1={cy} x2={cx + bL / 2 + 18} y2={cy - 6} stroke="#cbd1e6" strokeWidth={1.5} />);
      // Forelimb (left): humerus + radius/ulna + carpals + digits
      const flX = cx - bL / 4;
      elems.push(<line key="fl-hum" x1={flX} y1={cy + 2} x2={flX - 5} y2={cy + lL * 0.4} stroke={HOMOLOGY.humerus.color} strokeWidth={3} />);
      elems.push(<line key="fl-rad" x1={flX - 5} y1={cy + lL * 0.4} x2={flX} y2={cy + lL * 0.8} stroke={HOMOLOGY.radius_ulna.color} strokeWidth={3} />);
      elems.push(<circle key="fl-carp" cx={flX} cy={cy + lL * 0.8} r={2.5} fill={HOMOLOGY.carpals.color} />);
      if (profile.posture !== "flying") {
        elems.push(<line key="fl-dig" x1={flX} y1={cy + lL * 0.8} x2={flX + 3} y2={cy + lL * 0.95} stroke={HOMOLOGY.digits.color} strokeWidth={2} />);
      } else {
        // Bird wing: elongated metacarpals + digits
        elems.push(<line key="bird-wing" x1={flX} y1={cy + lL * 0.8} x2={cx} y2={cy - 40} stroke={HOMOLOGY.digits.color} strokeWidth={2} strokeDasharray="3,2" />);
      }
      // Hindlimb (right)
      const hlX = cx + bL / 4;
      elems.push(<line key="hl-fem" x1={hlX} y1={cy + 2} x2={hlX - 5} y2={cy + lL * 0.4} stroke="#cbd1e6" strokeWidth={3} />);
      elems.push(<line key="hl-tib" x1={hlX - 5} y1={cy + lL * 0.4} x2={hlX} y2={cy + lL * 0.8} stroke="#cbd1e6" strokeWidth={3} />);
      elems.push(<circle key="hl-tar" cx={hlX} cy={cy + lL * 0.8} r={2.5} fill="#cbd1e6" />);
    }
    return elems;
  }, [profile, sp, cx, cy, scale]);

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">{profile.label} · {profile.posture}</div>
        <div className="flex flex-wrap gap-1">
          {(Object.keys(PROFILES) as Species[]).map((s) => (
            <button key={s} onClick={() => setIntSp(s)} disabled={ctlSpecies !== undefined} className={`px-1.5 py-0.5 rounded text-[9px] ${sp === s ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"}`}>{s}</button>
          ))}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Comparative anatomy">
        {skeleton}
        {/* Homology legend */}
        <g transform={`translate(20, ${H - 64})`}>
          {(Object.keys(HOMOLOGY) as Array<keyof typeof HOMOLOGY>).map((k, i) => (
            <g key={k} transform={`translate(${i * 100}, 0)`}>
              <line x1={0} y1={4} x2={12} y2={4} stroke={HOMOLOGY[k].color} strokeWidth={3} />
              <text x={16} y={7} fill="#cbd1e6" fontSize="8">{HOMOLOGY[k].label}</text>
            </g>
          ))}
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <p className="text-muted-foreground"><b>{profile.label}:</b> {profile.notes}</p>
        <p className="text-muted-foreground text-[10px] mt-1">{profile.fact}</p>
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Vertebrate forelimb homology: the same four bone groups
        (humerus → radius/ulna → carpals → digits) appear in every
        tetrapod despite radical functional divergence — dog paws,
        horse hooves, bird wings, whale flippers, bat wings, and
        human hands all share this skeletal Bauplan. Richard Owen
        coined "homology" 1843; comparative anatomy gave Darwin one
        of his strongest arguments for descent with modification.
        Modern evo-devo (Carroll Endless Forms Most Beautiful 2005)
        shows Hox genes coordinate this conserved body plan;
        Tiktaalik 2004 (Daeschler-Shubin) captures the fish→tetrapod
        transition where the forelimb pattern first emerged.
      </div>
    </div>
  );
}
