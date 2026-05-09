---
title: Quantum Fourier Transform (QFT)
category: quantum
---
<!-- tier:intro -->
# Quantum Fourier Transform (QFT)

The quantum analog of the discrete Fourier transform.

`QFT|x⟩ = (1/√N) Σ_y e^{2πi xy/N} |y⟩`

where `N = 2^n` for `n` qubits.

The most useful quantum subroutine. Foundation of Shor's algorithm, phase estimation, hidden subgroup problems.

**Speedup**: implementable in `O(n²)` gates (`O(n log n)` with approximation). Classical FFT: `O(N log N) = O(2^n n)`. Exponential gate-count advantage.

But: you can't directly read out the QFT result; useful algorithms exploit its structure.

<!-- tier:undergrad -->
# QFT (Undergrad)

## What QFT does

For input `|x⟩` (a basis state), QFT produces:
`(1/√N) Σ_y e^{2πi xy/N} |y⟩`

This is a uniform superposition with phases proportional to `xy`.

For superposition input `Σ_x α_x |x⟩`, by linearity:
`Σ_y β_y |y⟩` where `β_y = (1/√N) Σ_x α_x e^{2πi xy/N}` — exactly the discrete Fourier transform of the amplitudes.

QFT diagonalizes the shift operator. If a function `α_x` has period `r`, the QFT amplitude `β_y` peaks at multiples of `N/r`. This extracts periodicity.

## The circuit

QFT on n qubits:
1. Apply H to qubit 0.
2. Apply controlled-R_{π/2} (control = qubit 1, target = qubit 0).
3. Apply controlled-R_{π/4} (control = qubit 2).
4. ... (controlled rotations decreasing in angle).
5. Apply H to qubit 1; controlled rotations from qubits 2, 3, ..., n-1.
6. Continue.
7. SWAP qubits to reverse order.

Total: n Hadamards + n(n-1)/2 controlled rotations. `O(n²)` gates.

**Approximate QFT**: drop rotations smaller than some threshold. `O(n log n)` gates with bounded error.

## Reading the QFT output

Catch: measurement gives one basis state, not the whole transform.

`P(measure y) = |β_y|²` where β_y is the QFT amplitude.

Useful algorithms (Shor, phase estimation) exploit specific outputs:
- **Period finding**: peaks at multiples of `N/r`. Continued-fraction expansion extracts `r`.
- **Phase estimation**: amplitudes concentrate near `2^t · θ` for eigenvalue `e^{2πiθ}`.

Without such structure, QFT is just a basis change — useful subroutine, not a standalone algorithm.

<!-- tier:grad -->
# QFT (Grad)

## Why QFT is fast

Classical FFT: divide-and-conquer evaluates `N` outputs in `O(N log N)` operations. Each output requires `O(log N)` work.

Quantum: the OUTPUT IS the amplitude pattern. No explicit per-output work needed. The unitary's structure (recursive decomposition) gives `O(n²)` gates.

Key insight: quantum represents data implicitly via amplitudes; transforming amplitudes is structural, not per-element.

But: quantum CAN'T extract all amplitudes (one measurement = one outcome). Quantum FFT is fast for transformation, not for full readout.

## Generalization: HSP via QFT

For any abelian group `G`:
- Define a generalized Fourier transform on `G`.
- Implementing it efficiently is the quantum subroutine.
- Combining with oracle queries solves the Hidden Subgroup Problem.

Algorithms for:
- `Z_N`: Shor's factoring + discrete log.
- `(Z_2)^n`: Simon's problem.
- General abelian: efficient quantum algorithm.
- Non-abelian: open in general.

QFT is the workhorse of abelian HSP.

## Approximate QFT

Coppersmith 1994: AQFT drops controlled rotations smaller than some angle `2π/2^k`.

Resulting error: bounded by `n · 2^{-k+1}` for k-truncated AQFT. For Shor's, `k = O(log n)` suffices for high accuracy.

Trade-off: fewer gates → worse accuracy. Choose `k` to balance gate count vs target accuracy.

In fault-tolerant computing, AQFT reduces T-gate count significantly. Critical for resource estimation.

## Inverse QFT

QFT is unitary; QFT⁻¹ = QFT†. The inverse circuit applies the same operations in reverse order with conjugated rotations.

Phase estimation uses QFT†: forward exposes the eigenvalue structure; inverse extracts it as a measurement outcome.

## Connection to FFT

Both compute discrete Fourier transforms. Differences:

| | Classical FFT | Quantum QFT |
|---|---|---|
| Input | Vector of N complex numbers | n-qubit superposition |
| Operations | Arithmetic on N values | Unitary on `2^n` amplitudes |
| Output | Vector of N complex numbers | n-qubit measurement |
| Gates | `O(N log N) = O(2^n n)` | `O(n²)` |
| Readout | All N values | Probabilistic per shot |

QFT's exponential gate-count advantage is balanced by readout cost. Useful when the structure of the FT (peaks, periodicity) is what matters.

## References

- Coppersmith 1994. An approximate Fourier transform useful in quantum factoring.
- Shor 1994. Polynomial-time algorithms for prime factorization and discrete logarithms on a quantum computer.
- Nielsen & Chuang §5.
- Childs. Lecture Notes on Quantum Algorithms. (UMD; comprehensive QFT treatment.)
