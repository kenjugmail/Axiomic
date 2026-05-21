import { useMemo, useState } from "react";

// Interactive limit-order book + market-impact visualizer.
// Shows bid (descending prices below mid) + ask (ascending above mid)
// ladders with quantities. Drag a market order size + side; the
// viz walks the book + reports volume-weighted average price (VWAP),
// slippage from mid, and remaining liquidity. Demonstrates:
// price impact, depth, spread, walking-the-book on aggressive orders.

const MID = 100.0;
const TICK = 0.05;
const NUM_LEVELS = 12;

interface Level {
  price: number;
  size: number;
  side: "bid" | "ask";
}

function buildBook(spread: number, depth: number, slope: number, seed: number): Level[] {
  // Deterministic-ish book seeded by parameters
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const halfSpread = spread / 2;
  const bestBid = MID - halfSpread;
  const bestAsk = MID + halfSpread;

  const bids: Level[] = [];
  const asks: Level[] = [];
  for (let i = 0; i < NUM_LEVELS; i++) {
    const baseSize = depth * (1 + slope * i) * (0.7 + 0.6 * rand());
    bids.push({
      price: Number((bestBid - i * TICK).toFixed(2)),
      size: Math.max(1, Math.round(baseSize)),
      side: "bid",
    });
    asks.push({
      price: Number((bestAsk + i * TICK).toFixed(2)),
      size: Math.max(1, Math.round(depth * (1 + slope * i) * (0.7 + 0.6 * rand()))),
      side: "ask",
    });
  }
  return [...bids, ...asks];
}

function walkBook(book: Level[], orderSize: number, side: "buy" | "sell"): {
  filled: number;
  notional: number;
  vwap: number;
  levelsHit: number;
  slippageBps: number;
} {
  // Buying lifts asks (ascending); selling hits bids (descending).
  const ladder = side === "buy"
    ? book.filter((l) => l.side === "ask").sort((a, b) => a.price - b.price)
    : book.filter((l) => l.side === "bid").sort((a, b) => b.price - a.price);

  let remaining = orderSize;
  let filled = 0;
  let notional = 0;
  let levelsHit = 0;
  for (const lvl of ladder) {
    if (remaining <= 0) break;
    const take = Math.min(lvl.size, remaining);
    filled += take;
    notional += take * lvl.price;
    remaining -= take;
    levelsHit += 1;
  }
  const vwap = filled > 0 ? notional / filled : 0;
  const refPrice = side === "buy" ? MID : MID;
  const slippageBps = filled > 0
    ? ((vwap - refPrice) / refPrice) * 1e4 * (side === "buy" ? 1 : -1)
    : 0;
  return { filled, notional, vwap, levelsHit, slippageBps };
}

const W = 380;
const H = 320;
const PAD_L = 50;
const PAD_R = 60;
const PAD_T = 24;
const PAD_B = 24;

interface Props {
  spread?: number;
  depth?: number;
  slope?: number;
  orderSize?: number;
  side?: "buy" | "sell";
}

