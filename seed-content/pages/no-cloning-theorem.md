---
title: No-Cloning Theorem
category: quantum
---
<!-- tier:intro -->
# No-Cloning Theorem

A fundamental constraint on quantum information: there's NO unitary `U` such that `U|ψ⟩|0⟩ = |ψ⟩|ψ⟩` for arbitrary unknown `|ψ⟩`.

You cannot copy an unknown quantum state.

Wootters-Zurek and Dieks 1982. The proof is short: linearity of `U` is incompatible with cloning.

**Consequences**:
- Can't make backup copies of unknown qubits.
- Quantum error correction must work without cloning.
- Quantum cryptography becomes possible (eavesdropping disturbs).
- Quantum teleportation works (no cloning, but state transfer with destruction of original).

<!-- tier:undergrad -->
# No-Cloning Theorem (Undergrad)

## The proof

Suppose a cloner exists: `U|ψ⟩|0⟩ = |ψ⟩|ψ⟩` for any |ψ⟩.

Then:
- `U|0⟩|0⟩ = |0⟩|0⟩`.
- `U|1⟩|0⟩ = |1⟩|1⟩`.

By linearity:
- `U(|0⟩+|1⟩)|0⟩ = |0⟩|0⟩ + |1⟩|1⟩`.

But the cloner should have produced:
- `(|0⟩+|1⟩)(|0⟩+|1⟩)/√2 = (|00⟩ + |01⟩ + |10⟩ + |11⟩)/√2` (after normalization).

These don't match. Contradiction. Cloning impossible.

## What you CAN clone

- **Known states**: just prepare another copy from scratch.
- **Classical information**: bits encoded as |0⟩ or |1⟩ — you can copy.
- **Orthogonal states with prior knowledge**: a fixed orthogonal set has perfect cloning.

What you CAN'T clone: arbitrary unknown states.

## Implications for cryptography

**BB84 protocol** (Bennett-Brassard 1984): Alice + Bob exchange qubits prepared in random bases. An eavesdropper can't copy the qubits, must measure (which disturbs). Discrepancies in their post-shared key reveal eavesdropping.

The no-cloning theorem is the foundation of quantum key distribution. Eavesdropping is detectable; secure keys can be agreed upon over an insecure channel.

## Implications for error correction

Classical error correction copies bits + uses redundancy. No-cloning prevents this for quantum.

QEC works around it via stabilizer codes: encode a logical qubit in MULTIPLE physical qubits but never as a copy. The redundancy is in the parity structure, not in copying.

This is why QEC is so much more elaborate than classical EC.

## Implications for teleportation

Quantum teleportation transfers an unknown state from Alice to Bob — without copying.

The protocol:
1. Alice + Bob share a Bell pair.
2. Alice performs Bell-basis measurement on her qubit + her half of Bell pair.
3. Alice transmits 2 classical bits.
4. Bob applies a correction (I, X, Z, or XZ).
5. Bob's qubit is now in the original state. Alice's is destroyed (her measurements collapsed it).

Net result: state moved from Alice to Bob. No copy made (consistent with no-cloning). Original destroyed.

<!-- tier:grad -->
# No-Cloning Theorem (Grad)

## Generalizations

**No-broadcast theorem**: even for mixed states (allowing approximate cloning where each copy is the original's marginal), cloning works only for commuting operators. Strict generalization of no-cloning.

**No-deletion theorem**: you also can't perfectly delete a copy of an unknown state. Symmetric to no-cloning.

**Imperfect cloners**: optimal approximate cloning has fidelity < 1. The Buzek-Hillery cloner achieves fidelity ~5/6 for two output copies. Useful in some protocols where partial information is OK.

**Probabilistic cloning**: cloning succeeds with probability < 1. Sometimes useful.

## Connection to entropy

The no-cloning theorem can be derived from information-theoretic arguments. Cloning would create entropy from nothing — violating thermodynamics.

This connection is subtle but illuminating: quantum no-go theorems often have thermodynamic counterparts.

## Cloning in adversarial contexts

In quantum-money protocols, no-cloning prevents counterfeiting. Wiesner's quantum money (1969) is the canonical example: each note has a unique unclonable quantum state; verification is by querying the state.

**Limit**: the bank must keep records to verify. Public-key quantum money (where anyone can verify) is harder; some protocols exist but require additional cryptographic assumptions.

## Cloning vs cryptography

**No-cloning enables QKD** (BB84, E91): eavesdropping necessarily disturbs.

**Quantum digital signatures**: based on no-cloning. Sign once; can't be forged.

**Quantum oblivious transfer + multi-party computation**: based on no-cloning + entanglement.

The no-cloning theorem is the foundation of much of quantum cryptography.

## References

- Wootters & Zurek 1982. A single quantum cannot be cloned. *Nature*.
- Dieks 1982. Communication by EPR devices.
- Buzek & Hillery 1996. Quantum copying: beyond the no-cloning theorem. *Phys. Rev. A*.
- Wiesner 1983. Conjugate coding. *SIGACT News*.
