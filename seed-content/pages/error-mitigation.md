---
title: Error Mitigation
category: quantum
---
<!-- tier:intro -->
# Error Mitigation

Reduce the impact of noise on quantum computation WITHOUT full error correction.

Distinct from QEC: mitigation post-processes noisy results to estimate ERROR-FREE expectation values. Doesn't fix individual outcomes; works on NISQ hardware.

**Why it works**: many useful quantities (energies, probabilities) are EXPECTATION VALUES. Even with noisy individual results, careful averaging + extrapolation can give clean expectation values.

**Techniques**: zero-noise extrapolation (ZNE), probabilistic error cancellation (PEC), symmetry verification, readout error mitigation, dynamical decoupling.

<!-- tier:undergrad -->
# Error Mitigation (Undergrad)

## Why mitigation matters for NISQ

NISQ hardware has ~1% error rates per gate. Deep algorithms accumulate enough error to drown the signal.

**Without mitigation**: NISQ algorithms produce noise-dominated results.

**With mitigation**: extend usable circuit depth significantly. Often the difference between "useless" and "useful" NISQ result.

Mitigation is the workhorse of practical NISQ-era computation.

## Zero-noise extrapolation (ZNE)

**Idea**: deliberately INCREASE noise; extrapolate to zero noise.

**Procedure**:
1. Run circuit at noise level `λ_0` (default).
2. Re-run with stretched gate durations or inserted noise: noise level `λ_1 > λ_0`.
3. Re-run at `λ_2 > λ_1`.
4. Extrapolate the expectation value vs noise to `λ = 0`.

**Linear extrapolation**: fit `E(λ) = a + bλ`; result = `a`.
**Exponential**: fit `E(λ) = a + b·e^{-cλ}` for noise that scales exponentially.
**Higher-order**: polynomial fits with more noise levels.

**Cost**: 3-5x more shots per result vs no mitigation.

**Robustness**: works well when noise is "weak"; less reliable for very deep circuits.

## Probabilistic error cancellation (PEC)

**Idea**: characterize the noise model; sample from a quasi-distribution that cancels noise on average.

**Procedure**:
1. Characterize the noise channel for each gate type via tomography.
2. For each circuit run, sample an "ideal" gate sequence + a "correction" sequence according to a quasi-probability distribution.
3. Track the sign of each run.
4. Compute expectation value as the signed average.

**Cost**: exponential in the noise level. Limited to moderately noisy circuits.

**Strengths**: theoretically gives unbiased estimates of error-free expectation values.

## Symmetry verification

**Idea**: many physical systems have known symmetries (particle number, spin, parity). Reject circuit runs that violate them.

**Procedure**:
1. Run the circuit.
2. Measure both the target observable + the symmetry-conserving observable.
3. Discard runs where the symmetry is violated (likely noise).
4. Average the kept runs.

**Cost**: depends on rejection rate. Cheap when noise is mild.

Standard in quantum chemistry (particle number, total spin).

## Readout error mitigation

**Idea**: characterize measurement errors via a confusion matrix; invert it to correct expectation values.

**Procedure**:
1. Calibrate by preparing each computational basis state + measuring outcomes.
2. Build confusion matrix `M_{ij} = P(measure j | prepared i)`.
3. For each circuit, compute outcome distribution; multiply by `M^{-1}` for corrected distribution.

**Cost**: linear in number of qubits.

**Limitation**: assumes measurement errors are independent. For correlated readout errors, this approach fails.

## Dynamical decoupling

**Idea**: insert pulse sequences during idle qubit time to average out specific noise (low-frequency, 1/f).

**CPMG sequence**: π pulses at regular intervals.

**Cost**: minor (extra gates during idle time).

**Effect**: extends coherence by ~5-10x for low-frequency noise.

Standard in NISQ workflows.

## Combining techniques

Real NISQ workflows combine multiple:
- **Readout error mitigation**: always; cheap.
- **Dynamical decoupling**: always; cheap.
- **ZNE**: standard for variational algorithms.
- **Symmetry verification**: when applicable.
- **PEC**: for highest precision; expensive.

Combined, mitigation can extend usable depth from ~100 gates to ~1000+.

<!-- tier:grad -->
# Error Mitigation (Grad)

## Theoretical limits

**Fundamental limit**: no mitigation technique can fully recover error-free results from noisy hardware. Some bias always remains.

**Sample complexity**: most mitigation techniques have ~exponential cost in noise level. Practical for low-to-moderate noise; useless for very noisy circuits.

This is why error CORRECTION (QEC) is needed for fault-tolerant computing. Mitigation can extend NISQ utility but won't reach full quantum advantage.

## Probabilistic error cancellation details

**Quasi-probability distribution**: any decomposition of an ideal channel into a SIGNED combination of implementable channels.

`E_ideal = Σ_i c_i E_i`

with `Σ_i |c_i| = γ ≥ 1` and Σ c_i = 1.

Sampling: choose channel `i` with probability `|c_i|/γ`; multiply result by `sign(c_i) · γ`.

Variance: `O(γ²)` — exponential in noise level.

For a noise rate `p` per gate and `n` gates: `γ ≈ e^{O(np)}`. Practical for `np ≲ 10`.

## Quantum Error Mitigation Combo

**Virtual distillation** (Huggins et al. 2021): purify the state by computing expectation values of `ρ²` instead of `ρ`. Reduces certain noise.

**Echo verification** (van den Berg et al. 2022): compare forward + backward circuit runs to detect bit-flip-like errors.

**Subspace expansion**: variational subspace projection to remove off-symmetry components.

**Clifford data regression**: train ML models on Clifford circuits (classically simulable); predict noise-free results from noisy.

Each technique adds modest cost + reduces specific noise classes.

## Connection to error correction

**Mitigation + correction together**: not common, but possible. Use modest QEC for some logical qubits; mitigate residual noise.

**Bridge** to fault-tolerant: as hardware improves + becomes near-threshold, first applications will be partial fault-tolerance + mitigation, then full fault-tolerance.

## Limits as algorithms scale

For NISQ algorithms with ~`n` qubits + ~`d` depth + per-gate error `p`:
- Expected error per shot: ~`npd`.
- Mitigation cost: ~`exp(O(npd))`.

For `np = 0.1, d = 100`: `exp(10) = 22000`x more shots. Painful but feasible.

For `np = 0.5, d = 100`: `exp(50) = 5 × 10^{21}`x. Infeasible.

So mitigation works for moderate-depth + modest-error regime. Beyond, fault-tolerance is the only path.

## Hardware-specific tricks

- **Pulse-level optimization**: optimize gate pulses for specific qubit pairs. Modest fidelity gains.
- **Crosstalk cancellation**: characterize + correct unwanted couplings.
- **Active cooling**: reduce quasi-particle generation in superconducting.
- **Laser stabilization**: reduce trapped-ion gate error.

These complement algorithmic mitigation.

## References

- Temme, Bravyi, Gambetta 2017. Error mitigation for short-depth quantum circuits.
- Li & Benjamin 2017. Efficient variational quantum simulator incorporating active error minimization.
- Endo, Cai, Benjamin, Yuan 2021. Hybrid quantum-classical algorithms and quantum error mitigation. *J. Phys. Soc. Japan*.
- Cai et al. 2022. Quantum error mitigation. *arXiv*. (Comprehensive review.)
