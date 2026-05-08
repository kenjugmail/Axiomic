---
title: CNOT Gate
category: quantum
---
<!-- tier:intro -->
# CNOT Gate

The most important two-qubit gate. **C**ontrolled-**NOT**: applies X to the target qubit if the control qubit is |1⟩.

```
[[1,0,0,0],
 [0,1,0,0],
 [0,0,0,1],
 [0,0,1,0]]
```

Action on basis states:
- |00⟩ → |00⟩
- |01⟩ → |01⟩
- |10⟩ → |11⟩
- |11⟩ → |10⟩

CNOT generates **entanglement** when applied to a superposition. The 2-gate sequence (H + CNOT) creates a Bell state.

<!-- tier:undergrad -->
# CNOT Gate (Undergrad)

## How CNOT entangles

Starting from `|0⟩|0⟩`:
1. Apply H to qubit 0: `(|0⟩ + |1⟩)|0⟩/√2`.
2. Apply CNOT (control = qubit 0, target = qubit 1): `(|00⟩ + |11⟩)/√2`.

The result is the Bell state Φ⁺ — fundamentally entangled. Measuring either qubit perfectly correlates with the other.

This 2-gate circuit is the most important short circuit in quantum computing.

## CNOT properties

- **Self-inverse**: CNOT × CNOT = I.
- **Symmetric in CZ basis**: CNOT = (I ⊗ H) CZ (I ⊗ H). Different forms; same gate.
- **Generates entanglement only on superposition inputs**. CNOT on basis states gives basis states.
- **Universal with single-qubit gates**: any unitary decomposes into single-qubit + CNOT.

## CNOT count as a complexity measure

For 2-qubit unitaries, the number of CNOTs needed is a measure of complexity:
- Identity, single-qubit gates, SWAP-with-single-qubit: 0 CNOTs.
- Most 2-qubit unitaries: 3 CNOTs (KAK decomposition).
- SWAP: 3 CNOTs.

For larger circuits, total CNOT count is a key resource metric. Hardware fidelity is dominated by 2-qubit gates; reducing CNOT count is critical optimization.

## CNOT in algorithms

CNOTs appear everywhere:

- **Bell state preparation**: H + CNOT.
- **Quantum teleportation**: CNOT + H + measurement + classical correction.
- **Error correction**: stabilizer measurements use many CNOTs.
- **VQE / QAOA**: parameterized circuits often start with CNOTs to build entanglement.
- **Shor's algorithm**: modular arithmetic uses many CNOTs.

CNOT is the canonical entangling gate. Hardware platforms compete on CNOT fidelity + speed.

## Hardware reality

CNOT is implemented differently on different platforms:

- **Superconducting**: cross-resonance gates, ~100 ns, ~99.5% fidelity.
- **Trapped ions**: Mølmer-Sørensen gates, ~10-100 μs, ~99.9% fidelity.
- **Photonic**: probabilistic CNOTs via measurement-induced operations.
- **Neutral atoms**: Rydberg-blockade-based CNOT, ~1-10 μs.

Fidelity differences explain hardware tradeoffs. Trapped ions have the highest CNOT fidelity; superconducting has the highest gate speed.

<!-- tier:grad -->
# CNOT Gate (Grad)

## KAK decomposition

Any 2-qubit unitary `U` decomposes:
`U = (A_1 ⊗ A_2) · e^{i(αX⊗X + βY⊗Y + γZ⊗Z)} · (B_1 ⊗ B_2)`

where `A_i, B_i` are single-qubit unitaries. The middle entangling part is parameterized by `(α, β, γ) ∈ Weyl chamber`.

CNOT corresponds to `(π/4, 0, 0)` (up to single-qubit rotations).
SWAP corresponds to `(π/4, π/4, π/4)`.

KAK gives optimal CNOT counts:
- Generic 2-qubit unitary: 3 CNOTs.
- Special cases (controlled-U with `U` diagonal): 2 CNOTs.

Compilers use KAK to find minimum-CNOT representations.

## CNOT in stabilizer formalism

CNOT is a Clifford gate: maps Pauli operators to Pauli operators under conjugation:
- CNOT (X ⊗ I) CNOT = X ⊗ X.
- CNOT (I ⊗ X) CNOT = I ⊗ X.
- CNOT (Z ⊗ I) CNOT = Z ⊗ I.
- CNOT (I ⊗ Z) CNOT = Z ⊗ Z.

This means CNOTs propagate errors:
- An X error on the control becomes an X error on both qubits.
- A Z error on the target becomes a Z error on both.

Important for error correction analysis: CNOT propagates errors but in predictable ways.

## CNOT depth in fault-tolerant circuits

In fault-tolerant computing, the surface code applies CNOTs (between data qubits + ancilla qubits) for syndrome extraction. The number + depth of these CNOTs determines the syndrome cycle time.

Optimizations: parallel CNOTs (when qubits don't share targets), CNOT scheduling, ancilla reuse.

For a `d × d` surface code, syndrome extraction is `O(d)` CNOT depth.

## Connection to classical reversible computing

CNOT in the classical context: reversible XOR. `(a, b) → (a, a XOR b)`.

Classical reversible computing uses Toffoli (CCNOT) for universality. Quantum extends this with H + CNOT for true quantum advantage.

The connection: any classical reversible circuit can be implemented quantumly with the same gate count. Quantum advantage requires going BEYOND classical reversible computing — into superposition + interference.

## Variants

- **CCNOT (Toffoli)**: 3-qubit; flips target if both controls are |1⟩.
- **CSWAP (Fredkin)**: 3-qubit; SWAPs targets if control is |1⟩.
- **C^k-NOT**: target flips if all `k` controls are |1⟩. Decomposes into ~`O(k)` Toffoli + ancillas.

These are essential for arithmetic + boolean logic on quantum computers.

## References

- Nielsen & Chuang §4.3.
- Vidal & Dawson 2004. Universal quantum circuit for two-qubit transformations with three CNOTs. (KAK CNOT count.)
- Cross et al. 2019. Validating quantum computers using randomized model circuits.
- Krantz et al. 2019. *A quantum engineer's guide to superconducting qubits*.
