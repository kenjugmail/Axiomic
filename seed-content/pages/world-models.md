---
title: World Models
category: rl
---
<!-- tier:intro -->
# World Models

Learned models of environment dynamics that compress observations into a latent state and predict how that state evolves under actions. The substrate of modern model-based RL.

The canonical instance: Dreamer's RSSM (Recurrent State Space Model). The general idea — observation → latent → predict next latent + reward — is the dominant world-model recipe.

<!-- tier:undergrad -->
# World Models (Undergrad)

## Why latents

Raw observations (e.g., 64×64 RGB images) are high-dimensional and noisy. A world model that predicts pixels has to memorize huge amounts of detail — most of which (background pixels, decorative elements) doesn't matter for planning.

**Latent world models** compress observations into a low-dimensional state `z` (typically 100-2000 dimensions). The dynamics are learned in `z`-space; predictions are about `z`, not pixels.

Benefits:
- Faster planning (low-dim).
- Less prone to overfitting irrelevant details.
- Forces the latent to capture only what's relevant for prediction + reward + value.

## RSSM (Recurrent State Space Model)

Dreamer's latent dynamics. Two parts:

**Deterministic recurrence**: `h_t = RNN(h_{t-1}, z_{t-1}, a_{t-1})`. A standard recurrent net carries information across time.

**Stochastic latent**: `z_t ~ p(z_t | h_t)`. A sample from a learned Gaussian (or categorical) given the deterministic state.

Together: `z_t = (h_t, z_t_stochastic)`. The deterministic part is a shared backbone; the stochastic part adds variability.

Training is variational:

```
Encoder:    q(z_t | h_t, o_t)        # uses observation
Prior:      p(z_t | h_t)              # no observation; for prediction
Decoder:    p(o_t | z_t)              # reconstruct observation
Reward:     p(r_t | z_t)
KL(q || p)                            # latent should match prior
```

Train end-to-end. After training, the prior `p(z_t | h_t)` can be unrolled forward without observations — that's what enables 'imagination' during policy training.

## Training the policy in imagination

Once the world model is trained, roll it out:

```python
z = encode(real_observation)
for t in range(H):
    a = actor(z)
    z = world_model(z, a)
    reward = reward_head(z)
    value = critic(z)
    
# Backprop through the rollout to update actor + critic
```

Hundreds of imagined steps per real-world step. The policy gets dense gradient signal from many simulated trajectories. Real environment samples are used only to update the world model.

This is the source of MBRL's sample efficiency: real-world rollouts are expensive; imagined rollouts are nearly free once the model is trained.

<!-- tier:grad -->
# World Models (Grad)

## Categorical vs Gaussian latents

Dreamer V1 used Gaussian stochastic latents. Dreamer V2/V3 switched to **categorical**: `z` is a vector of one-hot codes (e.g., 32 categorical variables, each with 32 categories).

Why categorical wins:
- More expressive: can represent multimodal distributions cleanly.
- Better gradient signal via straight-through estimators.
- Empirically more stable on hard tasks.

The architectural change wasn't dramatic; the empirical improvement was substantial. Categorical latents are now standard in world-model-style approaches.

## Pixel reconstruction vs task-relevant prediction

Dreamer reconstructs pixels. MuZero predicts only policy/value/reward targets. The trade-off:

- **Pixel reconstruction**: forces the latent to capture all visible information. Robust feature learning. But wasteful — the latent stores decoration the policy doesn't need.
- **Task-relevant prediction**: latent captures only what matters for planning. Compact, efficient. But brittle if the planner needs new information later (e.g., transfer to a related task).

Modern recipes mix both: reconstruct for representation learning during pretraining; switch to task-relevant for finetuning. Dreamer V3 keeps reconstruction; MuZero deliberately drops it.

## When world models fail

- **High-stochasticity environments**: latents can't capture intrinsic randomness; predictions are blurry.
- **Long-horizon dependencies**: errors compound over imagined rollouts; horizon `H = 50-200` is the practical limit.
- **Out-of-distribution states**: model trained on `D` performs poorly on states the policy reaches by exploring beyond `D`. Iterative collection helps.
- **Very-large state spaces** (e.g., open-world games): the latent has to be enormous; training the world model alone becomes a major engineering effort.

For most current applications: Dreamer V3 + Atari/DMControl works well at the 1B-parameter scale. Beyond that, world-model RL is still active research; not yet a turnkey solution at frontier scale.

## Connections to predictive coding

World models share substrate with **predictive coding** (Friston, Rao 1999): the brain as a prediction machine that minimizes surprise. Free-energy minimization, active inference, Bayesian brain hypothesis — all related to world-model RL via shared variational machinery.

The conceptual claim: 'agent that learns a world model and plans in it' is a candidate computational substrate for general intelligence. Whether or not you buy the cosmology, the math is the same.
