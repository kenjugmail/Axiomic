---
title: NISQ
category: quantum
---
<!-- tier:intro -->
# NISQ

**Noisy Intermediate-Scale Quantum** (Preskill 2018). The current era of quantum computing.

- 50-1000 physical qubits.
- No error correction.
- Gate fidelities ~99% (single-qubit) and ~99-99.5% (two-qubit).
- Coherence times ~milliseconds.

**Scale**: large enough that classical simulation is hard at the boundary; small enough that fault-tolerance isn't yet possible.

NISQ is transitional. Useful as a research period to develop techniques for fault-tolerant computing. Practical advantage on real-world problems is limited.

<!-- tier:undergrad -->
# NISQ (Undergrad)

## What's possible

**Quantum supremacy** (random sampling): Google 2019, USTC 2020. Hard for classical to simulate; not practically useful.

**Variational chemistry** (small molecules): VQE for H₂, LiH, BeH₂. Energies estimable to chemical accuracy. Mostly classically beatable.

**Optimization toy problems**: QAOA for small MaxCut + portfolio. Classically beatable today.

**Quantum simulation of small lattice models**: Hubbard, Ising. Useful for physics research.

**Quantum machine learning**: kernel methods, parameterized circuits. Mixed results.

## What isn't possible

**Cryptanalysis (Shor at scale)**: requires fault-tolerance. Decades away.

**General optimization advantage**: classical heuristics still beat quantum on real problems.

**Useful machine learning**: most QML demonstrations are classically simulable + don't beat classical ML.

**Long-horizon quantum simulation**: noise + decoherence limit depth.

## Algorithm constraints

NISQ algorithms must:
- **Be SHALLOW**: ~100-1000 gates max before noise dominates.
- **Tolerate noise**: error mitigation, expectation-value-based outputs.
- **Be hybrid quantum-classical**: most NISQ algorithms are variational (VQE, QAOA).

Deep algorithms (Shor, Grover at scale) require fault-tolerance.

## Hardware platforms

- **Superconducting** (IBM, Google, Rigetti, Quantinuum): leading in qubit count + speed. ~1000+ qubits.
- **Trapped ions** (IonQ, Quantinuum, AQT): leading in fidelity. ~100 qubits.
- **Photonic** (PsiQuantum, Xanadu, ORCA): emerging; room temperature.
- **Neutral atoms** (QuEra, Pasqal, Atom Computing): rapid progress; flexible architectures.

No single platform has won. Production quantum infrastructure will likely be heterogeneous.

## The honest assessment

**What's real**: hardware genuinely improving. Algorithms being co-designed with hardware constraints. Some demos are classically very hard.

**What's hype**: most "quantum advantage" claims fall to improved classical methods. NISQ-era utility is limited.

**The strategic frame**: NISQ is the experimental period. Develop techniques + algorithms; learn hardware tradeoffs. Useful FT-QC is years away.

<!-- tier:grad -->
# NISQ (Grad)

## Resource constraints

**Coherence**: T₂ (dephasing) ~50-200 μs for superconducting; minutes for trapped ions. Gates ~10-100 ns.

**Maximum gate count per algorithm**: ~1000-10000 (superconducting) or ~10000+ (ions) before noise dominates.

**Effective qubit count**: less than nominal because:
- Some qubits used as ancillas / for measurement.
- Crosstalk between qubits.
- Connectivity constraints (linear chain, 2D grid, all-to-all).

A 1000-qubit machine often has 100-300 effective "useful" qubits for algorithms.

## Error mitigation (vs error correction)

**Error correction**: detect + fix during computation. Requires fault-tolerance.

**Error mitigation**: post-process noisy results to estimate ERROR-FREE expectation values. Doesn't fix individual outcomes; works on NISQ.

Techniques:
- **Zero-noise extrapolation (ZNE)**: deliberately increase noise; extrapolate to zero.
- **Probabilistic error cancellation (PEC)**: characterize noise; sample from quasi-distribution.
- **Symmetry verification**: reject runs violating symmetries.
- **Readout error mitigation**: invert confusion matrix.
- **Dynamical decoupling**: insert pulses averaging out specific noise.

Combined: real NISQ workflows use multiple techniques.

## NISQ + classical-simulation arms race

Each "quantum advantage" claim is followed by improved classical methods:
- Google 2019: 53-qubit random sampling. Estimated 10000 years classical. Later challenged.
- IBM 2023: 127-qubit demo. Beaten by tensor-network methods within months.

The boundary keeps moving. NISQ is in a moving competition with classical algorithms.

## Why not more impressive results?

- **Algorithms**: most NISQ algorithms (VQE, QAOA) haven't beaten classical for any practically interesting problem.
- **Barren plateaus**: gradient vanishing in variational algorithms; hard to scale.
- **Noise**: depth + size limits binding.
- **Classical simulation**: better than expected for many problem types.

## Path forward

**Near-term NISQ utility candidates**:
- Quantum chemistry of moderate molecules (~50-100 electrons).
- Specific physics simulations.
- Niche kernel-method ML applications.

**Long-term**:
- Fault-tolerant quantum computing (~2030+) for cryptanalysis, large-scale simulation.
- Quantum networks, distributed quantum computing.
- Quantum-classical hybrids continue indefinitely.

NISQ era likely lasts until ~2030. Then transition to early fault-tolerant. Useful broad-scale quantum computing: 2035-2045 range.

## References

- Preskill 2018. Quantum computing in the NISQ era and beyond.
- Bharti et al. 2022. Noisy intermediate-scale quantum algorithms.
- Cerezo et al. 2021. Variational quantum algorithms.
- Cao et al. 2019. Quantum chemistry in the age of quantum computing.
