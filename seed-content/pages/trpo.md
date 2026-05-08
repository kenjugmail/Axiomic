---
title: Trust Region Policy Optimization (TRPO)
category: rl
---
<!-- tier:intro -->
# TRPO

The principled trust-region predecessor of PPO. Schulman et al. 2015. Solves a constrained optimization at every step:

```
maximize  L(θ) = E[(π_θ/π_old) · A]
subject to  E[KL(π_old || π_θ)] ≤ δ
```

Theoretically beautiful (provable monotonic improvement under exact computation). Practically complex (requires conjugate gradient + line search). Mostly superseded by PPO, but the conceptual framework is foundational.

<!-- tier:undergrad -->
# TRPO (Undergrad)

## Why a trust region

Vanilla policy gradient takes large steps that can wreck the policy. The fundamental issue: the gradient is computed under the *current* policy's data distribution. After a step, the new policy's data distribution may be very different — the gradient direction is wrong for the new policy.

A trust region bounds how much the policy can change per step. Within the region, the importance-weighted estimator is approximately valid; the policy improvement theorem applies; you stay in the regime where the math works.

## The TRPO algorithm

```
1. Sample trajectories under π_old.
2. Estimate advantages A.
3. Compute the natural gradient direction:
   g = ∇L(θ_old)         (policy gradient)
   F = E[∇log π_θ ∇log π_θ^T]   (Fisher information)
   d = F^{-1} g                  (natural gradient)
4. Line search:
   for α ∈ [α_max, α_max/2, α_max/4, ...]:
       θ_new = θ_old + α · d
       if KL(π_old || π_new) ≤ δ and L(θ_new) > L(θ_old):
           accept
           break
5. θ_old ← θ_new; repeat.
```

The natural gradient direction is the steepest ascent in **KL distance** rather than Euclidean parameter distance. The line search ensures the chosen step satisfies the KL constraint.

## Conjugate gradient for the natural gradient

Computing `F^{-1} g` directly requires inverting the Fisher information matrix — `O(d²)` storage, `O(d³)` compute, where `d` is the number of parameters. Infeasible for neural networks.

**Conjugate gradient** solves `F x = g` iteratively without ever forming `F`. Only requires `F · v` (Fisher-vector products), which are cheap:

```
F · v = E[∇log π · (∇log π · v)] / batch_size
```

A fixed-iteration CG (10-20 iterations) gives a good approximation. Standard.

## When TRPO matters

- **Theoretically**: TRPO has provable monotonic improvement under exact computation. PPO doesn't.
- **Practically**: TRPO is much harder to implement and debug. PPO matches its empirical performance.

For most modern applications, use PPO. TRPO's value is conceptual: it formalizes what 'trust region' means and why it matters.

<!-- tier:grad -->
# TRPO (Grad)

## The KL ball

The TRPO constraint `E[KL(π_old || π_θ)] ≤ δ` defines an ellipsoidal region in parameter space (because KL is locally quadratic with the Fisher as Hessian). The natural gradient is the direction that maximizes `L(θ)` per unit of KL distance.

Equivalently: we're doing gradient ascent in the geometry where KL is the metric. This is **information geometry** applied to RL.

## Why monotonic improvement is hard to maintain

The proof of monotonic improvement uses an exact bound:

```
L(θ_new) - L(θ_old) ≥ E[A^π_old(s, a)] - C · max KL(π_old, π_new)
```

for some constant `C`. With `KL ≤ δ` small enough, the second term doesn't overwhelm the first, and improvement is guaranteed.

In TRPO's actual implementation:
- `L(θ_new) - L(θ_old)` is estimated from samples, not exact.
- `KL` is estimated, not exact.
- The constant `C` comes from a worst-case bound that's loose in practice.

So 'provable monotonic improvement' becomes 'usually monotonic in practice', which is approximately what PPO also achieves — without any of the implementation complexity. This is why PPO dominated.

## Modern descendants

- **PPO**: TRPO with the KL constraint replaced by a clipped surrogate.
- **ACKTR**: TRPO with K-FAC instead of conjugate gradient (faster Fisher-vector products).
- **PPG** (Phasic Policy Gradient, Cobbe 2020): combines PPO with an auxiliary value loss in alternating phases. Better sample efficiency than vanilla PPO on Procgen.
- **MPO** (Maximum a Posteriori Policy Optimization, Abdolmaleki 2018): trust-region method specifically for off-policy RL with continuous actions.

The trust-region family is alive and well. PPO is the simple instance; TRPO/ACKTR/MPO are the more theoretically-motivated cousins. For most projects, start with PPO and only graduate to the more complex variants when you have specific reasons.
