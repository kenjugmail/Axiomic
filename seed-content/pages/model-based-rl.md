---
title: Model-Based Reinforcement Learning
category: rl
---
<!-- tier:intro -->
# Model-Based RL

Learn a model of the environment dynamics from data; plan with the model. Achieves 10-100× better sample efficiency than model-free RL on real-world problems where each environment step is expensive.

Modern instances: Dreamer, MuZero, world-model-based control. State of the art on Atari 100K (a benchmark with only 100K real frames).

<!-- tier:undergrad -->
# Model-Based RL (Undergrad)

## The recipe

```
repeat:
    1. Collect data with current policy in real environment.
    2. Update dynamics model: train f(s, a) → s', r̂(s, a) → r on transitions.
    3. Generate synthetic data: roll out f for K steps from real states.
    4. Update policy/value using both real and synthetic data.
```

Variants differ in step 3 (how to use the model) and step 4 (which RL algorithm consumes synthetic data).

## Dyna-style

Sutton 1991. Use the model to fabricate extra `(s, a, r, s')` transitions; train a model-free Q-learner on the combined real + synthetic buffer.

```python
buffer = []
for episode:
    real_transitions = collect_real(...)
    buffer.extend(real_transitions)
    
    update_model(real_transitions)
    
    for _ in range(N_synthetic):
        s = sample(buffer).state
        a = sample_action()
        s_next, r = model(s, a)
        buffer.append((s, a, r, s_next))
    
    update_q_learner(buffer)
```

Simple; effective on tabular problems. Modern variants (MBPO, Janner 2019) extend this to deep RL with bounded synthetic rollout depth.

## Model Predictive Control (MPC)

At each timestep:

1. Use the model to roll out `K` candidate action sequences, each of length `H`.
2. Score each sequence by predicted return.
3. Execute the first action of the best sequence.
4. Re-plan next step.

The classic robotics approach. CMA-ES, MPPI, random shooting are common samplers. No policy network needed; planning happens online.

**Strengths**: directly uses the model; no off-policy issues; transparent.
**Weaknesses**: planning per step is expensive; horizon `H` limits credit assignment.

## Dreamer

Dreamer (Hafner 2019, 2020, 2023) is the canonical modern MBRL algorithm. Architecture:

1. **Latent dynamics model** (RSSM): encode observations into a latent state, learn `z' = f(z, a)`.
2. **Reward predictor**: `r̂ = head(z)`.
3. **Actor**: `π(a | z)`.
4. **Critic**: `V(z)`.

Training:
- Real data → train latent dynamics (image reconstruction loss + reward prediction).
- Imagined latent rollouts (hundreds of steps) → train actor + critic.

Result: train policy almost entirely in imagination. Real-environment samples only feed the dynamics model. Massive sample efficiency on Atari, DMControl, and Crafter.

<!-- tier:grad -->
# Model-Based RL (Grad)

## Model bias and pessimism

The chronic failure mode: the policy exploits errors in the learned model. Plans converge to high-value-according-to-model states that don't actually have high real value.

Mitigations:

1. **Pessimism / conservatism** (MOPO, MOREL): when the model is uncertain about a state-action, penalize the value estimate. Better to underestimate confidently-known states than to overestimate uncertain ones.
2. **Ensembles**: train K different models. Use disagreement as an uncertainty estimate. Plan over the ensemble's pessimistic projection.
3. **Short horizons**: only plan for `H` steps before bootstrapping with a value function. Limits compounding model error.
4. **Frequent re-collection**: alternate model updates and real-data collection often. Don't drift far from the data the model was trained on.

## MuZero — model trained for what it'll be used for

MuZero (Schrittwieser 2020) trains the model to predict the targets that planning needs (policy + value + reward at each tree node), not to reconstruct observations.

```
representation:  h(o) → z_0
dynamics:        g(z, a) → (z', r)
prediction:      f(z) → (π, V)
```

Training: regress on observed reward + MCTS visit counts (for policy targets) + MCTS root value. Never reconstruct pixels.

This sidesteps the 'predict everything in the observation' difficulty that pixel-reconstruction models like Dreamer face. MuZero's latent encodes only what matters for planning.

Trade-off: MuZero requires MCTS at acting time (expensive). Dreamer's actor is a feedforward network (cheap acting, expensive training).

## When MBRL wins vs model-free

**MBRL wins when**:
- Real-environment samples are expensive (robotics, clinical trials, recommendation systems).
- The dynamics are tractable to learn (smooth, low-dimensional, structured).
- Sample efficiency matters more than wall-clock training time.

**Model-free wins when**:
- Samples are cheap (simulators, games).
- Dynamics are very complex / hard to model (raw pixels with many distractors).
- You want simplicity; MBRL has more moving parts (model, policy, value, planner).

For LLMs / RLHF: model-free PPO dominates. The 'environment' is human preferences, which are hard to model explicitly. Direct policy optimization wins.

For robotics: MBRL has a clear edge. Real-world experience is expensive; simple physics dynamics are learnable. MPC + a learned model is the standard recipe.

For Atari/MuJoCo: MBRL has caught up to and sometimes surpassed model-free on sample efficiency benchmarks. On wall-clock with cheap simulator samples, model-free is still simpler.
