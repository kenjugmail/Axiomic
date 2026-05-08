---
title: Intrinsic Motivation & Curiosity
category: rl
---
<!-- tier:intro -->
# Intrinsic Motivation

Reward signals the agent generates for itself — independent of the task reward — to drive exploration toward novelty, surprise, or learning progress.

The pattern: total reward = extrinsic (task) reward + `β` · intrinsic (novelty) reward. The intrinsic term gives the agent a reason to visit unfamiliar states even when there's no immediate task payoff.

Standard implementations: Random Network Distillation (RND), forward-model curiosity (ICM), pseudo-counts, empowerment.

<!-- tier:undergrad -->
# Intrinsic Motivation (Undergrad)

## Why we need it

Hard-exploration environments (Montezuma's Revenge, sparse-reward continuous control, NetHack) have rewards far apart in trajectory space. Random exploration almost never finds them — exponentially unlikely.

Intrinsic rewards solve this by giving the agent a reason to *seek out* unfamiliar states, even when the task reward is silent. Once the agent learns to navigate novelty, it eventually discovers the sparse extrinsic rewards and learns to combine both signals.

The big picture: exploration becomes its own optimization problem, separate from but coupled to the task.

## RND — the modern default

**Random Network Distillation** (Burda 2018):

```python
target_net = randomly_initialized_frozen_network()
predictor_net = trained_to_match(target_net)

for s in observations:
    intrinsic_reward = ||predictor_net(s) - target_net(s)||^2
    train predictor_net on this state to reduce error
```

States the predictor has seen → low error → low intrinsic reward.
States the predictor hasn't seen → high error → high intrinsic reward.

Combine with PPO:
```
total_reward = extrinsic_reward + β · intrinsic_reward
```

Tune `β` so intrinsic doesn't dominate extrinsic. Common: `β = 0.1-1.0` depending on environment.

## Forward-model curiosity (ICM)

**Intrinsic Curiosity Module** (Pathak 2017):

```python
forward_model: f(s, a) → ŝ'
intrinsic_reward = ||f(s, a) - s'||^2
```

The agent gets reward for transitions its forward model can't predict. Conceptually clean, but susceptible to **learnable randomness**: a screen with TV static keeps the model confused; the agent gets stuck watching noise.

RND avoids this because the random target is deterministic in the state — once seen, error drops. ICM's prediction target is the actual next state, which has true randomness the model can never resolve.

In practice, RND is more robust. ICM is still studied for its conceptual elegance.

## Pseudo-counts

For tabular settings, count how often each state has been visited; reward inversely proportional to count.

For continuous/high-dimensional states, exact counts don't work. **Pseudo-counts** (Bellemare 2016) estimate counts from a density model `ρ(s)`:

```
N̂(s) = ρ(s) / (ρ'(s) - ρ(s))
```

where `ρ'` is the density after one update with `s`. Approximate but useful.

Pseudo-count exploration was the SOTA on Montezuma's Revenge before RND. Now mostly replaced by RND because RND is simpler and avoids the density-model engineering.

<!-- tier:grad -->
# Intrinsic Motivation (Grad)

## Empowerment

**Empowerment**: agent rewards itself for being in states where it has high *control* over the future:

```
empowerment(s) = max_{p(a)} I(s'; a | s)
```

The mutual information between current actions and future states. High empowerment = lots of leverage; low empowerment = stuck in fate.

Theoretically elegant; computationally expensive (estimating mutual information in continuous spaces is hard). Worked well on small benchmarks; not a mainstream choice in modern deep RL.

## Information gain

Maximize the expected information gain about environment dynamics:

```
intrinsic_reward = D_KL(p(s' | s, a, history_after) || p(s' | s, a, history_before))
```

The agent seeks transitions that update its belief about the world. Variants: VIME (Houthooft 2016), Bayesian model uncertainty.

Theoretically motivated; expensive in practice. Modern recipes (RND, MaxEnt) achieve similar effects with simpler implementations.

## Skill diversity (DIAYN)

**Diversity is All You Need** (Eysenbach 2018): learn diverse skills without any task reward at all.

Each skill `z` is sampled at episode start. Policy is conditioned on `z`. Reward = `log p(z | s)` — distinguishability of the skill from the visited state.

Result: a portfolio of diverse skills useful for downstream task transfer. Pretrain DIAYN, fine-tune to specific tasks; converges much faster than from scratch on many tasks.

## When intrinsic reward goes wrong

- **Reward dominance**: if `β` is too high, the agent abandons the task entirely to chase novelty.
- **Vanishing intrinsic**: predictor catches up to all states; intrinsic reward drops to zero; exploration stops.
- **Adversarial states**: certain states are inherently noisy or unpredictable; the agent gets stuck on them. Mitigations: deterministic random targets (RND), visit-count caps.

The practical takeaway: intrinsic motivation is powerful but adds a hyperparameter (`β`) and a failure mode (reward hacking on novelty). Use when extrinsic rewards are too sparse for vanilla exploration to find them; otherwise, entropy regularization is enough.
