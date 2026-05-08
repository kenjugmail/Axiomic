---
title: Imitation Learning
category: robotics
---
<!-- tier:intro -->
# Imitation Learning

Train a policy by mimicking expert demonstrations rather than rewards.

**Why for robotics**:
- Demonstrations easier to collect than reward functions.
- Sample-efficient: 100s-1000s of demos can solve many tasks.
- No exploratory hardware risk during training.
- Stable training (just supervised learning).

**Methods**:
- **Behavior cloning (BC)**: supervised learning of `action = π(state)`.
- **DAgger**: BC + iterative correction by expert.
- **Inverse RL**: infer reward from demos, then RL.
- **GAIL / AIRL**: adversarial imitation.
- **Action chunking + diffusion policies**: modern variants for robust execution.

The dominant approach for production manipulation policies (pre-foundation-model era).

<!-- tier:undergrad -->
# Imitation Learning (Undergrad)

## Behavior cloning

Simplest approach: collect expert demos `{(s_t, a_t)}`, train policy `π_θ(a | s)` via supervised learning to match expert actions.

Loss: `L = Σ ||π_θ(s_t) - a_t||²` (continuous) or `L = -Σ log π_θ(a_t | s_t)` (discrete).

**Strengths**:
- Simple to implement.
- Stable (just supervised learning).
- No reward function needed.

**Weaknesses**:
- **Distribution shift**: at deployment, the policy makes errors → encounters states not in training data → errors compound.
- **Compounding errors**: each step's error puts the next step further out-of-distribution.

For short episodes BC works. For long ones errors accumulate.

## DAgger — fixing distribution shift

Ross-Gordon-Bagnell 2011. Iteratively expand the training distribution to cover policy-visited states:

1. Train BC policy on initial demos.
2. Run policy in environment; collect rolled-out states.
3. Have expert label optimal actions in those states.
4. Add to training data; retrain.
5. Repeat.

**Key insight**: training distribution converges to the policy's deployment distribution. No more distribution shift.

**Limit**: requires expert in the loop during data collection. Costly.

**Variants**:
- **HG-DAgger**: human-gated; expert intervenes only when needed.
- **EnsembleDAgger**: query expert when ensemble disagrees.

## Inverse Reinforcement Learning (IRL)

Don't directly imitate the action; infer the REWARD from demonstrations + then RL.

**Pros**:
- Generalizes beyond demonstration coverage.
- Captures preferences across tasks.

**Cons**:
- Reward inference is ill-posed (many rewards explain demos).
- IRL + RL is computationally expensive.

**Methods**:
- Maximum-entropy IRL (Ziebart 2008).
- GAIL (Generative Adversarial Imitation Learning) (Ho-Ermon 2016).

GAIL is the modern dominant variant: adversarial training distinguishes demo trajectories from policy trajectories; policy minimizes the discriminator.

## Action chunking

Standard BC predicts one action `a_t` per step. **Action chunking**: predict a sequence of actions `(a_t, a_{t+1}, ..., a_{t+H})`.

**ACT (Action Chunking Transformer)** (Zhao et al. 2023): predicts H=100+ actions; executes the chunk; re-predicts.

**Why it helps**:
- Smoother trajectories.
- Less compounding (you commit to a sequence, not just one step).
- Captures temporal correlations.

Standard in modern manipulation BC.

## Diffusion policies

Chi et al. 2023. Use diffusion models to generate action sequences.

Instead of `π_θ(a | s)`, predict `π_θ(a_{t:t+H} | s_t)` via diffusion model.

**Why it wins**:
- Captures multimodal action distributions (multiple ways to do the same task).
- Sequence-level coherence.
- Smooth + dynamically feasible.

State-of-the-art on many manipulation benchmarks. Used in research at most major robotics labs; emerging in commercial systems.

## Production data scale

- **RT-1** (Google 2022): 130k demos.
- **RT-2** (2023): same + internet pretraining.
- **π-0** (Physical Intelligence 2024): 10k+ hours of teleoperation data.
- **OpenVLA** (2024): millions of demos across 22 robots.

Modern VLAs are trained on huge demo datasets; the architecture + training recipe matter; data quality + diversity dominate.

<!-- tier:grad -->
# Imitation Learning (Grad)

## Theoretical foundations

