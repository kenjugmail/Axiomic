import { useState } from "react";

// Energy balance: intake vs total daily energy expenditure (TDEE).
// TDEE = BMR × an activity factor, where BMR (basal metabolic rate) is
// estimated here by the Mifflin–St Jeor equation for a reference adult.
// A sustained surplus is stored (≈ 7700 kcal per kg of body mass); a
// deficit draws it down. The macronutrient split of intake uses the
// Atwater factors (4 kcal/g carbohydrate + protein, 9 kcal/g fat). This
// is the quantitative core of dietetics — the First Law of Thermodynamics
// applied to the body.

const W = 460;
const H = 340;

// Reference adult: male, 70 kg, 175 cm, 30 y → Mifflin–St Jeor.
const BMR = Math.round(10 * 70 + 6.25 * 175 - 5 * 30 + 5); // 1649

type Activity = "Sedentary" | "Moderate" | "Active";
const MULT: Record<Activity, number> = { Sedentary: 1.2, Moderate: 1.55, Active: 1.725 };
const ORDER: Activity[] = ["Sedentary", "Moderate", "Active"];

interface Props {
  activity?: Activity;
}

export function EnergyBalance({ activity: ctl }: Props = {}) {
  const [intAct, setIntAct] = useState<Activity>("Moderate");
  const [intake, setIntake] = useState(2200);
  const act = ctl ?? intAct;
  const tdee = Math.round(BMR * MULT[act]);
  const balance = intake - tdee;
  const kgPerWeek = (balance * 7) / 7700;
  const verdict =
    balance > 50
      ? `surplus +${balance} kcal/day → +${kgPerWeek.toFixed(2)} kg/week`
      : balance < -50
        ? `deficit ${balance} kcal/day → ${kgPerWeek.toFixed(2)} kg/week`
        : "maintenance (≈ balanced)";

  const baseY = 256;
  const top = 44;
  const plotH = baseY - top;
  const maxK = 3600;
  const h = (k: number) => (k / maxK) * plotH;
  const yOf = (k: number) => baseY - h(k);

  // Macro split of intake (kcal): 50% carb, 20% protein, 30% fat.
  const carbK = intake * 0.5;
  const protK = intake * 0.2;
  const fatK = intake * 0.3;
  const activityK = tdee - BMR;

  return (
    <div className="my-4 p-3 rounded-lg border border-border bg-card text-card-foreground">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <div className="text-sm font-semibold">{verdict}</div>
        <div className="flex gap-1">
          {ORDER.map((a) => (
            <button
              key={a}
              onClick={() => setIntAct(a)}
              disabled={ctl !== undefined}
              className={`px-1.5 py-0.5 rounded text-[9px] ${
                act === a ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-[#0b1228] rounded-md" role="img" aria-label="Energy balance: intake versus expenditure">
        {/* axis */}
        <line x1={56} y1={baseY} x2={W - 16} y2={baseY} stroke="#334155" strokeWidth={0.8} />
        {[1000, 2000, 3000].map((k) => (
          <g key={k}>
            <line x1={56} y1={yOf(k)} x2={W - 16} y2={yOf(k)} stroke="#1f2937" strokeWidth={0.3} />
            <text x={52} y={yOf(k) + 3} fill="#9aa3b8" fontSize="8" textAnchor="end">{k}</text>
          </g>
        ))}
        <text x={20} y={top + plotH / 2} fill="#cbd1e6" fontSize="9" textAnchor="middle" transform={`rotate(-90 20 ${top + plotH / 2})`}>kcal / day</text>

        {/* INTAKE bar (macro-stacked) */}
        <g>
          <rect x={92} y={yOf(carbK)} width={92} height={h(carbK)} fill="#38bdf8" />
          <rect x={92} y={yOf(carbK + protK)} width={92} height={h(protK)} fill="#a78bfa" />
          <rect x={92} y={yOf(intake)} width={92} height={h(fatK)} fill="#fbbf24" />
          <text x={138} y={yOf(intake) - 6} fill="#e5e9f5" fontSize="10" textAnchor="middle" fontWeight="bold">{intake}</text>
          <text x={138} y={baseY + 13} fill="#cbd1e6" fontSize="9" textAnchor="middle">intake</text>
        </g>

        {/* EXPENDITURE bar (BMR + activity) */}
        <g>
          <rect x={276} y={yOf(BMR)} width={92} height={h(BMR)} fill="#475569" />
          <rect x={276} y={yOf(tdee)} width={92} height={h(activityK)} fill="#22c55e" />
          <text x={322} y={yOf(tdee) - 6} fill="#e5e9f5" fontSize="10" textAnchor="middle" fontWeight="bold">{tdee}</text>
          <text x={322} y={baseY + 13} fill="#cbd1e6" fontSize="9" textAnchor="middle">TDEE</text>
          <text x={322} y={yOf(BMR / 2)} fill="#cbd1e6" fontSize="7.5" textAnchor="middle">BMR {BMR}</text>
          <text x={322} y={yOf(BMR + activityK / 2)} fill="#06351a" fontSize="7.5" textAnchor="middle">+{activityK}</text>
        </g>

        {/* intake vs tdee comparison line */}
        <line x1={92} y1={yOf(intake)} x2={368} y2={yOf(intake)} stroke="#38bdf8" strokeWidth={0.6} strokeDasharray="3,2" />

        {/* legend */}
        <g transform="translate(388,60)">
          <rect x={0} y={0} width={9} height={9} fill="#38bdf8" /><text x={13} y={8} fill="#9aa3b8" fontSize="8">carb {Math.round(carbK / 4)}g</text>
          <rect x={0} y={16} width={9} height={9} fill="#a78bfa" /><text x={13} y={24} fill="#9aa3b8" fontSize="8">protein {Math.round(protK / 4)}g</text>
          <rect x={0} y={32} width={9} height={9} fill="#fbbf24" /><text x={13} y={40} fill="#9aa3b8" fontSize="8">fat {Math.round(fatK / 9)}g</text>
        </g>
      </svg>

      <div className="mt-2 text-xs">
        <label className="block">
          energy intake: {intake} kcal/day
          <input type="range" min={1200} max={3500} step={50} value={intake} onChange={(e) => setIntake(parseInt(e.target.value))} className="w-full mt-0.5" aria-label="Daily energy intake" />
        </label>
      </div>
      <div className="mt-1 text-[10px] text-muted-foreground">
        <b>BMR</b> ({BMR} kcal here, via <b>Mifflin–St Jeor</b>) is what the
        body burns at rest; multiplying by an <b>activity factor</b> gives
        <b> TDEE</b>. Intake above TDEE is stored, below it is drawn down — at
        roughly <b>7700 kcal per kg</b>. The bar splits intake by the
        <b> Atwater factors</b> (4/4/9 kcal per g for carbohydrate, protein,
        fat). Wilbur Atwater measured these in his respiration calorimeter in
        the 1890s; they still underpin every nutrition label.
      </div>
    </div>
  );
}