export function OrderBook({
  spread: ctlSpread,
  depth: ctlDepth,
  slope: ctlSlope,
  orderSize: ctlOrderSize,
  side: ctlSide,
}: Props = {}) {
  const [intSpread, setIntSpread] = useState(0.10);
  const [intDepth, setIntDepth] = useState(200);
  const [intSlope, setIntSlope] = useState(0.5);
  const [intSize, setIntSize] = useState(500);
  const [intSide, setIntSide] = useState<"buy" | "sell">("buy");

  const spread = ctlSpread ?? intSpread;
  const depth = ctlDepth ?? intDepth;
  const slope = ctlSlope ?? intSlope;
  const orderSize = ctlOrderSize ?? intSize;
  const side = ctlSide ?? intSide;

  const book = useMemo(
    () => buildBook(spread, depth, slope, 7),
    [spread, depth, slope],
  );

  const fill = useMemo(
    () => walkBook(book, orderSize, side),
    [book, orderSize, side],
  );

  const bids = book.filter((l) => l.side === "bid").sort((a, b) => b.price - a.price);
  const asks = book.filter((l) => l.side === "ask").sort((a, b) => a.price - b.price);

  // Max size for bar scaling
  const maxSize = Math.max(...book.map((l) => l.size), 1);
  const rowH = (H - PAD_T - PAD_B) / NUM_LEVELS;
  const centerY = PAD_T + (H - PAD_T - PAD_B) / 2;

  // Determine which levels get hit by the order
  const ladder = side === "buy" ? asks : bids;
  let cumulative = 0;
  const hitLevels = new Set<number>();
  for (let i = 0; i < ladder.length; i++) {
    if (cumulative >= orderSize) break;
    hitLevels.add(ladder[i]!.price);
    cumulative += ladder[i]!.size;
  }

  return (
    <div className="my-6 rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50">
        <h4 className="text-sm font-medium font-sans">Limit order book + market impact</h4>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag spread, depth, slope, order size, side. Walks the book; reports VWAP + slippage in bps.
        </p>
      </div>
      <div className="p-4 space-y-3">
        <div className="rounded-md border border-border bg-background p-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* center mid line */}
            <line x1={PAD_L} y1={centerY} x2={W - PAD_R} y2={centerY} stroke="currentColor" strokeWidth="0.5" strokeDasharray="3 2" className="text-muted-foreground/50" />
            <text x={W - PAD_R + 4} y={centerY + 3} fontSize="9" className="fill-muted-foreground">mid {MID.toFixed(2)}</text>

            {/* Asks: above mid (lower y values), ascending price upward */}
            {asks.slice(0, NUM_LEVELS / 2 | 0).map((lvl, i) => {
              const y = centerY - (i + 1) * rowH;
              const w = (lvl.size / maxSize) * 100;
              const isHit = side === "buy" && hitLevels.has(lvl.price);
              return (
                <g key={`ask-${i}`}>
                  <rect x={PAD_L} y={y} width={w} height={rowH - 1} fill="currentColor" className={isHit ? "text-rose-500/70" : "text-rose-500/25"} />
                  <text x={PAD_L - 4} y={y + rowH / 2 + 3} fontSize="9" textAnchor="end" className="fill-rose-500 tabular-nums">{lvl.price.toFixed(2)}</text>
                  <text x={PAD_L + w + 4} y={y + rowH / 2 + 3} fontSize="9" className="fill-muted-foreground tabular-nums">{lvl.size}</text>
                </g>
              );
            })}
            {/* Bids: below mid (higher y), descending price downward */}
            {bids.slice(0, NUM_LEVELS / 2 | 0).map((lvl, i) => {
              const y = centerY + i * rowH;
              const w = (lvl.size / maxSize) * 100;
              const isHit = side === "sell" && hitLevels.has(lvl.price);
              return (
                <g key={`bid-${i}`}>
                  <rect x={PAD_L} y={y} width={w} height={rowH - 1} fill="currentColor" className={isHit ? "text-sky-500/70" : "text-sky-500/25"} />
                  <text x={PAD_L - 4} y={y + rowH / 2 + 3} fontSize="9" textAnchor="end" className="fill-sky-500 tabular-nums">{lvl.price.toFixed(2)}</text>
                  <text x={PAD_L + w + 4} y={y + rowH / 2 + 3} fontSize="9" className="fill-muted-foreground tabular-nums">{lvl.size}</text>
                </g>
              );
            })}

            {/* VWAP horizontal marker */}
            {fill.filled > 0 && (
              <g>
                <line
                  x1={PAD_L}
                  y1={
                    side === "buy"
                      ? centerY - ((fill.vwap - MID) / TICK) * rowH
                      : centerY + ((MID - fill.vwap) / TICK) * rowH
                  }
                  x2={W - PAD_R}
                  y2={
                    side === "buy"
                      ? centerY - ((fill.vwap - MID) / TICK) * rowH
                      : centerY + ((MID - fill.vwap) / TICK) * rowH
                  }
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeDasharray="3 2"
                  className="text-amber-500"
                />
                <text
                  x={W - PAD_R + 4}
                  y={
                    (side === "buy"
                      ? centerY - ((fill.vwap - MID) / TICK) * rowH
                      : centerY + ((MID - fill.vwap) / TICK) * rowH) + 3
                  }
                  fontSize="9"
                  className="fill-amber-500"
                >
                  vwap {fill.vwap.toFixed(2)}
                </text>
              </g>
            )}
          </svg>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Spread</span>
              <span className="tabular-nums font-medium">{spread.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0.02}
              max={0.5}
              step={0.01}
              value={spread}
              onChange={(e) => (ctlSpread === undefined) && setIntSpread(parseFloat(e.target.value))}
              disabled={ctlSpread !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Depth (top of book)</span>
              <span className="tabular-nums font-medium">{depth.toFixed(0)}</span>
            </div>
            <input
              type="range"
              min={50}
              max={1000}
              step={25}
              value={depth}
              onChange={(e) => (ctlDepth === undefined) && setIntDepth(parseFloat(e.target.value))}
              disabled={ctlDepth !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Book slope</span>
              <span className="tabular-nums font-medium">{slope.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={slope}
              onChange={(e) => (ctlSlope === undefined) && setIntSlope(parseFloat(e.target.value))}
              disabled={ctlSlope !== undefined}
              className="w-full accent-primary"
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Order size</span>
              <span className="tabular-nums font-medium">{orderSize}</span>
            </div>
            <input
              type="range"
              min={50}
              max={5000}
              step={50}
              value={orderSize}
              onChange={(e) => (ctlOrderSize === undefined) && setIntSize(parseFloat(e.target.value))}
              disabled={ctlOrderSize !== undefined}
              className="w-full accent-amber-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">Side</span>
          <button
            className={`px-3 py-1 rounded-md font-medium transition-colors ${side === "buy" ? "bg-rose-500 text-white" : "bg-muted text-foreground"}`}
            onClick={() => (ctlSide === undefined) && setIntSide("buy")}
            disabled={ctlSide !== undefined}
            type="button"
          >
            Buy (lift asks)
          </button>
          <button
            className={`px-3 py-1 rounded-md font-medium transition-colors ${side === "sell" ? "bg-sky-500 text-white" : "bg-muted text-foreground"}`}
            onClick={() => (ctlSide === undefined) && setIntSide("sell")}
            disabled={ctlSide !== undefined}
            type="button"
          >
            Sell (hit bids)
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11px] pt-1 border-t border-border">
          <div>
            <div className="text-muted-foreground">Filled</div>
            <div className="tabular-nums font-medium">{fill.filled.toFixed(0)} / {orderSize}</div>
          </div>
          <div>
            <div className="text-muted-foreground">VWAP</div>
            <div className="tabular-nums font-medium">{fill.vwap.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Slippage</div>
            <div className="tabular-nums font-medium">{fill.slippageBps.toFixed(1)} bps</div>
          </div>
          <div>
            <div className="text-muted-foreground">Levels hit</div>
            <div className="tabular-nums font-medium">{fill.levelsHit}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
