import React, { useState, useCallback } from "react";
import { BaseViz } from "./BaseViz";

const STEPS = [
  {
    title: "1. Input Embeddings",
    description: "Each token is represented as a vector",
  },
  {
    title: "2. Linear Projections",
    description: "Multiply by W_Q, W_K, W_V to get queries, keys, values",
  },
  {
    title: "3. Compute Attention Scores",
    description: "QK^T: dot product of each query with all keys",
  },
  {
    title: "4. Scale",
    description: "Divide by √d_k to prevent large values",
  },
  {
    title: "5. Softmax",
    description: "Convert scores to probabilities (rows sum to 1)",
  },
  {
    title: "6. Weighted Sum",
    description: "Multiply attention weights by values to get output",
  },
];

const tokens = ["I", "love", "ML"];

// Fixed values for deterministic display
const embeddings = [
  [0.2, 0.8, -0.3, 0.5],
  [-0.1, 0.6, 0.9, -0.2],
  [0.7, -0.4, 0.1, 0.8],
];

const Wq = [[0.5, 0.3], [-0.2, 0.7], [0.8, -0.1], [0.1, 0.6]];
const Wk = [[0.3, -0.5], [0.6, 0.2], [-0.1, 0.8], [0.4, 0.3]];
const Wv = [[-0.3, 0.6], [0.5, -0.2], [0.7, 0.4], [-0.1, 0.8]];

function matmul(a: number[][], b: number[][]): number[][] {
  const rows = a.length, cols = b[0].length, inner = b.length;
  const result: number[][] = [];
  for (let i = 0; i < rows; i++) {
    result[i] = [];
    for (let j = 0; j < cols; j++) {
      let sum = 0;
      for (let k = 0; k < inner; k++) sum += a[i][k] * b[k][j];
      result[i][j] = sum;
    }
  }
  return result;
}

function softmax2d(mat: number[][]): number[][] {
  return mat.map((row) => {
    const max = Math.max(...row);
    const exps = row.map((v) => Math.exp(v - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  });
}

export function QKVStepThrough() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const Q = matmul(embeddings, Wq);
  const K = matmul(embeddings, Wk);
  const V = matmul(embeddings, Wv);

  const scores = Q.map((q) => K.map((k) => q.reduce((s, v, i) => s + v * k[i], 0)));
  const dk = K[0].length;
  const scaledScores = scores.map((row) => row.map((v) => v / Math.sqrt(dk)));
  const attnWeights = softmax2d(scaledScores);
  const output = matmul(attnWeights, V);

  const handleReset = useCallback(() => {
    setStep(0);
    setPlaying(false);
  }, []);

  const handlePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    setPlaying(true);
    let s = step;
    const interval = setInterval(() => {
      s++;
      if (s >= STEPS.length) {
        clearInterval(interval);
        setPlaying(false);
        return;
      }
      setStep(s);
    }, 1500);
  };

  function MatrixDisplay({ data, label, color }: { data: number[][]; label: string; color: string }) {
    return (
      <div className="text-center">
        <div className="text-xs font-medium mb-1" style={{ color }}>{label}</div>
        <div className="inline-grid gap-px bg-border rounded overflow-hidden" style={{ gridTemplateColumns: `repeat(${data[0].length}, 1fr)` }}>
          {data.flat().map((v, i) => (
            <div key={i} className="w-10 h-7 flex items-center justify-center bg-card text-[10px] font-mono">
              {v.toFixed(2)}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <BaseViz
      title="Self-Attention QKV Step-Through"
      description="Watch the self-attention computation unfold step by step"
      height={400}
      onReset={handleReset}
    >
      <div className="h-full flex flex-col p-4">
        {/* Step info */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm font-semibold">{STEPS[step].title}</div>
            <div className="text-xs text-muted-foreground">{STEPS[step].description}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 disabled:opacity-30"
            >
              Prev
            </button>
            <button
              onClick={handlePlay}
              className="px-2 py-1 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {playing ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => setStep(Math.min(STEPS.length - 1, step + 1))}
              disabled={step === STEPS.length - 1}
              className="px-2 py-1 text-xs rounded bg-secondary hover:bg-secondary/80 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </div>

        {/* Step progress */}
        <div className="flex gap-1 mb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Visualization area */}
        <div className="flex-1 flex items-center justify-center gap-4 overflow-x-auto">
          {step >= 0 && (
            <div className="text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {tokens.map((t, i) => <span key={i} className="inline-block w-10 font-mono">{t}</span>)}
              </div>
              <MatrixDisplay data={embeddings} label="X (input)" color="#6366f1" />
            </div>
          )}

          {step >= 1 && (
            <>
              <span className="text-lg text-muted-foreground">→</span>
              <div className="flex gap-3">
                <MatrixDisplay data={Q} label="Q" color="#3b82f6" />
                <MatrixDisplay data={K} label="K" color="#22c55e" />
                <MatrixDisplay data={V} label="V" color="#f59e0b" />
              </div>
            </>
          )}

          {step >= 2 && step < 4 && (
            <>
              <span className="text-lg text-muted-foreground">→</span>
              <MatrixDisplay data={scores} label="QK^T" color="#8b5cf6" />
            </>
          )}

          {step >= 4 && step < 5 && (
            <>
              <span className="text-lg text-muted-foreground">→</span>
              <MatrixDisplay data={scaledScores} label={`QK^T / √${dk}`} color="#8b5cf6" />
            </>
          )}

          {step >= 5 && (
            <>
              <span className="text-lg text-muted-foreground">→</span>
              <MatrixDisplay data={attnWeights} label="Attention" color="#ec4899" />
              <span className="text-lg text-muted-foreground">×</span>
              <MatrixDisplay data={V} label="V" color="#f59e0b" />
              <span className="text-lg text-muted-foreground">=</span>
              <MatrixDisplay data={output} label="Output" color="#14b8a6" />
            </>
          )}
        </div>

        {/* Formula */}
        <div className="mt-2 text-center text-xs font-mono text-muted-foreground">
          Attention(Q, K, V) = softmax(QK<sup>T</sup> / √d<sub>k</sub>)V
        </div>
      </div>
    </BaseViz>
  );
}
