---
title: Molecular Dynamics
category: bio
---
<!-- tier:intro -->
# Molecular Dynamics (MD)

Simulate biomolecules at atomic resolution. Each atom has a position; forces between atoms are computed from a force field; positions are updated by Newton's equations of motion. Run for nanoseconds (typical) to milliseconds (extreme).

Used for understanding mechanism (how an enzyme catalyzes a reaction), drug design (how a drug binds), and conformational sampling (the ensemble of structures around an AlphaFold prediction).

<!-- tier:undergrad -->
# Molecular Dynamics (Undergrad)

## Force fields

Energy function `U(positions)` over all atoms:

```
U = bond stretching + angle bending + dihedral torsions + van der Waals + electrostatics
```

Each term has parameters (force constants, equilibrium values) fitted to experimental data + quantum-mechanical calculations. Standard force fields:

- **AMBER**: original; well-tested for biomolecules.
- **CHARMM**: common alternative; slightly different parameters.
- **OPLS**: optimized for liquid simulations.
- **GROMOS**: another standard; different convention for some terms.

For most biomolecular MD: AMBER or CHARMM. Differences are small for large proteins; matter more for specific cases.

## Integration

Newton's equations:
```
m · d²x/dt² = -∇U(x)
```

Integrate numerically. Velocity Verlet is standard:

```
x_{t+Δt} = x_t + v_t · Δt + (1/2) · a_t · Δt²
v_{t+Δt} = v_t + (1/2)(a_t + a_{t+Δt}) · Δt
```

Timestep `Δt`: 1-2 femtoseconds (10^-15 s). Smaller is more stable but more expensive. Most MD uses 2 fs with bond-length constraints (SHAKE / LINCS) on hydrogens.

## Thermostats / barostats

To maintain target temperature + pressure (NPT ensemble), couple to heat/pressure baths:

- **Langevin dynamics**: add stochastic force + friction. Simulates contact with a thermal bath.
- **Nosé-Hoover**: deterministic; couples system to a virtual bath via additional coordinates.
- **Parrinello-Rahman barostat**: for pressure.

Standard production MD: NPT with Langevin or Nosé-Hoover at target temperature (310 K for biological); pressure 1 atm.

## Tools

- **GROMACS**: open-source; fastest for biomolecular MD.
- **AMBER, CHARMM**: commercial; their own ecosystems.
- **NAMD**: open-source; good for very large systems.
- **OpenMM**: Python-friendly; integrates with ML potentials.

For most projects: GROMACS or OpenMM.

<!-- tier:grad -->
# Molecular Dynamics (Grad)

## Computational cost

A 100-ns simulation of a 100,000-atom system:
- 50 million 2-fs timesteps.
- Per-step force calculation: dominated by electrostatics + van der Waals. `O(N²)` naively; `O(N log N)` with PME (particle-mesh Ewald) for electrostatics.
- ~1-10 ns/day on a modern GPU.

Long simulations (microseconds, milliseconds) require months of compute. Active research: enhanced sampling methods (replica exchange, metadynamics) to access slow events.

## ML for MD

**1. ML potentials**. Replace classical force fields with neural networks.

- **NequIP** (Batzner 2022): equivariant message-passing graph neural network. Ab-initio accuracy at ~10× the cost of classical force fields (vs ~10000× for direct quantum chemistry).
- **MACE** (Batatia 2022): higher-order equivariant features; SOTA on molecular property prediction.
- **OpenMM-ML**: hybrid; use classical force field + ML correction for specific regions.

**2. Coarse-graining**. Group atoms into beads. Simulate the coarse representation; cheaper but loses atomistic detail. Methods: **CGNet** (trains coarse force fields from atomistic data).

**3. Generative sampling**. Skip MD entirely; train a generative model to sample from the equilibrium distribution.

- **Boltzmann generators** (Noé 2019): normalizing flows for biomolecular sampling.
- **Diffusion-based**: emerging.

**4. Enhanced sampling**. Bias the simulation to escape long-lived states.

- **Replica exchange MD** (REMD): run multiple replicas at different temperatures; swap.
- **Metadynamics**: add a history-dependent bias to push the system away from already-visited states.

ML enhanced sampling: **TBoltzmann** uses neural networks to bias sampling toward unsampled regions.

## When MD is the right tool

- **Mechanism**: how does this protein actually function in 3D? MD shows the dynamics.
- **Binding affinity**: simulate ligand binding; compute free-energy differences via free-energy perturbation (FEP).
- **Allostery**: how does binding at one site affect another?
- **Validation**: AlphaFold gives a static structure; MD checks it's stable + samples the conformational ensemble.

When MD is the wrong tool: 'just predict the structure' (use AlphaFold), 'predict function from sequence' (use ESM), 'cluster cells' (scRNA-seq tools). MD's niche is atomistic mechanism.
