---
title: Shor's Algorithm
category: quantum
---
<!-- tier:intro -->
# Shor's Algorithm

Polynomial-time integer factoring on a quantum computer.

Shor 1994. Factoring `n`-bit integers in `O(n³)` quantum operations vs sub-exponential classically.

**Implications**: breaks RSA, Diffie-Hellman, elliptic-curve cryptography. The driving result behind 30 years of quantum-computing investment + post-quantum-cryptography migration.

**Reduction**: factoring → period finding → quantum Fourier transform.

**Hardware requirements**: ~4000 logical qubits + ~10^11 gates for 2048-bit RSA. Requires fault-tolerant quantum computing — likely 2030s.

<!-- tier:undergrad -->
# Shor's Algorithm (Undergrad)

## Reduction to period finding

Factoring `N` reduces to finding the period of `f(x) = a^x mod N` for random `a` coprime to `N`.

The period `r` is the smallest positive integer with `a^r ≡ 1 mod N`.

Once you know `r`:
- If `r` is even and `a^{r/2} ≢ -1 mod N`, then `gcd(a^{r/2} - 1, N)` and `gcd(a^{r/2} + 1, N)` are non-trivial factors of `N`.
- For random `a`, this works with probability ≥ 1/2.
- Just retry with different `a` until success.

The reduction is purely classical number theory. The quantum innovation is fast period finding.

## Quantum period finding

1. Set up counting register (~2n qubits) + target register (n qubits).
2. Apply Hadamard to counting register: superposition of all `x ∈ {0, ..., 2^q - 1}`.
3. Apply modular exponentiation: `|x⟩|0⟩ → |x⟩|a^x mod N⟩`.
4. (Measure target register; optional.) Counting register collapses to superposition of `x` values with the same `a^x mod N` — values differing by multiples of period `r`.
5. Apply QFT to counting register.
6. Measure. Result `c` such that `c/2^q ≈ k/r` for some integer `k`.
7. Continued-fraction expansion of `c/2^q` recovers `r`.

The QFT extracts the period: input has periodicity `r`, output peaks at multiples of `2^q / r`.

## Resource requirements

For `n`-bit factoring:
- **Logical qubits**: `O(n)`. For 2048-bit RSA: ~4000.
- **Gate count**: `O(n³)`. For 2048-bit: ~10^11.
- **Coherence**: maintain entanglement across full circuit. Hours-level coherence at 10^-12 effective gate-error rate.

NISQ-era: nope. Hardware noise ~10^-3 per gate; 10^11 gates would have errors compound to junk.

Fault-tolerant: with surface code, ~1000-10000 physical qubits per logical. Total: 10^7-10^8 physical qubits.

## What's been demonstrated

Toy examples:
- `15 = 3 × 5` (4 qubits).
- `21 = 3 × 7` (5 qubits).

Most published "Shor demonstrations" include classical preprocessing that gives most of the answer. True end-to-end quantum factoring at scale awaits fault-tolerance.

Realistic timeline: cryptanalytic Shor in 2030s-2040s.

<!-- tier:grad -->
# Shor's Algorithm (Grad)

## Cost details

**Modular exponentiation**: dominant resource cost. Implements `|x⟩|0⟩ → |x⟩|a^x mod N⟩`.
- Classical algorithm: `O(n³)` operations via repeated squaring.
- Quantum implementation: `O(n³)` Toffoli gates → `O(n³)` T-gates.

**T-gate count**: dominates fault-tolerant resource. For 2048-bit RSA, T-count is ~10^11.

**Magic state distillation**: each T-gate consumes a distilled magic state. Distillation has ~10^4 physical-qubit-time overhead.

Total physical resources: ~10^7-10^8 qubits + ~weeks of runtime.

## Discrete logarithm

Shor's framework also solves discrete-log: given `g, h ∈ G_N`, find `x` such that `g^x = h`.

Reduces to a 2D HSP. Same `O(n³)` quantum complexity.

Breaks Diffie-Hellman + ECC (which depend on discrete-log hardness).

## Why Shor is significant

Pre-Shor: Deutsch-Jozsa demonstrated quantum advantage for an artificial problem. Few researchers thought this would translate to practical impact.

Shor changed everything: a real, practically important problem (factoring) where quantum gives exponential advantage. RSA was the most-deployed asymmetric crypto; threat was concrete.

Result: massive investment + research. Most current quantum-computing infrastructure traces back to factoring as motivation.

## Post-quantum cryptography (PQC)

Industry response: develop crypto that's resistant to Shor.

**NIST PQC standardization** (2016-2024):
- **Kyber** (lattice-based, key encapsulation).
- **Dilithium** (lattice-based, signatures).
- **SPHINCS+** (hash-based, signatures).
- **Falcon** (lattice-based, signatures).

Standards published 2024. Adoption starting 2025-2030.

**Migration timeline**: typical crypto deployments take 5-15 years. Must start before Q-Day (when quantum computers can break current crypto).

**Harvest now, decrypt later**: state-level adversaries believed to be capturing encrypted traffic. Long-lived secrets at risk. PQC migration urgent for long-term-secrets.

## Hybrid PQC

Transitional approach: combine classical + PQC. If one breaks, the other still secures.

Standard for 2025-2030+. Industry rolling out hybrid TLS, hybrid signing, hybrid key agreement.

## Limitations

Shor's at scale isn't NISQ. Requires fault-tolerant quantum computing.

Estimating timing:
- 2025-2030: 1000-10000 physical qubits; demonstrate fault-tolerant primitives.
- 2030-2035: 10^4-10^5 qubits; small fault-tolerant computations.
- 2035-2045: 10^6-10^8 qubits; cryptanalytically-relevant Shor at scale.

Estimates vary widely (5 years to 30 years). Mid-point ~2035-2040.

## References

- Shor 1994. Polynomial-time algorithms for prime factorization and discrete logarithms on a quantum computer. *FOCS*.
- Beauregard 2003. Circuit for Shor's algorithm using 2n+3 qubits.
- Gidney & Ekerå 2021. How to factor 2048 bit RSA integers in 8 hours using 20 million noisy qubits.
- Mosca 2018. Cybersecurity in an era with quantum computers.
- NIST PQC standardization documents (2024).
