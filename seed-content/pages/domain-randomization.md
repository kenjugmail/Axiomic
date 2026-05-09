---
title: Domain Randomization
category: robotics
---
<!-- tier:intro -->
# Domain Randomization

The dominant sim-to-real technique. Train a robot policy across a wide distribution of simulator parameters; the policy learns to be robust to the variation. Hope reality is one sample from the distribution.

Tobin et al. 2017 introduced it; OpenAI Dactyl 2018 made it famous (Rubik's cube in-hand).

**What's randomized**: physics (mass, friction, damping), visuals (textures, lighting), sensors (noise, latency), initial conditions.

**Why it works**: the policy can't latch onto any specific simulator value; it must learn behavior robust to the variation.

**Trade-off**:
- Wide randomization → robust but harder to learn.
- Narrow randomization → easier to learn but less margin.

<!-- tier:undergrad -->
# Domain Randomization (Undergrad)

## What gets randomized

**Physics parameters**:
- Joint friction (each joint independently).
- Object friction (each contact pair).
- Object mass + inertia.
- Damping coefficients.
- Restitution (bounce).
- Joint stiffness (compliance).

**Visual parameters**:
- Surface textures (random patterns).
- Object colors (uniformly random over RGB).
- Lighting (color, intensity, position).
- Camera position + orientation.
- Camera intrinsics (focal length, distortion).
- Image noise (Gaussian + salt-and-pepper).

**Temporal parameters**:
- Control latency.
- Sensor latency.
- Frame rate variation.

**Initial conditions**:
- Object pose (within reasonable range).
- Robot joint configuration.

## Implementation

In Isaac Lab / Isaac Gym:
```python
randomize_friction = SimulationConfig.add_randomization(
    "friction",
    distribution="uniform",
    range=(0.5, 1.5),
)
randomize_mass = SimulationConfig.add_randomization(
    "mass_multiplier",
    distribution="log_uniform",
    range=(0.5, 2.0),
)
```

In MuJoCo: each `body_id` has friction + mass that can be randomized between rollouts.

## Tuning the randomization range

**Too narrow**: the policy doesn't learn to handle reality (which lies outside the range).

**Too wide**: learning is slow; policy may not converge; performance mediocre.

**Right range**: cover plausible real-world variation + a margin. SysID provides nominal values; DR adds buffer.

**Practical**: start narrow; widen incrementally; monitor sim performance + real-world success rate.

## ADR — automatic domain randomization

OpenAI's Dactyl follow-up: automatically expand DR ranges as the policy succeeds; contract when it struggles.

**Procedure**:
- Maintain DR range per parameter.
- Periodically test policy on extreme + median values.
- Expand range if extremes pass the success threshold.
- Contract if performance drops too far.

**Result**: policy learns increasingly robust behavior over training. Works without manual tuning.

ADR was central to OpenAI's Rubik's-cube-with-a-robot-hand result.

## Visual DR + photorealistic rendering

Two approaches to visual sim-to-real:

**Visual DR**: random textures, lighting. The policy learns features invariant to surface details.

**Photorealistic rendering**: simulate the real visual appearance accurately. Reduces gap by direct matching.

Modern systems combine both: photorealistic rendering as the base + visual DR for robustness.

**NVIDIA Omniverse + RTX**: real-time ray-traced rendering. Industry standard for photorealistic robot simulation.

## When DR isn't enough

Some gaps are too large for DR alone:

- **Contact dynamics**: slip behavior, deformable objects, soft contact. Simulators model these poorly.
- **Reflective / transparent objects**: depth sensors return garbage; DR can't help if simulator doesn't model the failure mode.
- **Long-tail edge cases**: extreme rare events not in DR range.

**Fix**: real-world fine-tuning. DR pretrains; real data corrects residuals.

<!-- tier:grad -->
# Domain Randomization (Grad)

## Theoretical foundations

DR is a form of robust optimization. The policy minimizes worst-case (or expected) loss over a distribution of environments.

**Distributionally robust optimization** (DRO):
`π* = argmin_π max_{P ∈ P_set} E_{P}[L(π)]`

DR is DRO where `P_set` is a parameterized family of simulators.

**Connection to invariance**: if the policy must work across many parameters, it can't depend on any one parameter — it learns invariant features.

This is the same intuition as data augmentation in supervised learning: vary nuisance factors; learn robust representations.

## Calibrated DR

Pure DR is over-conservative — randomizes parameters that don't matter and ignores correlations.

**Calibrated DR** (Chebotar et al. 2019, others): use real-world rollouts to calibrate the DR distribution.

**Procedure**:
1. Train initial policy with broad DR.
2. Deploy on real hardware; collect rollouts.
3. Compute distribution of real-world parameters that explain rollouts.
4. Re-train with this calibrated distribution.
5. Iterate.

Tighter DR + better performance than uncalibrated.

## Adversarial DR

**Adversarial DR**: instead of random parameters, train the parameter distribution to be ADVERSARIAL — maximize policy loss.

`min_π max_{φ} L(π, env(φ))`

Forces the policy to handle worst-case parameter values, not just average.

Implementations: SR2L, REPP, others. Theoretically grounded; sometimes outperforms uniform DR.

## Cross-embodiment DR

Beyond physics + visual DR: randomize the robot's embodiment.

- Joint count + geometry.
- Actuator dynamics.
- Sensor configurations.

If the policy can handle multiple embodiments in simulation, it generalizes to unseen embodiments. Used in Open X-Embodiment + cross-embodiment VLAs.

## Limitations

**DR-friendly tasks**: those with sufficient simulator fidelity + manageable variation. Navigation, broad manipulation.

**DR-resistant tasks**: those with critical fine-grained dynamics (insertion, dexterous manipulation). DR doesn't help if the simulator doesn't model the relevant phenomena.

**Sample efficiency**: DR slows learning. May need 10-100x more samples than narrow training. Mitigated by parallel simulation (1000+ environments at 100x real-time).

**Generalization to truly novel scenarios**: DR generalizes within the support of the training distribution. Outside-distribution scenarios still fail.

## Connection to deep learning data augmentation

DR is the robotics analog of data augmentation:
- DA: random crops, flips, color jitter on images.
- DR: random physics, visuals, sensor noise on robot trajectories.

The same principle: vary nuisance factors; learn invariant features.

Modern: combine DA + DR. Image augmentations + simulation parameter randomization.

## Modern frontier

**Generative DR**: GAN / diffusion models generate realistic environments + scenarios. More diverse than parameterized DR.

**Vision foundation models for sim-to-real**: pretrained DINOv2 / CLIP features are robust by construction; less DR needed for visual transfer.

**Real-data + simulation hybrids**: train on combinations of simulation + teleoperation + real-world rollouts. The dominant approach for VLAs.

**Foundation simulators**: large pretrained models that simulate physics + visuals. Genesis, NeRF-based, learned simulators. Emerging.

## References

- Tobin et al. 2017. Domain randomization for transferring deep neural networks from simulation to the real world. *IROS*.
- Sadeghi & Levine 2017. (CAD)2RL: Real single-image flight without a single real image. *RSS*.
- OpenAI et al. 2019. Solving Rubik's Cube with a Robot Hand. (ADR introduced.)
- Chebotar et al. 2019. Closing the sim-to-real loop: adapting simulation randomization with real world experience. *ICRA*.
- Akkaya et al. 2019. Solving Rubik's Cube with a Robot Hand.
