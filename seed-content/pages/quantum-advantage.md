---
title: Quantum Advantage
category: quantum
---
<!-- tier:intro -->
# Quantum Advantage

Performing a useful computation faster on quantum hardware than any classical computer.

Distinct from **quantum supremacy** (any task no classical computer can do — useful or not).

**Quantum advantage status (2026)**: not convincingly demonstrated for a useful problem. Quantum supremacy demonstrated multiple times; quantum advantage is the next milestone.

**Where it might emerge**: quantum chemistry, materials simulation, specific cryptanalysis. Active research target.

<!-- tier:undergrad -->
# Quantum Advantage (Undergrad)

## Three concepts often conflated

**Quantum supremacy** (Preskill 2012, now sometimes "quantum computational advantage"): quantum computer performs a task no classical computer can complete in reasonable time. Doesn't require usefulness.

**Quantum advantage**: quantum computer is FASTER than classical for a USEFUL problem. Stronger; not yet convincingly demonstrated.

**Quantum utility**: quantum computer produces useful results, even if not faster than classical (e.g., easier to implement, lower energy). Recent term; emerging applications.

## Quantum supremacy demonstrations

**Google Sycamore (2019)**: 53-qubit random circuit sampling. Estimated 10000 years classical (later partially challenged).

**USTC Jiuzhang (2020)**: photonic Gaussian boson sampling. 76 detected photons; classically infeasible.

**USTC Zuchongzhi (2021)**: 60-qubit superconducting random sampling.

**IBM (2023)**: 127-qubit error-mitigated demonstration. Beaten by tensor-network methods within months.

**Pattern**: each supremacy claim spurs improved classical methods. The boundary moves.

## Where quantum advantage might emerge

**Quantum chemistry + materials**:
- Simulating electronic structure of molecules + materials.
- Strong reason for advantage (problem is inherently quantum).
- Likely first practical advantage; mid-2020s to early 2030s.

**Cryptanalysis (Shor at scale)**:
- Decisive advantage on factoring + discrete log.
- Requires fault-tolerance; 2030s-2040s.

**Optimization (QAOA, quantum annealing)**:
- Advantage less clear; classical heuristics very good.
- Hopes for specific structured problems.

**Quantum simulation more broadly**:
- Many-body physics, condensed-matter.
- Natural fit; emerging applications.

**General machine learning**:
- Limited quantum advantage on real ML tasks.
- Niche kernel applications + quantum-native data.

## Why broad quantum advantage isn't expected

Classical computers benefit from:
- Massive memory bandwidth.
- Parallelism (GPUs, TPUs, custom accelerators).
- Mature algorithms + libraries.
- Cheap, abundant hardware.

Quantum advantage requires the problem to:
- Have structure quantum can exploit (oracle queries, periodicity, algebraic structure).
- Be fundamentally bounded by classical limits.
- Have implementable quantum oracles + circuits.

Most computing problems don't satisfy these. Quantum will excel at specific problems, like GPUs vs CPUs.

## The honest 2026 assessment

- Quantum supremacy demonstrated.
- Quantum advantage on useful problems: not yet.
- Likely first wins: quantum chemistry, ~2027-2030.
- Cryptanalytic Shor: 2035-2045.
- Broad quantum-utility era: starts 2030s, decades to mature.

<!-- tier:grad -->
# Quantum Advantage (Grad)

## The classical-simulation arms race

For each "quantum advantage" claim, classical algorithms catch up:

**Boson sampling**: classical algorithms improved from `2^n` to `~n^3 · 2^{0.5n}` over the years. Practical advantage limited.

**Random circuit sampling**: tensor-network methods + improved hardware push classical capability higher.

**127-qubit IBM 2023 result**: beaten by tensor-network simulations within months.

**Pattern**: the moving target makes definitive advantage hard. Some experts argue against the supremacy framing entirely.

## Provable separations vs empirical advantage

**Provable**: complexity-theoretic separations (e.g., BQP vs P) are unproven in general. Some restricted models have provable separations (oracle models, BQP vs PostBPP).

**Empirical**: quantum hardware actually outperforms classical hardware on specific tasks. Verified on specific demonstrations; subject to classical-improvement attacks.

For practical purposes, empirical evidence matters. Provable separations are research-direction guides.

## Quantum utility

IBM (Bharti et al., Kim et al. 2023): "quantum utility" — useful results from current hardware, even without strict advantage.

Argument: even if classical methods can match the quantum computer, having quantum hardware that produces useful results is an engineering milestone toward future advantage.

Some criticism: utility without advantage is just "another tool", not transformative.

## What "useful" means

Real-world impact requires:
- Problem of practical importance.
- Quantum solution beats classical on metric (time, accuracy, energy).
- Cost (hardware, expertise) justifiable.
- Reliability + reproducibility.

Most quantum-advantage claims fail on at least one. Quantum chemistry's path:
- Chemistry is practically important.
- Quantum simulation natural fit.
- Hardware costs declining.
- Reliability improving but not yet matched.

The chemistry advantage is plausible by 2027-2030.

## Cryptographic advantage

**Shor at scale**: definitive advantage on cryptanalysis. Requires fault-tolerance.

Quantum-resistant cryptography (PQC) is being deployed PRE-EMPTIVELY (NIST PQC standards 2024). The advantage is real even before it's exploitable.

For long-lived secrets, the harvest-now-decrypt-later threat makes Shor relevant TODAY.

## Long-term outlook

Quantum advantage will compound:
- 2026: limited demos; chemistry pilot applications.
- 2030: small fault-tolerant computations; broader quantum utility.
- 2035: cryptanalytic Shor; transformative impact in some domains.
- 2040+: broad practical quantum advantage in target domains.

Predictions vary widely. Hardware progress is faster than expected; algorithmic progress is mixed.

Most credible scenario: gradual emergence over 2027-2040, beginning with chemistry + materials, expanding to cryptography + niche optimization, eventually reaching broader physics + chemistry simulation as the killer applications.

## References

- Preskill 2012. Quantum computing and the entanglement frontier. (Coined "quantum supremacy".)
- Arute et al. 2019 (Google). Quantum supremacy using a programmable superconducting processor.
- Zhong et al. 2020 (USTC). Quantum computational advantage using photons.
- Kim et al. 2023 (IBM). Evidence for the utility of quantum computing before fault tolerance.
- Aaronson 2018. Quantum computational supremacy. Various blog posts.
