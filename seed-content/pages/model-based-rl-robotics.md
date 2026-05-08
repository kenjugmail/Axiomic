---
title: Model-Based RL for Robotics
category: robotics
---
<!-- tier:intro -->
# Model-Based RL for Robotics

Reinforcement learning that explicitly learns a dynamics model `s_{t+1} = f(s_t, a_t)`, then uses the model for planning or training policies.

**Why MBRL is appealing for robotics**:
- **Sample efficiency**: learning a dynamics model is much cheaper than learning a policy directly.
- **Generalization**: a learned dynamics model + planner can adapt to new tasks (different reward functions) without re-learning.
- **Safety**: plan offline before executing; verify safety.
- **Interpretability**: the dynamics model is inspectable.

**Methods**: PETS, Dreamer, MuZero, PILCO, MBPO. Each makes different assumptions about model structure + planning algorithm.

<!-- tier:undergrad -->
# Model-Based RL for Robotics (Undergrad)

## The basic loop

1. Initialize a dynamics model `f̂(s, a)`.
2. Repeat:
   - Use `f̂` for planning or policy training.
   - Execute the resulting policy in the environment.
   - Collect observed trajectories.
   - Update `f̂` to fit the data.

The "planning" step uses standard tools: MPC, iLQR, dynamic programming, RL on imagined rollouts.

## PETS — Probabilistic Ensembles + Trajectory Sampling

Chua et al. 2018. Strong baseline for continuous-control robotics:

- **Probabilistic ensemble**: train multiple dynamics models on the data; each predicts mean + variance. Ensemble captures epistemic uncertainty.
- **Trajectory sampling**: at planning time, simulate many trajectories using sampled models + actions. The ensemble propagates uncertainty.
- **MPC**: at each step, plan the best action over a finite horizon; execute first action; replan.

Strong on tasks like cartpole, half-cheetah, ant. Sample-efficient — few thousand environment interactions vs millions for model-free.

## Dreamer — latent-space dynamics

Hafner et al. 2020-2023. Learn a latent-space dynamics model + train policy in imagination.

**Architecture**:
- **World model**: encoder (image → latent state) + dynamics (latent transitions) + decoder (latent → image, reward).
- **Policy + value**: trained on imagined trajectories from the world model.

**Why it works**: imagination is fast — millions of imagined steps per real step. Sample efficiency improves dramatically.

**DreamerV3** (2023): generalist; works across 150+ tasks without per-task tuning. Strong on Atari, robotics, complex 3D environments.

**Used in**: research robotics; some commercial deployment for navigation + manipulation in controlled settings.

## MuZero — model-based RL with learned model

Schrittwieser et al. 2020. Combines MCTS planning with learned dynamics.

**Innovation**: the dynamics model is learned WITHOUT a reconstruction objective (no decoder back to pixels). Just predicts reward + value + policy. Implicitly learns a useful representation for planning.

State of the art on Atari + Go + chess + shogi. Robotics applications emerging.

## PILCO — sample-efficient on small problems

Deisenroth-Rasmussen 2011. Use Gaussian processes for the dynamics model + analytical policy gradients.

**Strengths**:
- Extremely sample-efficient: dozens of episodes can solve simple control problems.
- Bayesian uncertainty quantification.

**Limits**:
- GP scaling: doesn't go beyond hundreds of data points.
- Not used for high-dimensional state.

PILCO showed that ML-based dynamics + careful planning can be competitive. Modern deep MBRL is the descendant.

## When MBRL works

**Best fits**:
- Tasks where dynamics are smooth + learnable.
- Sample-efficiency-critical settings (real hardware experiments).
- Multi-task learning (one model, many tasks).

**Worse fits**:
- Tasks where modelling is hard (contact-rich manipulation).
- Very long horizons where model errors compound.
- High-dimensional state (images) where model accuracy is hard.

For pure robotics, MBRL competes with model-free RL (PPO, SAC) + behavior cloning. No universal winner.

<!-- tier:grad -->
# Model-Based RL for Robotics (Grad)

