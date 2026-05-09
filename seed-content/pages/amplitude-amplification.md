---
title: Amplitude Amplification
category: quantum
---
<!-- tier:intro -->
# Amplitude Amplification

The generalization of Grover's search to arbitrary quantum subroutines.

**Setup**: a quantum subroutine `A` produces state with target probability `p`.

**Amplification**: by repeating a Grover-like iteration `O(1/√p)` times, target probability is amplified to ~1.

Classical: needs `~1/p` runs. Amplitude amplification: `~1/√p`. Same quadratic speedup as Grover.

Brassard-Høyer-Mosca-Tapp 2002. The quantum primitive for any probabilistic computation.

<!-- tier:undergrad -->
# Amplitude Amplification (Undergrad)

## The generic procedure

Given:
- `A`: a quantum circuit producing state `|ψ⟩ = √(1-p) |bad⟩ + √p |good⟩`.
- Means to recognize "good" states (a marker function).

The amplification iteration:
1. **Marker**: flip phase of |good⟩.
2. **Reflection about A|0⟩**: `2A|0⟩⟨0|A† - I`.

Each iteration rotates by ~`2arcsin(√p) ≈ 2√p` toward `|good⟩` subspace.

After `(π/4)/√p` iterations, state is mostly |good⟩.

## Examples

**Grover** is amplitude amplification with `A = H^⊗n` (uniform superposition). `p = M/N` (M solutions out of N).

**Boosting probabilistic subroutines**: a quantum subroutine that produces the right answer with probability 0.1 can be amplified to >99% with ~10√10 ≈ 30 iterations (vs ~30 classical retries).

**Quantum amplitude estimation**: estimate `p` to precision ε with `O(1/ε)` queries (vs `O(1/ε²)` classical). Used in Monte Carlo, option pricing.

## When does it apply?

Amplitude amplification works when:
1. You have a quantum circuit producing a target with non-zero probability.
2. You can recognize the target (marker function).
3. The marker is implementable as a quantum subroutine.

Examples:
- **Search**: Grover (special case).
- **Probabilistic algorithm boosting**: amplify any quantum subroutine's success rate.
- **Optimization**: find good solutions sampled with non-trivial probability.
- **Counting**: estimate the number of solutions via amplitude estimation.

## Speedups

Classical: `1/p` calls to find target.
AA: `1/√p` calls. Quadratic speedup.

For small `p` (rare events), the speedup is significant. For `p` close to 1, less so.

<!-- tier:grad -->
# Amplitude Amplification (Grad)

## Mathematical formulation

The reflection operators:
- `S_good`: phase flip on good states. `S_good = I - 2P_good` where `P_good` projects onto good subspace.
- `S_init = 2A|0⟩⟨0|A† - I = AS_0 A†` where `S_0 = 2|0⟩⟨0| - I`.

Amplification operator: `Q = S_init S_good`.

Acts as a rotation in the 2D subspace spanned by good + bad. Rotation angle = `2arcsin(√p)`.

After `k` iterations, success probability:
`P_success = sin²((2k+1)arcsin(√p))`

Maximum near `k = (π/4)/arcsin(√p) - 1/2 ≈ (π/4)/√p`.

## Fixed-point amplitude amplification

Standard amplitude amplification requires knowing `p` to time the iterations correctly. Fixed-point variants converge regardless of `p`:

- **Yoder-Low-Chuang 2014**: optimal-query fixed-point search.
- **Berry-Childs-Cleve-Kothari-Somma 2017**: applications to Hamiltonian simulation.

Useful when target probability is unknown.

## Quantum amplitude estimation

Estimate `p` itself, not just amplify.

**QAE algorithm**: phase estimation applied to the amplification operator `Q`. Eigenvalues of `Q` encode `p`.

**Resource cost**: `O(1/ε)` queries to estimate `p` to precision `ε`.

**Application**: replace Monte Carlo `1/ε²` sampling with `1/ε` quantum sampling. Quadratic speedup for many statistical applications.

## Iterative amplitude estimation (IQAE)

Amplitude estimation traditionally uses phase estimation, requiring many qubits. **IQAE** (Grinko et al. 2021) achieves the same quadratic speedup with fewer qubits, accessible on NISQ-style hardware.

Trade-off: more iterations vs fewer qubits. NISQ-era amplitude estimation is becoming practical.

## Connection to other speedups

The √-speedup pattern is common:
- Grover: search.
- Quantum walks: graph traversal.
- HHL: linear systems.
- Amplitude amplification + estimation: many statistical applications.

The common theme: square-root reduction in queries / runs by exploiting amplitude superposition + interference.

## References

- Brassard, Høyer, Mosca, Tapp 2002. Quantum amplitude amplification and estimation.
- Grinko, Gacon, Zoufal, Woerner 2021. Iterative quantum amplitude estimation.
- Yoder, Low, Chuang 2014. Fixed-point quantum search with optimal number of queries.
- Mosca 2008. Quantum algorithms.
