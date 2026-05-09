---
title: Sim-to-Real
category: robotics
---
<!-- tier:intro -->
# Sim-to-Real

The discipline of training robot policies in simulation and ensuring they work on real hardware.

**Why train in sim**: simulation is faster (1000x real-time), cheaper, safer, and parallelizable. Real-hardware training is expensive, slow, and risky.

**The reality gap**: policies trained in sim fail on real hardware because the simulator doesn't perfectly match reality.

**Two main strategies**:
- **Domain Randomization (DR)**: train across a wide distribution of simulator parameters. Hope reality is one sample.
- **System Identification (SysID)**: measure real-world parameters; calibrate simulator to match.

Modern production: SysID + narrow DR + real-world fine-tuning. The combination closes most gaps for navigation; manipulation often requires fine-tuning.

<!-- tier:undergrad -->
# Sim-to-Real (Undergrad)

## Sources of the reality gap

**Dynamics**:
- Friction (especially contact-rich tasks).
- Mass + inertia.
- Actuator delays + nonlinearities.
- Compliance + flexibility.

**Sensing**:
- Camera intrinsics + extrinsics.
- Image noise, lighting, motion blur.
- IMU bias drift.
- LIDAR specular returns + atmospheric effects.

**Environment**:
- Object shapes (real-world clutter vs synthetic objects).
- Surface materials (texture, gloss).
- Lighting conditions.

**System integration**:
- Network latency.
- Frame-rate variations.
- Hardware-software timing.

Different problems have different dominant gap sources.

## Domain randomization

**Tobin et al. 2017**: train on a wide distribution of simulator parameters; the policy learns to be robust.

**What to randomize**:
- Physics: masses, inertias, friction, damping, restitution.
- Visuals: textures, colors, lighting, camera parameters, noise.
- Sensor noise: pixel noise, motion blur, IMU bias.
- Latencies: control frequency, sensor delays.
- Initial conditions: object positions, robot pose.

**Wide vs narrow DR**:
- Wide: more robust but harder to learn.
- Narrow: easier to learn but smaller robustness margin.

**OpenAI Dactyl** (2018): solved Rubik's cube in-hand with extreme DR. First major DR success.

## System identification

Alternative: measure real-world parameters; use them in simulation.

**Procedure**:
1. Run controlled experiments on real hardware.
2. Estimate parameters (friction, mass, damping) from data.
3. Use the calibrated simulator for training.

**Strengths**: tighter sim-to-real gap when parameters are well-identified; faster training.

**Limits**:
- Some parameters can't be measured directly (especially nonlinear friction, contact mechanics).
- Drift over time as hardware ages.
- Doesn't generalize to novel hardware.

**Hybrid: SysID + narrow DR**:
- Identify nominal parameters via SysID.
- Add narrow DR around identified values.

This is the modern standard.

## Real-world fine-tuning

When sim-to-real doesn't fully close the gap:

1. Pretrain in simulation with DR.
2. Deploy on real hardware.
3. Collect real rollouts.
4. Fine-tune the policy on real data.

**Challenges**:
- Hardware wear during real rollouts.
- Safety during exploration.
- Catastrophic forgetting: fine-tuning overfits to specific real environment.

**Modern approaches**:
- Offline RL: fine-tune from pre-collected demos.
- Imitation + RL hybrids.
- Sim-to-real residual learning: pretrain a base policy in sim; learn a residual on real data.

## What works (2026 state of the art)

**Navigation**: pure-sim policies often deploy directly. Reality gap is small for kinematics + broad-stroke dynamics.

**Manipulation**: pure-sim works for moderately complex tasks (pick-and-place); contact-rich tasks need real-world fine-tuning.

**Dexterous manipulation**: extreme DR + real-world fine-tuning + tactile feedback. Still research-frontier.

<!-- tier:grad -->
# Sim-to-Real (Grad)

## Theoretical framework

**Domain adaptation**: source distribution `P_sim`; target `P_real`. Minimize discrepancy.

**Importance weighting**: re-weight sim data by `P_real / P_sim`. Theoretically grounded but requires `P_real` known.

**Adversarial domain adaptation**: train a discriminator to distinguish sim vs real; train policy to fool it.

**Invariant risk minimization**: learn features invariant across environments.

These provide theoretical guarantees under assumptions; in practice DR + fine-tuning dominate.

## Adaptive domain randomization

**Curriculum**: start narrow; widen as policy becomes competent. Speeds up learning.

**Calibrated DR**: use real-data to calibrate DR ranges. Tighter than fully random.

**Active DR**: identify which parameters most affect performance; randomize those most.

**ADR (Auto Domain Randomization)** (OpenAI): expand DR ranges automatically when policy passes a benchmark; contract when failing. Used in Dactyl follow-up work.

## Photorealistic simulation

Modern simulators: photorealistic rendering closes the visual gap.

- **NVIDIA Isaac Sim / Omniverse**: ray-traced rendering; physically-based materials.
- **Unreal Engine 5**: photorealistic with Nanite + Lumen.
- **NeRF / Gaussian Splatting**: photorealistic environments built from real captures.

For visual sim-to-real, photorealistic rendering closes most of the gap. Physics-based gaps remain.

## Physics simulator quality

Different simulators have different fidelity profiles:

- **MuJoCo** (DeepMind): high accuracy for contact-rich; standard in research.
- **PhysX / Isaac**: fast; less accurate contact; standard for parallel training.
- **Bullet**: open-source; older but reliable.
- **Drake**: high-precision; good for trajectory optimization.
- **Genesis** (2024): differentiable; emerging.

Choosing a simulator: trade-off between fidelity + speed + parallelization. Most research uses MuJoCo or Isaac; production varies.

## Differentiable simulation

Recent: simulators with differentiable physics (Brax, Genesis, MuJoCo MPC).

**Why useful**:
- Train policies via gradient through simulation.
- Sample-efficient: fewer interactions needed.
- Sim-to-real transfer: explicit gradients for parameter-fitting.

**Limits**:
- Contact discontinuities are hard to differentiate (sub-gradient hacks).
- Numerical stability of long-horizon backprop.

Active research; production-grade differentiable manipulation simulation is emerging.

## Cross-embodiment transfer

A policy trained on one robot working on another:

- Open X-Embodiment dataset (2024): 22 robots, 527 skills; cross-embodiment training.
- **RT-X / Octo / OpenVLA / π-0**: VLAs trained on cross-embodiment data.

**Findings**: positive transfer when robot embodiments are similar; degrades for very different embodiments. Generalization is partial, not universal.

## Foundation models + sim-to-real

VLAs trained on internet + diverse robot data:
- Visual generalization mostly transfers from internet pretraining.
- Action distributions transfer partially across robots.
- Fine-tuning per-robot is still typically required.

The dream: a single foundation policy that works on any robot with minimal adaptation. Not yet reality.

## References

- Tobin et al. 2017. Domain randomization for transferring deep neural networks from simulation to the real world. *IROS*.
- OpenAI et al. 2019. Solving Rubik's Cube with a Robot Hand. *arXiv*.
- Peng et al. 2018. Sim-to-real transfer of robotic control with dynamics randomization. *ICRA*.
- Akkaya et al. 2019. Solving Rubik's Cube with a Robot Hand. (ADR — Auto-DR.)
- Padalkar et al. 2024. Open X-Embodiment: Robotic Learning Datasets and RT-X Models. *ICRA*.