## Compounding errors in MBRL

Model errors compound during long-horizon planning. After `T` steps, error can grow exponentially.

**Mitigations**:
- **Short-horizon planning**: limit rollout length; use value function for terminal cost.
- **Probabilistic models**: capture uncertainty; planning accounts for variance.
- **Conservative policies**: avoid regions where model is uncertain.
- **Online model adaptation**: refit model as new data arrives.

The trade-off: longer horizons enable better long-term decisions but accumulate more error.

## MBPO — Model-Based Policy Optimization

Janner et al. 2019. Uses learned model for short imagined rollouts + model-free RL on the imagined data.

**Algorithm**:
1. Learn ensemble dynamics model.
2. Generate short rollouts (5-10 steps) from the current policy.
3. Train policy with SAC on the augmented data (real + imagined).
4. Iterate.

**Why it works**: short rollouts limit compounding error; model-free RL on the augmented data captures long-term value.

State of the art on continuous-control benchmarks. Bridges MBRL and model-free RL.

## Latent-space planning

Dreamer + variants plan in latent space, not pixel space:

- **Encoder**: image → latent state.
- **Dynamics**: latent state + action → next latent state.
- **Decoder** (optional): latent state → image (for reconstruction loss).

**Advantages**:
- Planning is fast (latent space is low-dimensional).
- Generalizes across tasks if the latent representation is useful.
- Doesn't require accurate pixel-level reconstruction.

**Issues**:
- Latent space can collapse.
- Long-horizon prediction in latent space can be unstable.
- Hard to interpret what the latent represents.

## TD-MPC — Trajectory Distribution MPC

Hansen et al. 2022, 2024. Combines MBRL + MPC + value function.

**Algorithm**:
- Learn world model (latent dynamics).
- At each step: MPC plans `H` steps using world model + value function as terminal.
- Sample-based MPC (CEM, MPPI).

**Performance**: state of the art across many continuous-control tasks. The MPC + world model + value combo is a strong recipe.

## Sample efficiency vs simulator efficiency

Two notions:

**Sample efficiency**: minimize real-environment interactions.

**Simulator efficiency**: minimize wall-clock training time (when simulation is fast).

MBRL excels at sample efficiency; model-free at simulator efficiency.

For real robots, sample efficiency dominates; MBRL is preferred. For simulation-based research, model-free with massive parallelism (Isaac Gym, Brax) often wins.

## Connection to LLMs as world models

Modern: large language / vision-language models as world models for robotic planning.

- **Voyager**, **Inner Monologue**: LLMs plan + reflect on robot actions.
- **PaLM-E**: vision-language model that does some planning.
- **DreamerV3 + foundation models**: latent dynamics + foundation-model-based perception.

The boundary between MBRL + foundation-model-based planning is blurring. MuZero-style learned models + foundation-model perception are an active area.

## Production status

MBRL is research-strong but production-rare:
- Most production robotics uses imitation learning + model-free RL or pure classical control.
- MBRL's complexity hurts production reliability.
- Foundation-model-based policies (RT-2, π-0) bypass explicit dynamics modeling.

Where MBRL shows up:
- Drone trajectory optimization with learned aerodynamics models.
- Industrial process control with learned plant models.
- Adaptive autonomous-vehicle planning with learned road dynamics.

## References

- Deisenroth & Rasmussen 2011. PILCO: A model-based and data-efficient approach to policy search. *ICML*.
- Chua et al. 2018. Deep reinforcement learning in a handful of trials using probabilistic dynamics models. *NeurIPS*. (PETS.)
- Hafner et al. 2020. Mastering Atari with discrete world models. *ICLR*. (DreamerV2.)
- Hafner et al. 2023. Mastering diverse domains through world models. *arXiv*. (DreamerV3.)
- Schrittwieser et al. 2020. Mastering Atari, Go, chess and shogi by planning with a learned model. *Nature*. (MuZero.)
- Janner et al. 2019. When to trust your model: model-based policy optimization. *NeurIPS*. (MBPO.)
