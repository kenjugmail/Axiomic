---
title: QAOA (Quantum Approximate Optimization Algorithm)
category: quantum
---
<!-- tier:intro -->
# QAOA — Quantum Approximate Optimization Algorithm

A NISQ-era variational algorithm for combinatorial optimization.

Farhi-Goldstone-Gutmann 2014. Aimed at problems like MaxCut, MaxSAT, portfolio optimization.

**Procedure**:
1. Encode the problem as a cost Hamiltonian `H_C`.
2. Apply alternating layers of `e^{-iγ H_C}` (cost) and `e^{-iβ H_M}` (mixer, `H_M = Σ X_i`).
3. Use `p` layers; `2p` parameters `γ_1, ..., γ_p, β_1, ..., β_p`.
4. Measure expected cost; classically optimize parameters.

**Theoretical guarantee**: as `p → ∞`, QAOA approaches the exact ground state. For finite `p`, gives approximation.

**Practical**: QAOA hasn't beaten classical heuristics on benchmark problems at scales where both run. Active research on whether advantage emerges at deeper `p`.

<!-- tier:undergrad -->
# QAOA (Undergrad)

## Encoding problems

For MaxCut on graph G (find a partition maximizing edges between parts):

Cost Hamiltonian: `H_C = Σ_{(i,j) ∈ E} (1 - Z_i Z_j)/2`.

`Z_i Z_j = -1` if qubits i, j differ (edge cut); `+1` if same. Maximizing `H_C` = maximizing edges cut.

Other problems:
- **MaxSAT**: encode clauses as Ising terms.
- **Vertex cover**: encode covered-vertex constraints.
- **Portfolio optimization**: quadratic cost in binary variables.

QAOA generalizes to QUBO (Quadratic Unconstrained Binary Optimization) — a wide problem class.

## The QAOA circuit

For `p` layers:
1. Start with uniform superposition: `H^⊗n |0⟩^n`.
2. For `j = 1, ..., p`:
   a. Apply `e^{-iγ_j H_C}`.
   b. Apply `e^{-iβ_j H_M}` where `H_M = Σ X_i`.
3. Measure in computational basis.

**Depth**: `p` layers; gate depth ~`p · O(|E|)` for MaxCut.

**Measurement**: each shot gives a candidate solution. Average expected cost over many shots.

**Optimization**: classically optimize `(γ, β)` to maximize expected cost.

## Theoretical guarantees

**Limit p → ∞**: QAOA recovers the optimal solution (adiabatic theorem analog).

**Finite p**: provable approximation ratios for some problems:
- **MaxCut on random regular graphs**: `p=1` QAOA achieves ~0.692 approximation. (vs Goemans-Williamson 0.879 classical guarantee.)
- Deeper p improves approximation but not provably to optimal at small p.

**Performance gap**: classical methods (Goemans-Williamson, simulated annealing) often beat small-p QAOA empirically. Whether QAOA beats classical at LARGE p (in regimes hardware can run) is open.

## Hardware reality

NISQ hardware can run QAOA with `p` modest (1-10) at reasonable scale. Beyond, decoherence dominates.

Demonstrated:
- Toy MaxCut on 50-127 qubits, `p=1-3`.
- Portfolio optimization on small problems.
- Scheduling problems.

Practical advantage: not yet. Still classically beatable.

The hope: as hardware improves + `p` grows, QAOA finds advantage on hard problem instances.

<!-- tier:grad -->
# QAOA (Grad)

## Theoretical analysis

**At p=1 for random regular MaxCut graphs**: QAOA approximation ratio = 0.692. Better than greedy; worse than Goemans-Williamson SDP relaxation.

**Hastings 2019**: classical heuristic (modified greedy) achieves 0.6924 on the same problem. QAOA's advantage at p=1 is marginal.

**Larger p**: empirical advantage emerges for some problem classes; theoretical guarantees are limited.

**Adiabatic limit**: as `p → ∞` and time per step `T → ∞`, QAOA approximates adiabatic quantum optimization, which finds the ground state.

## Variants + extensions

**Warm-start QAOA**: initialize from a classical solution; refine. Works well in practice.

**QAOA+**: extended ansätze with more parameters per layer. More expressive but more parameters to optimize.

**Recursive QAOA (RQAOA)**: classically-aided QAOA. Apply QAOA, identify high-confidence variable assignments, fix them, recurse on smaller problem.

**Multi-angle QAOA**: different angles for different edges. More parameters; sometimes better performance.

## Optimization landscape

QAOA's parameter optimization is non-convex. Issues:

- **Local minima**: standard variational issue.
- **Barren plateaus**: gradients vanish for random ansätze.
- **Symmetries**: QAOA has continuous + discrete symmetries; reducing parameter space helps.

Recent work: identify structure in optimal QAOA parameters. Some patterns transfer across problem instances; warm-start from one solves another faster.

## Hardware-efficiency

QAOA's circuit depth scales with the graph's structure. For dense graphs:
- Many CNOTs; high depth.
- Coherence-limited on NISQ.

For sparse graphs:
- Fewer gates; deeper effective `p` achievable.

Practical advantage may emerge first for sparse-graph optimization problems.

## Recent results (2024-2025)

- Quantinuum + IBM demonstrated `p=2-3` QAOA on 100+ qubits.
- Best classical heuristics (e.g., simulated bifurcation, Lasserre) still competitive on benchmark problems.
- Whether QAOA can demonstrate quantum advantage on optimization remains open.

## Connection to adiabatic

QAOA is the Trotterized version of adiabatic quantum computing:
- AQC: continuously evolve from `H_M` ground state to `H_C` ground state.
- QAOA: discrete Trotter steps with optimized angles.

In the limit, they're equivalent. QAOA with optimized parameters often outperforms naive Trotterization.

## Algorithmic landscape

QAOA is one of two main NISQ-era algorithm classes (alongside VQE):
- **VQE**: variational eigensolver for chemistry.
- **QAOA**: variational optimizer for combinatorial problems.

Both are hybrid quantum-classical, shallow, parameterized. Both face barren-plateau + measurement-cost challenges.

## References

- Farhi, Goldstone, Gutmann 2014. A quantum approximate optimization algorithm.
- Hastings 2019. Classical and quantum bounded depth approximation algorithms.
- Zhou et al. 2020. Quantum approximate optimization algorithm: performance, mechanism, and implementation.
- Bravyi, Kliesch, Koenig, Tang 2020. Obstacles to variational quantum optimization from symmetry protection.
- Akshay et al. 2020. Reachability deficits in quantum approximate optimization.
