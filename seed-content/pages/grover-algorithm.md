---
title: Grover's Algorithm
category: quantum
---
<!-- tier:intro -->
# Grover's Algorithm

Quadratic speedup for unstructured search.

**Problem**: given `f: {0,1}^n → {0,1}` with one (or few) inputs `x*` such that `f(x*) = 1`, find `x*`.

**Classical**: `O(N)` queries (`N = 2^n`).
**Quantum (Grover 1996)**: `O(√N)` queries.

The speedup is provable + tight: no quantum algorithm can beat `Ω(√N)` for true unstructured search.

Used as a primitive in many algorithms. Practical impact bounded by hardware quality + oracle implementation cost.

<!-- tier:undergrad -->
# Grover's Algorithm (Undergrad)

## The algorithm

1. Initialize n qubits in uniform superposition: `|ψ⟩ = (1/√N) Σ |x⟩`.
2. Repeat `~(π/4)√N` times:
   a. **Oracle**: flip sign of target amplitude. `O|x⟩ = (-1)^{f(x)}|x⟩`.
   b. **Diffusion**: reflect about the mean amplitude. `D = 2|ψ⟩⟨ψ| - I`.
3. Measure. Target observed with probability close to 1.

## Why it works (geometric)

Each iteration rotates the state vector by ~`2θ` where `sin(θ) = √(M/N)` (M = number of solutions).

Starting state: angle ~`π/2` from target subspace.
Iterations needed to reach target: `~π/(4θ) ≈ (π/4)√(N/M)`.

After this, target amplitude is ~1; non-target amplitudes are ~0.

Constructive interference at target; destructive at non-targets.

## The diffusion operator

`D = 2|ψ⟩⟨ψ| - I` = "reflection about the average".

Applied to amplitudes `a_x`: each amplitude becomes `2a_avg - a_x`. Amplitudes below average go up; above go down.

After oracle (which makes target negative, others positive), diffusion increases the (now-negative) target amplitude away from zero in the negative direction — making its magnitude larger. The non-targets (slightly above zero) get reflected to slightly below average.

## Quadratic speedup — practical impact

For `N = 2^{40}`:
- Classical: ~10^12 queries.
- Grover: ~10^6 queries.

Useful but bounded:

- Doesn't break NP-complete problems efficiently. Brute-force SAT becomes `2^{n/2}` (still exponential).
- Forces longer cryptographic keys: AES-128 → effective 64-bit security under Grover; AES-256 → 128-bit (still secure).
- Won't run at scale until fault-tolerant quantum computing.

## Variants

- **Multi-target**: M solutions; iterations = `(π/4)√(N/M)`.
- **Unknown M**: quantum counting first, then Grover.
- **Fixed-point Grover**: doesn't require knowing M; converges to high success probability.
- **Amplitude amplification**: generalization beyond search; boost any "good" outcome's probability quadratically.

<!-- tier:grad -->
# Grover's Algorithm (Grad)

## Tightness

**BBBV theorem** (Bennett-Bernstein-Brassard-Vazirani 1997): any quantum algorithm for unstructured search requires `Ω(√N)` queries. Grover is asymptotically optimal.

This is one of the few quantum lower bounds matching an upper bound. Most algorithm questions remain open.

## Amplitude amplification

The generalization. Given a quantum subroutine `A` producing target with probability `p`, amplification:
- Quantum: `O(1/√p)` runs.
- Classical: `O(1/p)` runs.

Same `√` improvement as Grover (where `p = 1/N`).

**Used in**: Grover-style searches with multiple solutions, post-processing of probabilistic quantum subroutines, building blocks of complex algorithms.

## Quantum walks

Continuous-time generalization of Grover for graph problems:
- **Spatial search** (Childs-Goldstone 2004): search a graph for marked vertices; quantum walks give Grover-like speedup for many graph topologies.
- **Element distinctness** (Ambainis 2007): O(N^{2/3}) for finding pairs in N elements. Better than Grover.

## Implementation challenges

For Grover at problem-relevant scale:
- Oracle implementation: each query is a quantum circuit. Complexity matters.
- Circuit depth: `O(√N)` oracle applications. For `N = 2^{40}`, ~10^6 oracle applications.
- Decoherence: maintaining coherence across this depth requires fault-tolerance.

Today's NISQ Grover demos: ~5-15 qubits; ~30 oracle applications max. Far from practical advantage.

For cryptanalytically relevant Grover (AES-128 brute force), need ~2^{64} oracle applications + a fault-tolerant quantum computer. Decades away.

## Why √N is the limit (intuition)

Information-theoretic: each query reveals one bit of information (whether the queried input is the target). `log N` bits needed; `O(N)` queries to find target classically.

Quantum: each query rotates the state in a 2D subspace by `O(1/√N)` angle. `O(√N)` rotations to reach the target subspace from the initial uniform.

The quadratic vs linear gap is the **quadratic speedup**. Cannot be improved within the unstructured-search framework.

For STRUCTURED problems, exploit structure for better-than-Grover algorithms (e.g., binary search with sorted data: `O(log N)` classically; `O(log N)` quantum, no advantage).

## Connection to other algorithms

- **Shor's algorithm**: doesn't use Grover; uses QFT directly.
- **HHL**: phase estimation + amplitude amplification.
- **Quantum walks**: generalize Grover for structured problems.
- **NISQ-era variational algorithms**: don't use Grover directly, but amplitude amplification appears in some hybrid algorithms.

## References

- Grover 1996. A fast quantum mechanical algorithm for database search.
- Bennett, Bernstein, Brassard, Vazirani 1997. Strengths and weaknesses of quantum computing.
- Brassard, Høyer, Mosca, Tapp 2002. Quantum amplitude amplification and estimation.
- Yoder, Low, Chuang 2014. Fixed-point quantum search with optimal number of queries.
- Nielsen & Chuang §6.
