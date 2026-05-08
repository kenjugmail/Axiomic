---
title: Surface Code
category: quantum
---
<!-- tier:intro -->
# Surface Code

The favored quantum error correction code for large-scale quantum computing.

A 2D topological code on a lattice. Each plaquette has a 4-qubit stabilizer (X-type or Z-type). Logical operators are non-trivial loops on the lattice.

**Strengths**:
- **Best threshold** of practical codes: ~1% physical error per gate.
- **Local interactions**: only nearest-neighbor stabilizers. Matches superconducting + ion-trap hardware.
- **Distance scales with lattice size**: `d × d` lattice protects against `d/2` errors.

Kitaev 1997. Bravyi-Kitaev 1998. The pragmatic choice for fault-tolerant quantum computing.

<!-- tier:undergrad -->
# Surface Code (Undergrad)

## Structure

**2D lattice** of physical qubits, interleaved with stabilizer qubits.

**Two types of stabilizers**:
- **X-type plaquette**: parity of 4 surrounding qubits in X basis. Detects Z errors.
- **Z-type plaquette**: parity in Z basis. Detects X errors.

A `d × d` surface code:
- `O(d²)` physical qubits.
- 1 logical qubit (basic).
- Distance `d`: corrects up to `(d-1)/2` errors.

For target logical error rate ~10^-15: need `d ~ 25-35` (for ~1% physical error rate).

## Stabilizer measurement

Each cycle:
1. Couple a stabilizer ancilla to its 4 surrounding qubits via CNOTs (or CZs).
2. Measure the ancilla.
3. Result = parity of the 4 qubits.
4. Reset ancilla.

Time per cycle: ~microseconds. Errors detected as syndrome anomalies.

## Decoding

Given the syndrome (which stabilizers detected errors), infer the most likely error pattern + apply correction.

**Standard algorithm**: minimum-weight perfect matching (MWPM). Match syndrome anomalies pairwise; the matching gives the error pattern.

**Real-time requirement**: must decode within microseconds. FPGA-based implementations standard.

**Modern alternatives**: neural-network decoders, union-find decoders. Sometimes faster + scaling better.

## Logical operations

**Easy** (transversal-ish):
- **Logical X, Z**: apply X (or Z) along a logical operator path.
- **Logical CNOT**: lattice surgery between adjacent surface-code patches.
- **Logical Hadamard**: lattice rotation.
- **Logical S**: combination.

**Hard**:
- **Logical T**: not transversal. Requires **magic state distillation**.

T-gate cost dominates fault-tolerant computing.

## Magic state distillation

Distill high-fidelity T-states from many noisy ones via post-selection + verification.

**Procedure**:
1. Prepare ~15 noisy T-states.
2. Apply Reed-Muller-style code; measure ancillas.
3. If post-selection succeeds: output 1 high-fidelity T-state.
4. Failure rate ~10x; concatenate distillation rounds.

**Cost**: ~10x-100x more physical-qubit-time per logical T-gate vs Clifford gates.

For fault-tolerant Shor at scale: T-count ~10^11 → distillation cost dominates.

<!-- tier:grad -->
# Surface Code (Grad)

## Threshold + scaling

**Threshold**: ~1% physical error per gate. Below this, increasing distance `d` exponentially decreases logical error rate.

**Logical error rate**: scales as `(p/p_th)^{(d-1)/2}` where `p` is physical error and `p_th` is threshold. For `p = 0.5%, d = 25`, logical error ~10^-15.

**Threshold wasn't always known to be this high**: original surface-code analysis gave ~1%. Later improved analysis confirmed.

**Why not higher**: trade-off in code structure. Higher thresholds with non-local LDPC codes; surface code wins on locality.

## Lattice surgery

**Logical CNOT** between surface-code patches: not transversal.

**Lattice surgery**: temporarily merge two patches into one via boundary operations; measure the boundary; split. Outcome implements logical CNOT.

Time: a few syndrome cycles. Adds modest overhead but enables Clifford operations.

**Used for**: most logical Clifford operations between patches.

## Defects + braiding

Earlier surface-code variants used **defects**: holes in the lattice that act as logical qubits. Logical operations via **braiding** defects around each other.

Lattice surgery has largely replaced this — simpler resource accounting, easier to implement.

**Defects** still appear in some codes (e.g., color-code variants).

## Recent results

**Google 2023-2024**: distance-3 + distance-5 surface-code logical qubits. Logical error decreasing with distance — first demonstration of QEC scaling.

**Quantinuum 2024**: trapped-ion logical qubits with measurable error suppression.

**IBM 2024-2025**: roadmap to 1000+ physical qubits with fault-tolerant primitives.

The field is approaching the regime where fault-tolerant computing matters in practice.

## LDPC competitors

**Bivariate-bicycle codes** (Bravyi et al. 2024 IBM): 12 logical qubits per ~280 physical qubits. ~10x reduction in overhead vs surface code.

**Trade-off**: require some non-local stabilizers. Suit architectures with movable qubits (neutral atoms, ion traps).

May replace surface code in specific platforms. Active research as of 2025.

## Magic state distillation cost

Magic state distillation is the dominant resource cost. Reducing it:

- **15-to-1 distillation**: standard. ~15 noisy T-states → 1 high-fidelity.
- **Reed-Muller variants**: 5-to-1, 116-to-12 distillation.
- **Recent**: 16x reductions in T-gate cost via better distillation circuits.

For Shor at scale: most physical-qubit-time goes to distillation, not the algorithm itself.

## Real-time decoding bottleneck

Surface code decoding must keep up with syndrome rate (~MHz). Decoder complexity:
- **MWPM**: standard but `O(syndromes³)` worst-case.
- **Union-find**: linear-time. Less optimal but fast.
- **Neural-network decoders**: trained on simulated syndromes. Fast inference.
- **Distributed decoders**: parallelize across the lattice.

For large surface codes (d=30+), real-time decoding is itself a research challenge.

## References

- Kitaev 1997. Fault-tolerant quantum computation by anyons.
- Bravyi & Kitaev 1998. Quantum codes on a lattice with boundary.
- Fowler, Mariantoni, Martinis, Cleland 2012. Surface codes: towards practical large-scale quantum computation. *Phys. Rev. A*. (The standard reference.)
- Horsman et al. 2012. Surface code quantum computing by lattice surgery.
- Acharya et al. 2023 (Google). Suppressing quantum errors by scaling a surface code logical qubit.
- Bravyi et al. 2024. High-threshold and low-overhead fault-tolerant quantum memory.
