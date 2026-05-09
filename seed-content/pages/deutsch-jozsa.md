---
title: Deutsch-Jozsa Algorithm
category: quantum
---
<!-- tier:intro -->
# Deutsch-Jozsa Algorithm

The first quantum algorithm to demonstrate exponential advantage over classical (1992).

**Problem**: given `f: {0,1}^n → {0,1}`, promised to be either CONSTANT (always 0 or always 1) or BALANCED (0 for half the inputs, 1 for the other half), decide which.

**Classical**: worst case `2^{n-1} + 1` queries to be sure.

**Quantum**: 1 query.

Toy problem; not practically useful. But cleanly demonstrates the quantum-advantage mechanism: superposition + interference.

<!-- tier:undergrad -->
# Deutsch-Jozsa (Undergrad)

## The procedure

1. Initialize `n` query qubits to |0⟩^n; one ancilla to |1⟩.
2. Apply Hadamard to all n+1 qubits.
3. Apply oracle `O_f`: |x⟩|y⟩ → |x⟩|y ⊕ f(x)⟩.
4. Apply Hadamard to first n qubits.
5. Measure the first n qubits.
- All 0 → constant.
- Otherwise → balanced.

## Why it works

After step 2: `(1/√2^n) Σ_x |x⟩` ⊗ `(|0⟩ - |1⟩)/√2`.

The oracle imprints `f(x)` on the phase via the **phase kickback** trick:
`O_f |x⟩(|0⟩ - |1⟩)/√2 = (-1)^{f(x)} |x⟩(|0⟩ - |1⟩)/√2`.

After the oracle: `(1/√2^n) Σ_x (-1)^{f(x)} |x⟩` ⊗ ancilla.

Apply final Hadamards. The amplitude on |0...0⟩:
`(1/2^n) Σ_x (-1)^{f(x)}`

- **Constant f**: all signs same; sum = ±2^n; amplitude = ±1. Probability of 0...0 = 1.
- **Balanced f**: signs cancel; sum = 0; amplitude = 0. Probability of 0...0 = 0.

Single measurement distinguishes the two cases with certainty.

## Why classical needs many queries

Each classical query reveals f(x) for a single x. To prove f is constant, you'd need to verify f at >half of inputs (otherwise the function could still be balanced). Worst case: `2^{n-1} + 1` queries.

The quantum algorithm extracts a GLOBAL property (constant vs balanced) from the structure of all amplitudes simultaneously — via interference at the end.

## Why it's a toy problem

The promise (f is exactly constant or exactly balanced) is artificial. Real-world functions don't come with such promises.

The algorithm doesn't generalize to other interesting problems directly. It shows the MECHANISM (superposition + interference) but doesn't itself solve a useful problem.

But: Deutsch-Jozsa is the simplest algorithm where quantum demonstrates exponential advantage. Pedagogical value is high.

<!-- tier:grad -->
# Deutsch-Jozsa (Grad)

## History + significance

**Deutsch 1985**: original algorithm for n=1. Solves the problem with 1 query vs 2 classical queries — modest 2x speedup.

**Deutsch-Jozsa 1992**: generalization to n qubits. Exponential speedup (1 vs 2^{n-1}).

This was the first proof that quantum computers could outperform classical for some problems. It motivated the field — particularly Shor's 1994 work, which showed practical impact.

## Connection to Bernstein-Vazirani

**Bernstein-Vazirani problem** (1993): given `f(x) = a · x mod 2` for unknown `a ∈ {0,1}^n`, find `a`.

Solution: same circuit as Deutsch-Jozsa. The output of the measurement IS `a`.

Classical: needs n queries (each query gives one component of a).

Quantum: 1 query.

Same algorithm; different interpretation of the output. Both demonstrate quantum advantage from superposition + interference.

## Connection to Hidden Subgroup Problem

Deutsch-Jozsa is a special case of the Hidden Subgroup Problem (HSP) for the group `(Z_2)^n`:
- Hidden subgroup: trivial (constant) or index 2 (balanced).
- Solving HSP for abelian groups gives polynomial-time algorithms.

This frames Deutsch-Jozsa as part of a broader algorithmic family: HSP via QFT-based methods. Shor's, Simon's, period finding all fit this template.

## Robustness + relativization

Deutsch-Jozsa demonstrates a separation in the BLACK-BOX (oracle) model. Without the oracle promise, the problem could be polynomial classically.

This is a relativized result. It doesn't directly prove `BQP ≠ P`. The unrelativized question (whether quantum gives exponential advantage on real problems) remains open in complexity theory.

## Why it's still taught

Deutsch-Jozsa is the cleanest teaching example because:
1. Simple oracle (just XOR).
2. Clean phase-kickback trick.
3. Final Hadamards do FFT-like extraction.
4. Output is unambiguous (single measurement).

Almost every quantum-computing textbook introduces it before Grover or Shor.

## References

- Deutsch 1985. Quantum theory, the Church-Turing principle and the universal quantum computer. *Proc. Roy. Soc. A*.
- Deutsch & Jozsa 1992. Rapid solution of problems by quantum computation. *Proc. Roy. Soc. A*.
- Bernstein & Vazirani 1993. Quantum complexity theory. *STOC*.
- Nielsen & Chuang §1.4.3.
