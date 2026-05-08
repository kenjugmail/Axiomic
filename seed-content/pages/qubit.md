---
title: Qubit
category: quantum
---
<!-- tier:intro -->
# Qubit

The fundamental unit of quantum information.

A **qubit** is a unit vector in a 2D complex Hilbert space:

`|ψ⟩ = α|0⟩ + β|1⟩`, with `|α|² + |β|² = 1`.

Unlike a classical bit (which is 0 OR 1), a qubit can be in a **superposition** — a complex linear combination. Measurement collapses the qubit to |0⟩ with probability `|α|²` or |1⟩ with probability `|β|²`.

The complex amplitudes `α, β` (not just probabilities) carry information; the relative phase between them matters for interference, which powers quantum algorithms.

<!-- tier:undergrad -->
# Qubit (Undergrad)

## Mathematical structure

A qubit lives in the 2D complex Hilbert space `ℂ²`. Standard basis:

`|0⟩ = [1; 0]`, `|1⟩ = [0; 1]`

A general state:

`|ψ⟩ = α|0⟩ + β|1⟩`, `|α|² + |β|² = 1`

The normalization condition ensures total probability = 1 upon measurement.

**Global phase**: `e^{iθ}|ψ⟩` is the same physical state as `|ψ⟩`. Only RELATIVE phases between basis states are observable.

## Bloch-sphere picture

Every pure single-qubit state corresponds to a point on the surface of a 3D sphere:

`|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩`

- `θ ∈ [0, π]`: polar angle (latitude).
- `φ ∈ [0, 2π)`: azimuthal angle (longitude).

Notable points:
- North pole (θ=0): |0⟩.
- South pole (θ=π): |1⟩.
- Equator: superposition states. |+⟩ = (|0⟩ + |1⟩)/√2 at φ=0.

Single-qubit gates act as rotations on the Bloch sphere.

## Measurement

Born rule: `P(outcome 0) = |α|²`; `P(outcome 1) = |β|²`. After measurement, the qubit collapses to the corresponding basis state.

You can measure in any orthonormal basis. Common bases:
- **Z (computational)**: {|0⟩, |1⟩}. Default.
- **X**: {|+⟩, |−⟩}.
- **Y**: {|+i⟩, |−i⟩}.

Measurement statistics depend on the basis. Same state measured in different bases gives different outcomes.

## Physical realizations

Qubits can be implemented in many physical systems:

- **Superconducting transmons** (IBM, Google): two lowest energy levels of a microwave cavity + Josephson junction.
- **Trapped ions** (IonQ, Quantinuum): hyperfine levels of an atomic ion.
- **Photons** (PsiQuantum, Xanadu): polarization or path encoding.
- **Neutral atoms** (QuEra, Pasqal): atomic Rydberg states.
- **Spin qubits** (silicon, NV-centers): electron or nuclear spin.

Each has different properties: gate speed, fidelity, connectivity, scalability. No platform has won.

<!-- tier:grad -->
# Qubit (Grad)

## Density matrices for mixed states

Pure states |ψ⟩ are idealizations. Real qubits in noisy environments are described by **density matrices**:

`ρ = Σ p_i |ψ_i⟩⟨ψ_i|`

A 2×2 Hermitian matrix with `Tr(ρ) = 1` and eigenvalues in [0, 1].

**Pure state**: `ρ = |ψ⟩⟨ψ|`; `Tr(ρ²) = 1`.

**Maximally mixed state**: `ρ = I/2`; `Tr(ρ²) = 1/2`. Equally likely to be |0⟩ or |1⟩; no coherence.

Density matrices are essential for analyzing noise, decoherence, and partial-trace operations.

## Bloch-vector representation

Every density matrix can be written as:

`ρ = (I + r⃗ · σ⃗)/2`

where `r⃗ ∈ ℝ³` and `σ⃗ = (σ_x, σ_y, σ_z)` are the Pauli matrices.

- Pure states: `|r⃗| = 1`. Surface of Bloch sphere.
- Mixed states: `|r⃗| < 1`. Interior of Bloch sphere.
- Maximally mixed: `r⃗ = 0`. Center.

Bloch-vector dynamics under gates + noise has clean geometric interpretation.

## Quantum operations as channels

Beyond unitary gates, real qubits undergo **completely positive trace-preserving (CPTP) maps**:

`ρ → Σ_k K_k ρ K_k†`

with `Σ K_k† K_k = I`.

The `K_k` are Kraus operators. Examples:
- Bit-flip channel: `K_0 = √(1-p) I`, `K_1 = √p X`.
- Amplitude damping: `K_0 = [[1, 0], [0, √(1-γ)]]`, `K_1 = [[0, √γ], [0, 0]]`. Models T₁ decay.
- Phase damping: models T₂ decay.

Channels generalize unitary gates + capture noise.

## Connection to classical information

A qubit holds infinite continuous parameters but yields only 1 classical bit per measurement. **Holevo's theorem**: at most `n` classical bits per `n` qubits transmitted. So qubits don't give superdense classical communication — they give COMPUTATION.

The advantage is in PROCESSING, not storage. Quantum algorithms exploit superposition + interference to compute differently from classical.

## References

- Nielsen & Chuang. *Quantum Computation and Quantum Information* (2010). The reference textbook.
- Preskill. Lecture notes on quantum information (Caltech).
- Kaye, Laflamme, Mosca. *An Introduction to Quantum Computing* (2007).
