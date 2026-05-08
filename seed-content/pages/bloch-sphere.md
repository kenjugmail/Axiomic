---
title: Bloch Sphere
category: quantum
---
<!-- tier:intro -->
# Bloch Sphere

A geometric picture of a single-qubit state. Every pure single-qubit state corresponds to a point on the surface of a 3D unit sphere.

`|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ}sin(θ/2)|1⟩`

- `θ ∈ [0, π]`: polar angle (north pole = |0⟩; south pole = |1⟩).
- `φ ∈ [0, 2π)`: azimuthal angle (longitude; encodes relative phase).

Single-qubit gates act as **rotations** on the Bloch sphere. The geometric intuition makes single-qubit operations easy to reason about.

<!-- tier:undergrad -->
# Bloch Sphere (Undergrad)

## Coordinates

Cartesian Bloch-vector components:
- `r_x = sin(θ)cos(φ)`
- `r_y = sin(θ)sin(φ)`
- `r_z = cos(θ)`

For a pure state, `|r⃗| = 1` (on the surface).

For mixed states (density matrix `ρ`), `|r⃗| < 1` (interior of the sphere). Maximally mixed state at the center: `ρ = I/2`, `r⃗ = 0`.

## Notable points

- **|0⟩**: north pole (z = +1).
- **|1⟩**: south pole (z = -1).
- **|+⟩ = (|0⟩+|1⟩)/√2**: x = +1 (positive x-axis).
- **|−⟩ = (|0⟩−|1⟩)/√2**: x = -1.
- **|+i⟩ = (|0⟩+i|1⟩)/√2**: y = +1.
- **|−i⟩ = (|0⟩−i|1⟩)/√2**: y = -1.

The Pauli operators X, Y, Z correspond to the x, y, z axes; their eigenstates are at the poles of those axes.

## Single-qubit gates as rotations

- **X gate**: 180° rotation about x-axis. |0⟩ ↔ |1⟩.
- **Y gate**: 180° rotation about y-axis.
- **Z gate**: 180° rotation about z-axis. Phase flip on |1⟩.
- **H gate**: 180° rotation about (x+z)/√2 axis. |0⟩ ↔ |+⟩, |1⟩ ↔ |−⟩.
- **R_x(θ)**: rotation by θ about x-axis. Continuous family.
- **R_y(θ), R_z(θ)**: rotations about y and z axes.
- **T gate**: 45° rotation about z-axis.

Any single-qubit unitary can be written as a sequence of three rotations (Euler decomposition):
`U = R_z(α) R_y(β) R_z(γ)` (up to global phase).

## Why it doesn't generalize to 2 qubits

The Bloch sphere works only for single qubits. For 2+ qubits:
- State space is `4^n - 1` real parameters (after normalization). 
- For 2 qubits, 15-dimensional projective space — no 3D picture.
- Entangled states have no individual Bloch-sphere representation.

The Bloch sphere is a useful pedagogical + analytical tool for single qubits; for multi-qubit systems, you need the algebraic framework directly.

<!-- tier:grad -->
# Bloch Sphere (Grad)

## Bloch vector for density matrices

Density matrix:
`ρ = (I + r⃗ · σ⃗)/2`

where `σ⃗ = (σ_x, σ_y, σ_z)` are the Pauli matrices and `r⃗ ∈ ℝ³` is the Bloch vector.

- `|r⃗| = 1`: pure state. Surface of Bloch sphere.
- `|r⃗| < 1`: mixed state. Interior.
- `|r⃗| = 0`: maximally mixed. Center.

`Tr(ρ²) = (1 + |r⃗|²)/2`. Purity ranges from 1/2 (mixed) to 1 (pure).

## Channels as Bloch-vector dynamics

Quantum channels (CPTP maps) act on Bloch vectors:
`r⃗ → A r⃗ + b⃗`

where `A` is a 3×3 real matrix and `b⃗` ∈ ℝ³.

Examples:
- **Bit-flip channel** (probability `p`): `A = diag(1, 1-2p, 1-2p)`, `b⃗ = 0`.
- **Phase damping** (probability `p`): `A = diag(√(1-p), √(1-p), 1)`, `b⃗ = 0`.
- **Amplitude damping** (parameter `γ`): non-trivial `A` and `b⃗`. Models T₁ relaxation.

For unitary channels, `A` is a rotation matrix and `b⃗ = 0`. For dissipative channels, `A` contracts the Bloch ball.

## Higher-dimensional generalizations

For `d`-level systems (qudits), the analog is the **Bloch ball** in `d²-1` dimensions. For `d > 2`, the geometry is more complex; the surface isn't a simple sphere.

**Generalized Bloch vectors** use `d²-1` Hermitian generators (Gell-Mann matrices for d=3). Mathematically clean; visually less useful.

For multi-qubit systems, no clean geometric picture exists. The state space is `2^n - 1` complex projective dimensions; reducing to a manageable picture loses essential structure.

## Connection to NMR + experimental physics

The Bloch sphere has its origins in NMR (nuclear magnetic resonance). The Bloch equations describe spin precession:

`dr⃗/dt = γ B⃗ × r⃗ - (T₁, T₂, T₂)-relaxation`

where `B⃗` is the magnetic field. Identical mathematics to qubit dynamics (since superconducting qubits + spin qubits are governed by similar Hamiltonians).

## Practical use

For algorithm design:
- Visualize single-qubit gate sequences geometrically.
- Compose rotations via vector-cross-product reasoning.
- Identify when sequences cancel or combine.

For experimentalists:
- Plot tomography results as Bloch-vector trajectories.
- Visualize T₁, T₂ decay as vector contraction toward equilibrium.
- Diagnose calibration issues from Bloch-vector deviations.

For multi-qubit reasoning, abandon the picture; use algebra directly.

## References

- Nielsen & Chuang §1.3, §2.2.
- Bloch 1946. Nuclear induction.
- Bengtsson & Życzkowski. *Geometry of Quantum States* (2006).