**BC error bound** (Ross-Bagnell 2010): error compounds quadratically with episode length:

`E[L(π_θ)] ≤ T² ε`

where `T` is episode length and `ε` is per-step BC error.

**DAgger error bound**: error compounds LINEARLY:

`E[L(π_θ)] ≤ T ε`

This is why DAgger is theoretically + practically better for long episodes.

## GAIL + adversarial imitation

Ho-Ermon 2016. Imitation = adversarial training:

- **Discriminator** `D(s, a)`: trained to distinguish demo (s, a) pairs from policy ones.
- **Policy** `π_θ`: trained to fool D.

Equilibrium: policy distribution matches demo distribution.

**GAIL**: TRPO + GAN-style discriminator.

**AIRL** (Adversarial Inverse RL): GAIL with reward function as the discriminator. Recovers reward + policy.

**SQIL** (Reddy et al. 2020): trains policy with reward = 1 for demo states, 0 for rollouts. Simpler; surprisingly competitive.

## Bias from suboptimal demos

If demos are suboptimal, IL learns the suboptimal behavior. Mitigations:

**Demo filtering**: drop bad demos based on reward / heuristics.

**Demo weighting**: weight demos by quality.

**RL fine-tuning**: use BC as init; fine-tune with RL.

**Inverse RL**: extract reward; RL beyond demo quality.

For production: human-collected demos are imperfect; some quality control is essential.

## Multi-task imitation

Train one policy on demos from many tasks:

- **Conditional policy**: input includes task ID or task embedding.
- **Goal-conditioned**: policy conditioned on (state, goal).
- **Language-conditioned**: policy conditioned on natural-language instruction.

Modern VLAs (RT-2, OpenVLA, π-0) are language-conditioned: instructions like "pick up the red block" guide actions.

**Generalization**: multi-task policies often generalize to new tasks better than single-task ones (positive transfer).

## Hierarchical imitation

For long-horizon tasks:

- **High-level policy**: outputs subgoals or skill names.
- **Low-level skills**: each handles a specific subtask.
- Both trained from demonstrations (or skill libraries).

**SayCan** (Google 2022): LLM proposes high-level plans; learned skills execute. Influential in manipulation research.

**Voyager** (Wang et al. 2023): LLM-driven Minecraft agent with hierarchical skills. Demonstrated long-horizon learning + curriculum.

## Cross-embodiment imitation

Demos collected on one robot; deploy on another:

- Open X-Embodiment: 22 robots; cross-embodiment training.
- **Mobile ALOHA** (Stanford 2024): low-cost teleoperation system; trained policies for mobile manipulation.
- **AnyTeleop** + **OpenTeleVision**: easy teleop frameworks for diverse robots.

The dream: collect demos on cheap robots; deploy on expensive production robots. Partially realized.

## Demo collection methods

**Teleoperation**:
- Joystick / 3D mouse: low-cost; limited dexterity.
- VR controllers: better dexterity; expensive setup.
- Bimanual exoskeletons: high-quality; expensive (Mobile ALOHA, ALOHA, GELLO).

**Kinesthetic teaching**: physically guide the robot. High-quality but slow.

**Scripted policies**: hand-engineered for simple tasks; bootstrap data collection.

**Internet videos** (recent): extract demonstrations from YouTube etc. with computer-vision processing. Active research.

## Connection to RL

IL + RL hybrids:
- **GAIL**: IL via adversarial training.
- **Demo-augmented RL**: RL with expert demos in the replay buffer.
- **Pretrain + finetune**: IL bootstrap; RL refines.
- **DAGGER + RL**: iterative expert correction; RL for unobserved states.

Production policies often use combinations: BC for initialization; RL for fine-tuning; DAgger-style corrections for problem states.

## References

- Pomerleau 1991. *Efficient training of artificial neural networks for autonomous navigation*. (Original BC.)
- Ross, Gordon, Bagnell 2011. *A reduction of imitation learning and structured prediction to no-regret online learning*. (DAgger.)
- Ho & Ermon 2016. *Generative adversarial imitation learning*. *NeurIPS*.
- Zhao et al. 2023. *Learning fine-grained bimanual manipulation with low-cost hardware*. (ACT + Mobile ALOHA.)
- Chi et al. 2023. *Diffusion policy: visuomotor policy learning via action diffusion*. *RSS*.
