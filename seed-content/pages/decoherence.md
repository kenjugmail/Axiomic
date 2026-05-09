---
title: Decoherence
category: quantum
---
<!-- tier:intro -->
# Decoherence

The loss of quantum coherence due to environmental coupling. The fundamental obstacle to scaling quantum computation.

A quantum superposition `α|0⟩ + β|1⟩` becomes a CLASSICAL probabilistic mixture as the qubit interacts with environment. Once decohered, no interference is possible — the state is classical.

**Two timescales**:
- **T₁ (relaxation)**: time for |1⟩ to decay to |0⟩. Energy loss to environment.
- **T₂ (dephasing)**: time for relative phase to randomize. Often shorter than T₁.

Modern superconducting qubits: T₁ ~100 μs, T₂ ~50-200 μs.

<!-- tier:undergrad -->
# Decoherence (Undergrad)

## Why decoherence happens

A real qubit isn't isolated. It couples to:

- **Photons** (electromagnetic environment): radiation, blackbody at finite temperature.
- **Phonons** (lattice vibrations): in solid-state qubits.
- **Two-level systems (TLS)** in materials: amorphous defects with their own quantum states.
- **Other qubits** (crosstalk).
- **Measurement apparatus**.

Each interaction can entangle the qubit with the environment, scrambling phase information.

## T₁ vs T₂

**T₁ (relaxation time)**: energy relaxation. |1⟩ → |0⟩ + emission of energy to environment.

For a qubit in superposition `α|0⟩ + β|1⟩`:
- After time `t`, |1⟩ component decays as `e^{-t/T₁}`.
- The state becomes weighted toward |0⟩.

**T₂ (dephasing time)**: phase randomization. The relative phase between |0⟩ and |1⟩ becomes random over time.

For superposition:
- Initial state `(|0⟩ + |1⟩)/√2` becomes a mixture.
- |+⟩ (X-basis) component decays; the qubit looks like a 50/50 mixture in the X-basis.
- Z-basis populations are unchanged (since dephasing doesn't move probability between |0⟩ and |1⟩).

Generally `T₂ ≤ 2T₁`. Often `T₂ << 2T₁`.

## Why T₂ matters more

For computation, what matters is COHERENT operations. T₂ characterizes how long coherence lasts.

Quantum gates take ~10-100 ns (superconducting) or ~10 μs (trapped ions). Algorithms need many gates within T₂.

For superconducting: ~1000-10000 gates per coherence time. Algorithms must fit.

For trapped ions: longer T₂ allows much deeper algorithms.

## How to measure

**T₁ measurement**: prepare |1⟩; wait time `t`; measure. P(1) decays as `e^{-t/T₁}`.

**T₂ measurement** (Ramsey experiment): prepare |+⟩; wait `t`; measure in X-basis. P(+) decays as `e^{-t/T₂}`.

**Spin echo (Hahn echo)**: cancels low-frequency noise; reveals "true" T₂ (sometimes called T₂*).

**Carr-Purcell-Meiboom-Gill (CPMG)**: dynamical decoupling sequence; protects coherence.

These are routine calibration tests on quantum hardware.

## Implications for algorithms

- **Shallow circuits**: most NISQ algorithms (VQE, QAOA) keep depth ~100-1000 gates.
- **Fast gates**: superconducting wins on speed despite shorter T₂.
- **Long-coherence platforms**: trapped ions allow deeper algorithms.
- **Error correction**: required to scale beyond coherence-limited depth.

<!-- tier:grad -->
# Decoherence (Grad)

## Density-matrix description

A qubit evolving with decoherence:

`ρ(t) = (I + r⃗(t) · σ⃗)/2`

The Bloch vector `r⃗(t)` evolves:
- `r_x(t) = r_x(0) e^{-t/T₂}`
- `r_y(t) = r_y(0) e^{-t/T₂}`
- `r_z(t) = r_z(0) e^{-t/T₁} + (1 - e^{-t/T₁}) r_z^{eq}`

where `r_z^{eq}` is the equilibrium z-component (typically -1 at low temperature).

T₂ contracts in-plane components; T₁ relaxes z-component to thermal equilibrium.

## Sources of decoherence (superconducting)

- **TLS (two-level systems)** at material interfaces: dominant in transmons. Improving with cleaner fabrication.
- **Quasi-particle tunneling** in Josephson junctions.
- **Charge / flux noise** from the environment.
- **Phonon coupling** to the substrate.
- **Magnetic-field noise**.

Modern fabrication has pushed T₁, T₂ to ~100 μs from ~1 μs in early devices. Still well below trapped-ion levels (~minutes).

## Sources of decoherence (trapped ions)

- **Magnetic-field fluctuations**: shift transition frequencies.
- **Laser noise**: phase + intensity fluctuations.
- **Heating of motional modes**: ions become harder to control.

Long T₂ (minutes) but slower gates due to laser-driven dynamics.

## Decoherence vs noise vs error

These are related but distinct:
- **Decoherence**: physical process of phase loss.
- **Noise**: any unwanted disturbance — gate errors, measurement errors, crosstalk.
- **Error**: deviation from ideal computation. Includes both decoherence + noise.

Modeling: noise channels (Kraus operators) capture both.

## Dynamical decoupling

**Insert pulse sequences** to average out specific noise. Most common: CPMG (Carr-Purcell-Meiboom-Gill).

Effect: extends coherence beyond T₂ by ~5-10x for low-frequency noise.

Used in NISQ algorithms to extend usable depth.

## Decoherence-free subspaces (DFS)

Sometimes qubits can be encoded in subspaces that are decoupled from specific noise types.

Example: collective dephasing affects all qubits identically. Encoding a qubit in `|01⟩, |10⟩` (symmetric / antisymmetric) is immune.

DFS is a partial solution; doesn't generalize to all noise. Subset of QEC framework.

## References

- Joos et al. 2003. *Decoherence and the Appearance of a Classical World*.
- Krantz et al. 2019. A quantum engineer's guide to superconducting qubits.
- Schlosshauer 2007. *Decoherence and the Quantum-To-Classical Transition*.
- Wiseman & Milburn 2010. *Quantum Measurement and Control*.
