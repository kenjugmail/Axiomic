---
title: Post-Quantum Cryptography
category: quantum
---
<!-- tier:intro -->
# Post-Quantum Cryptography (PQC)

Cryptographic schemes that are believed to be secure against both classical and quantum attackers.

Shor's algorithm breaks RSA, Diffie-Hellman, ECC. PQC replaces these with schemes based on different (Shor-resistant) hard problems.

**NIST PQC standardization** (2016-2024) published the first PQC standards in 2024:
- **Kyber** (key encapsulation).
- **Dilithium, Falcon** (signatures).
- **SPHINCS+** (hash-based signatures).

Industry migration is happening NOW even though cryptanalytic quantum computers don't yet exist.

<!-- tier:undergrad -->
# Post-Quantum Cryptography (Undergrad)

## Why PQC matters now

**Quantum threat timeline**: cryptanalytic quantum computers likely 2030s-2040s.

**Migration time**: cryptography migration takes 5-15 years (TLS, S/MIME, code-signing, certificates, embedded systems).

**Harvest now, decrypt later**: adversaries capture encrypted traffic now; decrypt later when QC exists. Long-lived secrets (national-security, medical-records, code-signing keys) at risk.

These three together force PQC migration BEFORE Q-Day.

## The PQC families

Each family bases security on a different hard problem.

**Lattice-based** (Kyber, Dilithium, Falcon):
- Based on Shortest Vector Problem (SVP) hardness.
- Efficient + relatively small keys.
- The dominant family in NIST standards.

**Hash-based** (SPHINCS+):
- Based only on hash function security.
- Stateless; large signatures.
- Used for code-signing, firmware updates.

**Code-based** (Classic McEliece):
- Based on syndrome-decoding hardness.
- Very large public keys.
- Long-trusted; conservative choice.

**Multivariate** (Rainbow — broken):
- Based on solving systems of multivariate polynomial equations.
- Mostly broken in NIST process.

**Isogeny-based** (SIKE — broken in 2022):
- Based on supersingular elliptic-curve isogenies.
- Promising; broken by classical attack 2022.

## NIST PQC winners

Standardized in 2024:

- **CRYSTALS-Kyber** (lattice-based KEM): main key-encapsulation primitive.
- **CRYSTALS-Dilithium** (lattice-based signatures): main signature primitive.
- **Falcon** (lattice-based signatures): smaller signatures than Dilithium; more complex implementation.
- **SPHINCS+** (hash-based signatures): backup signature primitive.

All four are now standards. Industry adoption is rolling out.

## Migration approach

**Hybrid mode**: combine classical (RSA/ECC) + PQC. If either is broken, the other still secures. Standard for 2025-2030 transition.

**Cryptographic agility**: design systems where crypto primitives can be swapped without redesign. Long-term resilience against future breakages.

**Key sizes**: PQC keys are typically larger than ECC. Some adjustments to protocols (TLS, X.509) needed.

**Performance**: Kyber + Dilithium are fast (comparable to ECC for many use cases). Other PQC families slower.

## Real-world deployment

- **TLS 1.3 hybrid mode** (Cloudflare, Google, others): rolled out 2024-2025.
- **OpenSSH PQC**: emerging.
- **Signal Protocol**: PQC-augmented variants.
- **Browser PQC**: Chromium + Firefox prototypes.
- **Banking + government**: regulated industries leading PQC adoption.

The migration will take years. Crypto is conservative; PQC is now the future direction.

<!-- tier:grad -->
# Post-Quantum Cryptography (Grad)

## Lattice-based crypto details

**Hard problems**:
- **Learning With Errors (LWE)**: given samples `(a_i, b_i = a_i · s + e_i mod q)`, recover `s`. The basis for Kyber + Dilithium.
- **Module-LWE**: structured variant; better efficiency.
- **NTRU**: ring-based; older + alternative basis.

**Why believed quantum-secure**: best classical algorithms run in sub-exponential time; Shor doesn't apply.

**Caveat**: lattice-based security depends on assumptions that may turn out to be wrong. Active cryptanalysis area.

## Hash-based signatures

**SPHINCS+**: stateless hash-based signatures. Security depends only on hash function security; no algebraic structure to break.

**Trade-off**: signatures are large (~10-30 KB) vs ~64 bytes for ECDSA. Keys are smaller. Verification is fast.

**Use case**: code-signing where signature size is OK + long-term security matters.

**Stateful variants** (XMSS, LMS) have smaller signatures but require keeping state. Used in some embedded contexts.

## Quantum impact on symmetric crypto

Symmetric ciphers (AES) face only QUADRATIC speedup from Grover. Doubling key sizes maintains security:
- AES-128 → effective 64-bit security under Grover.
- AES-256 → 128-bit security. Still safe.

Hash functions: similar quadratic story (Grover applied to brute-force preimages). SHA-256 → 128-bit collision resistance.

Symmetric crypto migration: increase key sizes; otherwise unchanged.

## Q-Day estimates

When can quantum computers break current crypto?

- Optimistic (Mosca, others): mid-2030s.
- Median (Mosca survey 2024): 2035-2045.
- Pessimistic: 2050+ or never.

Wide spread because predicting hardware progress is hard. Mosca's argument: even if Q-Day is 2040, migration takes 10+ years; START NOW.

Many governments (US NSA, UK NCSC) recommend transitioning to PQC by 2030.

## Cryptanalytic race

Side note: PQC schemes are themselves under active cryptanalysis. Some are broken during NIST process:
- Rainbow (multivariate): broken 2022.
- SIKE (isogeny): broken 2022 (classical attack).

Lattice-based are most-trusted because they've been studied longest + have strongest theoretical underpinnings (worst-case to average-case reductions for some lattice problems).

But: there's no proof of quantum hardness. Surprise attacks remain possible.

## Practical advice

- **Audit your cryptography**: where do you use RSA/DH/ECC? What's the threat exposure?
- **Plan migration**: prioritize long-lived secrets, code-signing, archived data.
- **Use hybrid PQC**: dual-key signatures + KEMs in transition.
- **Track NIST + IETF**: standards evolve; keep up.
- **Test in dev environments**: PQC has different performance + key-size characteristics.
- **Budget time**: realistic migration is years.

## References

- Bernstein & Lange 2017. Post-quantum cryptography. *Nature*.
- NIST PQC Standardization documents (2016-2024).
- Mosca 2018. Cybersecurity in an era with quantum computers.
- Castryck & Decru 2022. An efficient key recovery attack on SIDH. (The SIKE break.)
- IETF PQC drafts + standards.
