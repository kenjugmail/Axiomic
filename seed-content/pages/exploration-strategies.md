---
title: Exploration Strategies
category: rl
---
<!-- tier:intro -->
# Exploration Strategies

The practical wall of every RL project. Without enough exploration, the agent settles for whatever it found first and never discovers the bigger reward two states away.

A toolkit, in rough order of complexity:

1. **ε-greedy**: random action with probability ε. Simple; weak.
2. **Entropy regularization**: keep policy stochastic via entropy bonus. Standard in PPO.
3. **UCB / count-based**: exploration bonus inversely proportional to visit count.
4. **RND** (Random Network Distillation): novelty bonus from prediction error.
5. **Curiosity / forward models** (ICM): bonus for unpredictable transitions.

<!-- tier:undergrad -->
# Exploration (Undergrad)

## ε-greedy and its limits

```
if random() < ε: a = random_action()
else: a = argmax Q(s, a)
```

`ε` decays from 1.0 → ~0.05 over training.

**Strengths**: dead simple. Works on tabular Q-learning, DQN, anything with `Q`.

**Weaknesses**:
- Random exploration is dumb (every action equally likely, even known-bad ones).
- Doesn't compose into long trajectories (5% random per step → most multi-step plans get disrupted).
- Doesn't scale to continuous actions (uniform in `R^d` is useless).

For easy environments (CartPole, simple Atari): good enough. For hard exploration (Montezuma's Revenge, sparse-reward continuous control): fails.

## Entropy regularization

For policy gradient methods, exploration comes from the policy's stochasticity. Add an entropy bonus to the loss:

```
L_total = L_policy - β · H(π)
```

`H(π)` is the entropy of the policy distribution. Higher `β` → more exploration; lower `β` → faster convergence.

For categorical (discrete) policies: `H = -Σ π(a) log π(a)`. For Gaussian: `H = 0.5 · log(2πe·σ²)`.

PPO defaults to `β = 0.01`. SAC takes this further with `α H(π)` as the *whole* objective — explicit max-entropy RL.

## Count-based and UCB

The principled approach: maintain visit counts `N(s, a)`. Add bonus `c / √N(s, a)` to the value estimate. UCB-style.

For continuous spaces, exact counts are infeasible; use **pseudo-counts** from a density model (Bellemare 2016) or hashed approximate counts.

```
Q_explore(s, a) = Q(s, a) + β / √N(s, a)
```

Acts like 'optimism in the face of uncertainty' — under-explored actions are temporarily inflated until visited enough times to know better.

## RND — the practical winner

**Random Network Distillation** (Burda 2018):

1. Initialize a random network `f_random(s)` (frozen, never updated).
2. Train a predictor `f_φ(s)` to match `f_random(s)`.
3. Use `‖f_φ(s) - f_random(s)‖²` as an intrinsic reward.

On familiar states, the predictor matches well → low reward. On novel states, the predictor hasn't seen them → high error → high reward → exploration incentive.

No density model required. Works on any state representation (images, vectors, etc.). Solves Montezuma's Revenge — the historical hard-exploration benchmark.

PPO + RND is the practical default for hard-exploration problems. Implementation is ~50 extra lines of code.

<!-- tier:grad -->
# Exploration (Grad)

## Forward-model curiosity (ICM)

**Intrinsic Curiosity Module** (Pathak 2017):

1. Train a forward model `f(s, a) → ŝ'`.
2. Intrinsic reward: `r_intr = ‖f(s, a) - s'‖²` — the prediction error.

Conceptually similar to RND but the prediction target is the *next state*, not a random function. Has the disadvantage that learnable noise (e.g., random pixels in TV-watching environments) creates persistent surprise — the agent gets stuck watching noise.

RND's randomness avoids this: the random target is deterministic given the state, just unknown to the predictor. Once the predictor has seen the state, error drops; on truly novel states, error stays high.

## Empowerment and information-theoretic exploration

**Empowerment**: maximize the agent's *control* over future states. Quantified as `I(future states; current actions | current state)` — the mutual information between actions and future outcomes. Agents seek states where actions matter most.

Computationally expensive to estimate; theoretically clean. Worked well on small problems; less mainstream than RND in modern deep RL.

## Diversity-based exploration

**DIAYN** (Eysenbach 2018): learn a set of diverse skills without any task reward. Each skill is conditioned on a latent variable; the objective rewards skills for being mutually distinguishable.

Useful for unsupervised pretraining of RL agents. Skill-conditioned policies can be fine-tuned to specific tasks much faster than learning from scratch.

## Practical guidance

For most practical projects:

1. **Start with entropy regularization** (already in PPO). Tune `β` if needed.
2. **If exploration is the bottleneck**, add **RND**. ~50 lines of code, well-tested.
3. **For very-hard exploration** (Montezuma, NetHack): combine RND with task-aware exploration (e.g., go-explore's archive of novel states).
4. **For multi-task / lifelong learning**: consider DIAYN-style skill discovery during pretraining.

The most common mistake: thinking 'my agent isn't learning' is an algorithm problem when it's actually an exploration problem. Always check the entropy curve and visit-count distribution before reaching for fancier algorithms.
