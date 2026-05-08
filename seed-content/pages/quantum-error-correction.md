---
title: Quantum Error Correction (QEC)
category: quantum
---
<!-- tier:intro -->
# Quantum Error Correction

Encoding logical qubits into many physical qubits with redundancy, so errors can be detected + corrected without disturbing the logical state.

**Required because**: physical qubits are noisy (~99% gate fidelity in 2025). Long quantum algorithms (millions to billions of gates) need much higher effective fidelity. QEC bridges the gap.

**Why hard (vs classical)**:
- **No-cloning**: can't make backups.
- **Continuous errors**: not just bit flips.
- **Measurement disturbs**: detecting errors must not collapse the data.

**Modern standard**: surface code. Threshold ~1% physical error per gate.

<!-- tier:undergrad -->
# QEC (Undergrad)

## The basic idea

A **logical qubit** is encoded into multiple **physical qubits**.

Detection of errors uses **stabilizer measurements**: measure parity of multiple qubits without learning individual qubit values.

The measurement result (a "syndrome") indicates what error occurred (X on qubit 3, Z on qubit 5, etc.). Apply the corresponding correction; logical state preserved.

## Three-qubit bit-flip code (toy example)

Encode:
- Logical |0⟩ = |000⟩
- Logical |1⟩ = |111⟩

To detect a single bit flip:
- Measure `Z₁Z₂` and `Z₂Z₃` (parity operators; don't reveal individual qubits).
- 4 possible syndromes → identify which qubit (if any) flipped.
- Apply X to the flipped qubit. Done.

**Limit**: only handles X errors. Phase flips (Z errors) and arbitrary rotations need more elaborate codes.

## Realistic codes

**9-qubit Shor code** (1995): first complete code; handles all single-qubit errors.

**7-qubit Steane code** (1996): more efficient; same protection.

**Surface code** (1997): topological; the modern standard. Best threshold (~1%).

Each encodes 1 logical qubit; uses growing physical-qubit overhead for stronger protection.

## Threshold theorem

**Aharonov-Ben-Or, Knill-Laflamme-Zurek 1996**: if physical gate fidelity is BELOW a certain threshold, fault-tolerant quantum computing is achievable by scaling up the QEC code.

Surface code threshold: ~1% physical error per gate.

Current best hardware (2025): physical errors ~10^-3. Just below threshold.

**Implication**: more physical qubits → fewer logical errors. Scale up.

## Magic state distillation

Stabilizer codes implement Clifford gates "for free" (transversally). Non-Clifford gates (T) require **magic state distillation**.

Distillation: take many noisy T-state ancillas; output a few high-fidelity ones via post-selection + verification.

**Cost**: ~10x-100x more physical qubits + time per logical T-gate vs Clifford gates.

Magic state distillation is the dominant overhead in fault-tolerant computing. Many algorithms have T-counts in the billions.

## Where QEC is

**2023-2025 milestones**:
- Google demonstrated logical-qubit error rate decreasing with code distance — first practical demonstration of QEC's scaling promise.
- Quantinuum trapped-ion logical qubits with measurable error suppression.
- IBM roadmap to 1000+ qubits with QEC primitives.

**Where we're going**:
- 2025-2030: thousands of qubits; logical-qubit demonstrations + small fault-tolerant computations.
- 2030+: tens of thousands of qubits; useful fault-tolerant computation.

QEC is the bridge from NISQ to useful quantum computing. The hardest engineering challenge remaining.

<!-- tier:grad -->
# QEC (Grad)

## Stabilizer formalism

Gottesman 1997 framework. A code is defined by a set of commuting Pauli operators (stabilizers); the codespace is their joint +1 eigenspace.

For an `[n, k, d]` code:
- `n` physical qubits.
- `k` logical qubits.
- `d` distance (correctable errors per logical qubit).

Examples:
- 3-qubit bit flip: `[3, 1, 3]` against X errors only.
- 9-qubit Shor: `[9, 1, 3]`.
- 7-qubit Steane: `[7, 1, 3]`.
- Surface code distance-`d`: `[d², 1, d]`.

## Surface code details

**Topological code on a 2D lattice**. Each plaquette is a 4-qubit stabilizer (X-type or Z-type).

**Logical operators**: non-trivial loops on the lattice. Logical X spans one direction; logical Z spans the other.

**Decoding**: matching syndrome to error pattern. Standard algorithm: minimum-weight perfect matching (MWPM).

**Threshold**: ~1% physical error per gate.

**Logical operations**:
- Clifford (CNOT, H, S): transversal or via lattice surgery.
- T: magic state distillation.

## LDPC codes

**Low-Density Parity-Check** codes have lower overhead than surface code: more logical qubits per physical qubit.

**Trade-off**: require non-local stabilizer measurements. Hardware-dependent.

Active research (Bravyi-Cross-Kim-Gambetta 2024 IBM): bivariate-bicycle codes promise 12 logical qubits per ~280 physical; vs 1 per 1000+ for surface code.

May replace surface code in specific architectures (neutral atoms with movement, photonics).

## Resource estimation

Resources for fault-tolerant Shor at 2048 bits:
- ~4000 logical qubits.
- ~10^11 logical T-gates.
- ~10^7 physical qubits (with surface code distance ~30).
- ~weeks of runtime.

Most resources go to magic state distillation. Reducing T-count or distillation overhead is the key research direction.

## Real-time decoding

Surface code requires real-time decoding: sampling syndromes at MHz rates and computing corrections within microseconds.

**MWPM-based decoders**: standard. Implementable on FPGAs.

**Neural-network decoders**: trained to predict error patterns. Sometimes faster than MWPM.

**Distributed decoders**: needed for very large codes; computational scaling becomes a bottleneck.

## Bosonic codes

Encode logical qubits in CONTINUOUS-VARIABLE bosonic modes (e.g., photonic harmonic oscillators).

- **Cat codes**: superpositions of coherent states.
- **GKP codes**: stabilizer-style in phase space.
- **Binomial codes**: discrete superposition.

Used in some superconducting + photonic systems. Different overhead profile than qubit codes.

## References

- Shor 1995. Scheme for reducing decoherence in quantum computer memory.
- Steane 1996. Multiple-particle interference and quantum error correction.
- Kitaev 1997. Quantum computations: algorithms and error correction. (Surface code.)
- Bravyi & Kitaev 1998. Quantum codes on a lattice with boundary.
- Fowler et al. 2012. Surface codes: towards practical large-scale quantum computation.
- Bravyi et al. 2024. High-threshold and low-overhead fault-tolerant quantum memory. (LDPC codes at IBM.)
