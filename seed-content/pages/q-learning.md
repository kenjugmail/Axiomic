---
title: Q-Learning
category: rl
---
<!-- tier:intro -->
# Q-Learning

The classical model-free, off-policy algorithm for finding optimal action-value functions. Update rule:

```
Q(s,a) ← Q(s,a) + α · [r + γ max_{a'} Q(s', a') - Q(s, a)]
```

The `max_{a'}` is what makes it off-policy: bootstrap off the *optimal* next action regardless of what the behavior policy does.

Watkins (1989) proved tabular Q-learning converges to `Q*` under standard conditions. With function approximation (DQN), convergence is empirical.

<!-- tier:undergrad -->
# Q-Learning (Undergrad)

## On-policy vs off-policy

The behavior policy collects data; the target policy is what we're trying to learn. **On-policy**: same. **Off-policy**: different. Q-learning is off-policy because the update bootstraps off `max_a Q(s', a')` (the optimal action's value) regardless of which action was actually taken.

This is powerful: any exploratory behavior policy (ε-greedy, random, or even a previous version of the target) can collect data, and Q-learning will still learn about `Q*`. SARSA, in contrast, learns about whatever policy is currently exploring — its `Q` reflects exploration noise.

## Standard tabular implementation

```python
Q = defaultdict(lambda: 0.0)
for episode in range(N):
    s = env.reset()
    while not done:
        # ε-greedy action selection
        if random() < ε:
            a = random_action()
        else:
            a = argmax_a Q[(s, a)] for a in actions
        
        s_next, r, done = env.step(a)
        
        # TD update
        target = r + γ * max(Q[(s_next, a_)] for a_ in actions)
        Q[(s, a)] += α * (target - Q[(s, a)])
        
        s = s_next
```

In CartPole-like discrete settings, this converges in a few thousand episodes with `α=0.1`, `γ=0.99`, `ε`-decay from 1.0 to 0.05.

## Why ε-greedy is sufficient (in tabular)

For convergence, all `(s, a)` pairs must be visited infinitely often. ε-greedy with `ε > 0` guarantees this: with probability `ε` you pick a random action, eventually visiting every action in every state. As long as `ε` decays slowly enough that this still happens often, convergence follows.

In hard-exploration environments (sparse rewards, complex state spaces), ε-greedy becomes insufficient. See [[exploration-strategies]] for smarter alternatives.

<!-- tier:grad -->
# Q-Learning (Grad)

## DQN

The breakthrough: combine Q-learning with deep neural networks. Replace the table with `Q_θ(s, a)`. Train via:

```
L(θ) = E_{(s,a,r,s') ~ buffer} [(r + γ max_{a'} Q_{θ⁻}(s', a') - Q_θ(s, a))²]
```

Three engineering tricks make this stable:

1. **Experience replay**: store transitions in a buffer; sample mini-batches. Breaks temporal correlation; reuses data.
2. **Target network**: `θ⁻` is a slow-updating copy of `θ`. Stabilizes the bootstrap target.
3. **Reward clipping** (sometimes): clip rewards to `[-1, 1]` to keep the value scale bounded across games.

DQN solved Atari from raw pixels (Mnih et al. 2015). The recipe — value-based, off-policy, replay buffer, target network — is the foundation of every subsequent value-based deep RL algorithm.

## Maximization bias

`max_{a'} Q(s', a')` is upward-biased: `E[max(noisy estimates)] ≥ max(true)`. Over many updates, this propagates and can cause overestimation.

**Double DQN** (van Hasselt 2016): use the online network to *select* the action, the target network to *evaluate*:

```
target = r + γ · Q_{θ⁻}(s', argmax_{a'} Q_θ(s', a'))
```

Reduces overestimation; usually improves performance. Standard in modern Q-learning variants.

## Q-learning's deadly triad

Function approximation + bootstrapping + off-policy data → potential divergence. DQN's tricks empirically tame this; they don't formally solve it. For continuous action spaces (where `max_a` is hard), value-based methods give way to actor-critic (DDPG, SAC).

## Beyond DQN: Rainbow + variants

The 'Rainbow' agent (Hessel 2017) combines six DQN improvements:
1. Double Q-learning (bias reduction)
2. Prioritized experience replay (sample important transitions more often)
3. Dueling architecture (separate `V` and `A` heads)
4. Multi-step returns (n-step bootstrapping for faster credit assignment)
5. Distributional Q-learning (learn full return distribution, not just mean)
6. Noisy networks (parametric exploration noise instead of ε-greedy)

The combination achieves significantly better Atari performance than vanilla DQN. Each improvement is incremental; the combination is large.

For most practical deep Q-learning, **vanilla DQN + double-Q + prioritized replay** is the right starting point. Rainbow's full stack adds complexity; sometimes the simpler version is plenty.
