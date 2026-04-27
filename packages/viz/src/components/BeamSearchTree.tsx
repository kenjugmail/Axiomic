import React, { useState, useMemo, useCallback } from "react";
import { BaseViz } from "./BaseViz";

interface TreeNode {
  id: string;
  token: string;
  logProb: number;
  cumLogProb: number;
  children: TreeNode[];
  depth: number;
  active: boolean;
}

const VOCAB = ["the", "a", "cat", "dog", "sat", "ran", "on", "in", "mat", "rug", "big", "red"];

function generateBeamTree(beamWidth: number, maxDepth: number): TreeNode {
  let id = 0;

  function generate(depth: number, cumLogProb: number): TreeNode {
    const token = depth === 0 ? "<start>" : VOCAB[Math.floor(Math.random() * VOCAB.length)];
    const logProb = depth === 0 ? 0 : -(Math.random() * 3 + 0.5);

    const node: TreeNode = {
      id: `n${id++}`,
      token,
      logProb,
      cumLogProb: cumLogProb + logProb,
      children: [],
      depth,
      active: true,
    };

    if (depth < maxDepth) {
      // Generate more candidates than beam width, then prune
      const candidates: TreeNode[] = [];
      for (let i = 0; i < beamWidth + 2; i++) {
        candidates.push(generate(depth + 1, node.cumLogProb));
      }
      // Sort by cumulative log prob and keep top-k
      candidates.sort((a, b) => b.cumLogProb - a.cumLogProb);
      node.children = candidates.slice(0, beamWidth);
      // Mark pruned nodes
      candidates.slice(beamWidth).forEach((c) => { c.active = false; });
      node.children.push(...candidates.slice(beamWidth));
    }

    return node;
  }

  return generate(0, 0);
}

export function BeamSearchTree() {
  const [beamWidth, setBeamWidth] = useState(3);
  const [maxDepth, setMaxDepth] = useState(4);
  const [tree, setTree] = useState(() => generateBeamTree(3, 4));
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const handleReset = useCallback(() => {
    setTree(generateBeamTree(beamWidth, maxDepth));
    setHoveredNode(null);
  }, [beamWidth, maxDepth]);

  // Flatten tree for rendering
  const nodes: { node: TreeNode; x: number; y: number; parentX?: number; parentY?: number }[] = [];

  function layout(node: TreeNode, x: number, y: number, spread: number, parentX?: number, parentY?: number) {
    nodes.push({ node, x, y, parentX, parentY });
    const childSpread = spread / Math.max(node.children.length, 1);
    const startX = x - spread / 2 + childSpread / 2;
    node.children.forEach((child, i) => {
      layout(child, startX + i * childSpread, y + 60, childSpread, x, y);
    });
  }

  const width = 600;
  const height = 340;
  layout(tree, width / 2, 30, width - 40);

  return (
    <BaseViz
      title="Beam Search Tree"
      description="Visualizes beam search decoding. Green nodes are kept, red are pruned."
      height={height + 60}
      onReset={handleReset}
    >
      <div className="h-full flex flex-col p-2">
        {/* Controls */}
        <div className="flex gap-4 mb-2 px-2">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Beam width:</label>
            <input
              type="range"
              min="2"
              max="5"
              value={beamWidth}
              onChange={(e) => {
                const w = parseInt(e.target.value);
                setBeamWidth(w);
                setTree(generateBeamTree(w, maxDepth));
              }}
              className="w-20 accent-primary"
            />
            <span className="text-xs font-mono">{beamWidth}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium">Depth:</label>
            <input
              type="range"
              min="2"
              max="5"
              value={maxDepth}
              onChange={(e) => {
                const d = parseInt(e.target.value);
                setMaxDepth(d);
                setTree(generateBeamTree(beamWidth, d));
              }}
              className="w-20 accent-primary"
            />
            <span className="text-xs font-mono">{maxDepth}</span>
          </div>
        </div>

        {/* Tree SVG */}
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="flex-1">
          {/* Edges */}
          {nodes.map(({ node, x, y, parentX, parentY }) =>
            parentX !== undefined && parentY !== undefined ? (
              <line
                key={`edge-${node.id}`}
                x1={parentX}
                y1={parentY + 10}
                x2={x}
                y2={y - 10}
                stroke={node.active ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                strokeWidth={node.active ? 1.5 : 0.5}
                opacity={node.active ? 0.6 : 0.2}
                strokeDasharray={node.active ? "none" : "4,4"}
              />
            ) : null
          )}
          {/* Nodes */}
          {nodes.map(({ node, x, y }) => (
            <g
              key={node.id}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: "pointer" }}
            >
              <circle
                cx={x}
                cy={y}
                r={hoveredNode === node.id ? 14 : 12}
                fill={node.active ? "hsl(var(--primary))" : "hsl(var(--destructive))"}
                opacity={node.active ? (hoveredNode === node.id ? 1 : 0.8) : 0.3}
                stroke={hoveredNode === node.id ? "hsl(var(--foreground))" : "none"}
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={y + 3}
                textAnchor="middle"
                fill="white"
                style={{ fontSize: 8, fontFamily: "monospace" }}
              >
                {node.token.slice(0, 4)}
              </text>
              {hoveredNode === node.id && (
                <text
                  x={x}
                  y={y + 26}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontSize: 9, fontFamily: "monospace" }}
                >
                  p={node.logProb.toFixed(2)} Σ={node.cumLogProb.toFixed(2)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
    </BaseViz>
  );
}
