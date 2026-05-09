---
title: VQE (Variational Quantum Eigensolver)
category: quantum
---
<!-- tier:intro -->
# VQE — Variational Quantum Eigensolver

A hybrid quantum-classical algorithm to find the ground-state energy of a Hamiltonian.

Peruzzo et al. 2014. The flagship NISQ-era quantum-chemistry algorithm.

**Procedure**:
1. Choose parameterized ansatz `|ψ(θ)⟩ = U(θ)|0⟩^n`.
2. Compute energy `E(θ) = ⟨ψ(θ)|H|ψ(θ)⟩` on quantum hardware.
3. Classically optimize `θ` to minimize `E`.
4. Iterate.

The minimum `E(θ*)` approximates the ground-state energy.

VQE is shallow + noise-tolerant: well-suited to NISQ. The leading candidate for near-term quantum advantage in chemistry.

<!-- tier:undergrad -->
# VQE (Undergrad)

## Why VQE

For chemistry, the goal is computing energies of molecules:
- Ground-state energy (geometry, stability).
- Excited-state energies (spectra, reactivity).
- Reaction barriers + dynamics.

Classically: hard for strongly-correlated electron systems. DFT works for many cases but fails for transition metals + radicals + photochemistry.

Quantum: simulates the full electronic Hamiltonian. The natural fit.

VQE bridges the gap to NISQ hardware: instead of phase estimation (deep, fault-tolerant), use shallow variational circuits.

## Encoding chemistry

Map a molecular Hamiltonian to qubits:

1. **Choose basis** (e.g., Hartree-Fock orbitals).
2. **Second quantization**: rewrite Hamiltonian in fermionic creation/annihilation operators.
3. **Jordan-Wigner or Bravyi-Kitaev transformation**: map fermionic operators to Pauli operators.
4. Result: Hamiltonian as a sum of Pauli strings: `H = Σ_i c_i P_i`.

For `m` orbitals: ~`m` qubits + `O(m^4)` Pauli terms.

## The ansatz

Parameterized circuit `U(θ)`. Choices:

**Hardware-efficient ansatz (HEA)**:
- Layers of single-qubit rotations + entangling gates (CNOT or CZ).
- Expressive but agnostic to chemistry.

**Unitary Coupled Cluster (UCC)**:
- Inspired by classical CC theory.
- Better for chemistry; deeper circuits.

**ADAPT-VQE**:
- Adaptively grows the ansatz, adding operators that lower energy.
- Compact ansatz; better convergence.

The choice impacts accuracy + circuit depth + trainability.

## Measurement strategy

To compute `⟨H⟩ = Σ c_i ⟨P_i⟩`:

For each Pauli string `P_i`:
1. Rotate qubits to measure in the appropriate basis (X, Y, or Z).
2. Sample many shots; estimate `⟨P_i⟩`.

**Issues**:
- Many Pauli terms → many measurements.
- Optimization: group commuting Pauli terms; measure simultaneously.
- Classical shadows (Huang-Kueng-Preskill 2020): efficient measurement of many observables.

Reducing measurement cost is critical for VQE performance.

## Optimization

Classical optimizer: gradient-based (Adam, BFGS) or gradient-free (COBYLA, SPSA).

**Gradients**: parameter-shift rule computes exact gradients in `~2L` evaluations for `L` parameters.

**Issues**:
- Noise contaminates gradients.
- Local minima in highly non-convex landscape.
- Barren plateaus: gradients vanish exponentially in qubit count.

These are active research areas.

## Status

**Demonstrated on small molecules**: H₂, LiH, BeH₂, H₄, H₆.

**Practical advantage today**: not yet established. Classical methods (DMRG, CCSD(T)) still dominate.

**Future**: as hardware improves + algorithms evolve, VQE may reach practical advantage for mid-sized molecules in late 2020s.

<!-- tier:grad -->
# VQE (Grad)

## Barren plateaus

McClean et al. 2018: for random ansätze, gradient variance vanishes exponentially in qubit count.

`Var(∂E/∂θ_i) ~ 1/2^n`

Implication: gradient-based optimization needs exponentially many shots to detect any signal.

**Mitigations**:
- Structured ansätze (UCC, ADAPT) avoid the worst plateaus.
- Layer-wise training: start with shallow, gradually deepen.
- Smart initialization: identity ansatz, parameter pre-training.
- Local cost functions: when applicable.

Active research; no general solution.

## Variational quantum eigensolver convergence

VQE doesn't always find the global minimum:
- Saddle points in non-convex landscape.
- Local minima.
- Noise-induced biases.

**Heuristic**: run VQE multiple times with different initializations; report the lowest.

**Theoretical bounds**: for shallow ansätze + structured Hamiltonians, energy approximation guarantees exist. For deep arbitrary ansätze, no guarantees.

## Measurement reduction

**Problem**: measuring `H` requires summing many Pauli expectation values. Scales `O(m^4)` for chemistry.

**Solutions**:
- **Term grouping**: simultaneously measure commuting Pauli strings.
- **Tensor-network methods**: estimate expectation values from a few qubits' worth of measurements.
- **Classical shadows**: efficient framework for measuring many observables.

Recent advances reduced measurement cost by 100-1000x for medium molecules.

## QPE vs VQE

**Quantum Phase Estimation (QPE)**: extracts eigenvalues exactly (with sufficient resources).
- Pros: provable accuracy, polynomial scaling.
- Cons: deep circuits requiring fault-tolerance.

**VQE**: variational; shallow circuits.
- Pros: NISQ-compatible.
- Cons: heuristic; no convergence guarantees; barren plateaus.

The two coexist:
- VQE for current NISQ era.
- QPE for fault-tolerant era.

Many chemistry workflows: VQE warm-start for QPE, or VQE as final method on NISQ + QPE later.

## Excited states

**Subspace methods**: VQD (variational quantum deflation), SSVQE (subspace-search). Find multiple eigenstates by projecting away found ones.

**Quantum phase estimation**: more direct.

**Spectroscopic methods**: simulate dynamics; extract eigenvalues from frequency analysis.

## Recent benchmarks

VQE has been demonstrated on:
- H₂, LiH, BeH₂ (4-12 qubits): chemical accuracy reached.
- H₂O, NH₃ (>20 qubits): under active development.
- Periodic systems (Hubbard model): preliminary results.

Whether VQE will deliver chemistry advantage before fault-tolerance is debated. Hardware improvements + algorithm improvements both contribute.

## References

- Peruzzo et al. 2014. A variational eigenvalue solver on a photonic quantum processor.
- McClean et al. 2016. The theory of variational hybrid quantum-classical algorithms.
- Cao et al. 2019. Quantum chemistry in the age of quantum computing.
- McClean et al. 2018. Barren plateaus in quantum neural network training landscapes.
- Cerezo et al. 2021. Variational quantum algorithms.
