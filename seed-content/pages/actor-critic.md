---
title: Actor-Critic Methods
category: rl
---
<!-- tier:intro -->
# Actor-Critic

The architecture combining policy gradients with a learned value baseline:

- **Actor**: parameterized policy `π_θ(a | s)`, updated via [[policy-gradient]].
- **Critic**: value function `V_φ(s)`, updated via [[td-learning]].

Trained jointly: critic provides the baseline that reduces actor's variance; actor's policy determines the trajectories the critic observes.

The modern default for policy-gradient RL — A2C, PPO, SAC, RLHF all share this architecture.

<!-- tier:undergrad -->
# Actor-Critic (Undergrad)

## Joint training loop

```python
for iteration in range(N):
    # 1. Collect rollout (n_steps × n_envs parallel)
    states, actions, rewards, log_probs, values, dones = collect_rollout()
    
    # 2. Compute advantages with GAE
    advantages, returns = compute_gae(rewards, values, dones, γ, λ)
    
    # 3. Compute losses
    actor_loss = -(log_probs * advantages.detach()).mean()  # policy gradient with advantage
    critic_loss = ((values - returns) ** 2).mean()           # regression to bootstrapped target
    entropy_loss = -policy.entropy().mean()                  # exploration bonus
    
    loss = actor_loss + 0.5 * critic_loss + 0.01 * entropy_loss
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
```

A single shared network with two heads (one for `π_θ`, one for `V_φ`) is the standard architecture. Most parameters are shared in the body.

## Why it works

**Variance reduction**: subtracting `V^π(s_t)` from the return doesn't change the expected gradient (the baseline is independent of action) but dramatically reduces variance. The critic learns to predict `V^π`; the actor uses it to compute `A_t = G_t - V_φ(s_t)`.

**Off-policy data reuse**: the actor's update can include data from slightly older policies (within the trust region of PPO clipping). The critic's regression-style update is more robust to off-policyness than the actor's gradient.

**Computational efficiency**: shared body amortizes feature computation. The features useful for predicting actions ('what's happening') are also useful for predicting value ('how good is this state').

## Continuous actions

For continuous action spaces, the policy is typically Gaussian:

```
π_θ(a | s) = N(a; μ_θ(s), σ_θ(s))
```

Network outputs the mean and (log of) standard deviation. Sampling: `a = μ + σ * ε` where `ε ~ N(0, 1)`. Log-probability is the Gaussian density.

Action squashing for bounded action spaces: `a = tanh(μ + σ * ε)`. Compute log-probability with the Jacobian correction.

**Soft Actor-Critic (SAC)** extends this with a maximum-entropy objective and twin Q-networks. Off-policy variant; standard for continuous control benchmarks.

<!-- tier:grad -->
# Actor-Critic (Grad)

## The bias-variance dance

Actor and critic must train at compatible rates. If the actor moves too fast, the critic's estimates are stale; advantages are wrong; gradient updates are noisy. If the critic moves too fast, the actor over-adapts to a noisy baseline; convergence stalls.

Practical recipe:
- Same learning rate for actor + critic (they're usually shared anyway).
- PPO's clipping bounds the actor's per-update change → lets the critic catch up.
- Multiple gradient steps per data batch (PPO uses 4-10) → critic gets multiple regression updates per data collection.

When the loss curves disagree (one going down, the other oscillating wildly), the dance is broken. Diagnose: too-large actor LR, missing entropy regularization, or critic architecture too small.

## Continuous-action algorithms

| Algorithm | Type | Key feature |
|-----------|------|-------------|
| A2C | On-policy | Synchronous; baseline + GAE |
| PPO | On-policy | Clipped surrogate; trust region without explicit KL |
| TRPO | On-policy | Explicit KL constraint via natural gradient |
| DDPG | Off-policy | Deterministic policy + DPG theorem |
| TD3 | Off-policy | Twin Q-networks; delayed policy updates |
| SAC | Off-policy | Max-entropy; twin Q + temperature parameter |

**For continuous control benchmarks (MuJoCo, etc.)**: SAC is typically SOTA on sample efficiency. PPO is more robust and easier to tune; SAC is more efficient when the data budget is tight.

**For RLHF + LLMs**: PPO dominates. The on-policy property + KL constraint to a reference model match the RLHF problem cleanly. SAC's replay buffer doesn't fit naturally in the LLM training loop.

## Asynchronous variants

A3C (Mnih 2016): asynchronous workers, each running independent rollouts and updating a shared parameter server. Historically important; now mostly replaced by synchronous A2C with parallel environments. Async adds engineering complexity for marginal benefit on modern hardware where parallelism comes free with multi-GPU.

## The ubiquity of actor-critic

Take any modern RL algorithm and the actor-critic pattern is somewhere inside. Even DQN's natural extension to continuous actions (DDPG, SAC) reintroduces the actor as a separate network. The split — policy + value, trained jointly — is the unifying architecture of modern RL.
