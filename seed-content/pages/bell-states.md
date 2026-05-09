---
title: Bell States
category: quantum
---
<!-- tier:intro -->
# Bell States

Four maximally-entangled 2-qubit states that form an orthonormal basis:

- **Φ⁺ = (|00⟩ + |11⟩)/√2**
- **Φ⁻ = (|00⟩ − |11⟩)/√2**
- **Ψ⁺ = (|01⟩ + |10⟩)/√2**
- **Ψ⁻ = (|01⟩ − |10⟩)/√2**

Generated from |00⟩, |01⟩, |10⟩, |11⟩ via H + CNOT.

Bell states are the canonical examples of quantum entanglement. Used in teleportation, dense coding, EPR experiments, quantum cryptography.

<!-- tier:undergrad -->
# Bell States (Undergrad)

## Generation circuit

To produce Bell states from computational basis states:
1. Start with two qubits in |a⟩|b⟩ where `a, b ∈ {0, 1}`.
2. Apply H to qubit 0.
3. Apply CNOT (control = qubit 0, target = qubit 1).

Mapping:
- |00⟩ → Φ⁺
- |01⟩ → Ψ⁺
- |10⟩ → Φ⁻
- |11⟩ → Ψ⁻

The Bell-state preparation circuit is the simplest entangling circuit.

## Properties

**Maximally entangled**: each Bell state has reduced density matrix `ρ = I/2` for either qubit. Maximum entropy.

**Mutually orthogonal**: `⟨Φ⁺|Φ⁻⟩ = 0`, etc. They form a basis.

**Distinguishable by Bell-basis measurement**: a single 2-qubit measurement can identify which Bell state.

**Self-testable**: Bell states uniquely characterized by their correlations + Bell-inequality violations.

## Bell measurement

To measure in the Bell basis:
1. Apply CNOT (target → control's pair).
2. Apply H to qubit 0.
3. Measure both qubits in Z basis.

The 2-bit output identifies the Bell state:
- 00 → Φ⁺, 01 → Ψ⁺, 10 → Φ⁻, 11 → Ψ⁻.

This is the inverse of the Bell-state-preparation circuit.

## Used in

- **Quantum teleportation**: Alice + Bob share a Bell pair; Alice's Bell measurement transmits state to Bob (with classical correction).
- **Dense coding**: Bob can transmit 2 classical bits per qubit by manipulating his half of an entangled pair.
- **Entanglement swapping**: chain Bell pairs to extend entanglement over distance.
- **Bell-inequality experiments**: show quantum correlations exceed classical limits.
- **Quantum repeaters**: build a long-distance quantum channel via chained entanglement.

<!-- tier:grad -->
# Bell States (Grad)

## Bell-basis representation

Any 2-qubit state can be expanded in the Bell basis:
`|ψ⟩ = α Φ⁺ + β Φ⁻ + γ Ψ⁺ + δ Ψ⁻`

with `|α|² + |β|² + |γ|² + |δ|² = 1`. Bell-state measurements project onto this basis.

## Bell + magic

The Bell states are stabilizer states (reachable by Clifford gates from |00⟩). They're classically simulable.

For useful quantum computation, you need NON-stabilizer states — produced by T-gates or other non-Clifford operations. Bell states alone aren't enough for quantum advantage; they're the entanglement-resource starting point.

## CHSH inequality + Tsirelson's bound

For Bell state Φ⁺, the CHSH operator achieves expectation value `2√2` — the maximum quantum value (Tsirelson's bound).

Classical local hidden-variable theories: ≤ 2.

The 2√2 violation is the strongest demonstration that entangled states can't be explained by classical correlations.

## Tomographic reconstruction

Reconstructing a Bell state from measurements requires:
- 9 Pauli-string measurements (3×3 settings on 2 qubits).
- ~10000 shots per setting for ~1% precision.
- Maximum-likelihood reconstruction or linear inversion.

Verifying entanglement experimentally is well-established but resource-intensive.

## Connection to QEC

Bell states are part of stabilizer codes. The repetition code's encoding is built around Bell-state-like correlations. Surface codes use Bell-pair-like local entanglement extensively.

## References

- Bell 1964. On the Einstein-Podolsky-Rosen paradox.
- Bennett et al. 1993. Teleporting an unknown quantum state. *Phys. Rev. Lett.*
- Aspect et al. 1982. Experimental tests of Bell's inequalities.
- Hensen et al. 2015. Loophole-free Bell test. *Nature*.
