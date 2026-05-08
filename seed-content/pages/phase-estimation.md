---
title: Quantum Phase Estimation
category: quantum
---
<!-- tier:intro -->
# Quantum Phase Estimation

The most-used quantum subroutine after QFT.

**Problem**: given a unitary `U` and an eigenstate `|ψ⟩` with eigenvalue `e^{2πiθ}`, estimate `θ`.

**Procedure**: use a counting register + controlled-`U^{2^k}` operations + inverse QFT to extract `θ`.

**Output accuracy**: `t` qubits in the counting register → `t` bits of precision in `θ`.

**Used in**: Shor's algorithm, HHL (linear systems), quantum chemistry (energy-level estimation), quantum simulation.

<!-- tier:undergrad -->
# Phase Estimation (Undergrad)

## The procedure

Inputs: counting register `t` qubits in |0⟩^t, system register holding eigenstate `|ψ⟩`.

1. Apply Hadamard to each counting qubit.
2. For `j = 0, ..., t-1`: apply controlled-`U^{2^j}` (control = counting qubit `j`, target = system).
3. Apply inverse QFT to counting register.
4. Measure counting register. Result `m`; estimate `θ ≈ m / 2^t`.

## Why it works

After step 2, the counting register is in superposition with phases:
`(1/√(2^t)) Σ_k e^{2πi k θ} |k⟩`

This is the QFT of a state concentrated at `θ · 2^t`. Inverse QFT then projects to a state concentrated near `m = θ · 2^t`.

Measuring gives `m` close to `θ · 2^t`. Dividing by `2^t` gives `θ` with `t` bits of precision.

## Accuracy

For exact `θ = m / 2^t`: measurement gives `m` with probability 1.

For non-exact `θ`: measurement gives the closest `m'` with high probability. Probability of getting within `1/2^t` of true `θ` is at least `4/π² ≈ 0.4`. Repeat ~3 times to get high accuracy.

For `n`-bit accuracy + 99% confidence: use `t = n + log(1/ε)` qubits where ε is desired error. Modest overhead.

## Use cases

**Shor's algorithm**: factoring reduces to estimating phase of modular-exponentiation operator. The phase encodes the period; period gives factorization.

**HHL (linear systems)**: phase estimation extracts eigenvalues of the system matrix; from eigenvalues, the inverse can be applied via quantum operations.

**Quantum chemistry**: ground-state energy = ground-state eigenvalue. Phase estimation is the canonical way to extract it.

**Quantum simulation**: simulating a Hamiltonian with eigenvalues = energies. Phase estimation extracts spectral information.

## Catch: eigenstate preparation

Phase estimation requires an eigenstate of `U`. This is often the hard part:

- Sometimes you have an approximate eigenstate (e.g., Hartree-Fock approximation in chemistry).
- The protocol gracefully degrades: input a superposition; output is a probabilistic mixture of eigenvalue estimates.
- Variational algorithms (VQE) sidestep this by parameterizing trial states.

In practice: phase estimation is powerful when eigenstate preparation is tractable. Otherwise, variational + iterative methods replace it.

<!-- tier:grad -->
# Phase Estimation (Grad)

## Iterative phase estimation

Standard PE uses `t` qubits in the counting register. Iterative PE uses just 1 ancilla, repeated `t` times.

**Procedure**: estimate `θ` bit-by-bit, starting with the least significant bit. Use classical post-processing between rounds.

Trade-off: more measurements but fewer qubits. Useful for hardware with few qubits.

## Quantum-amplitude-estimation (QAE)

Phase estimation applied to estimate amplitudes (i.e., probabilities). Quadratic speedup over classical sampling.

**For estimating `p` to precision ε**: classical Monte Carlo needs `O(1/ε²)` samples; QAE needs `O(1/ε)` queries.

**Used in**: Monte Carlo applications (option pricing, integration), Grover-related algorithms.

## Resource costs

For `n`-bit accuracy in `θ`:
- **Counting register**: `n + O(log(1/ε))` qubits.
- **Controlled-`U^{2^j}` operations**: total query complexity `O(2^n)` queries to `U`.

For Shor at 2048-bit RSA:
- Counting register: ~4000 qubits.
- Modular exponentiation: ~10^11 elementary gates.
- T-gate count dominated by phase estimation's controlled rotations.

The query complexity is exponential in the precision `n`. For chemistry (where `n` is moderate), reasonable. For other applications, scaling matters.

## Variational alternatives

**Variational Quantum Eigensolver (VQE)** sidesteps phase estimation:
- Parameterize a trial state `|ψ(θ)⟩`.
- Compute energy `⟨ψ(θ)|H|ψ(θ)⟩` via shallow circuits.
- Classically optimize `θ`.

VQE is shorter circuits → suitable for NISQ. Phase estimation requires fault-tolerance for chemistry-scale problems.

The two coexist:
- VQE for current NISQ era.
- Phase estimation for fault-tolerant era when scale demands it.

## Connection to HSP

Phase estimation is the core subroutine of abelian HSP algorithms:
- For period finding (Shor's), `U` is modular multiplication; eigenvalues encode the period.
- For discrete log, `U` is multiplication-by-`g`; eigenvalues encode the discrete log.

The HSP / QFT / phase-estimation triple is the algorithmic core of most known exponential-advantage quantum algorithms.

## References

- Kitaev 1995. Quantum measurements and the Abelian stabilizer problem.
- Cleve, Ekert, Macchiavello, Mosca 1998. Quantum algorithms revisited.
- Brassard, Høyer, Mosca, Tapp 2002. Quantum amplitude amplification and estimation.
- Nielsen & Chuang §5.2.
