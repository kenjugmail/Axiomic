---
title: Peeking Bias
category: stats
---
<!-- tier:intro -->
# Peeking Bias

The inflation of Type I error rate that occurs when an experiment is monitored continuously and stopped when a result becomes significant.

A naive A/B test peeked every day for 30 days, stopping when p < 0.05, has effective false-positive rate ~40%, not 5%.

The fix: sequential testing methods that account for peeking ([[sequential-testing]]).

<!-- tier:undergrad -->
# Peeking Bias (Undergrad)

## The mechanism

Each peek is a hypothesis test. Type I rate per peek = α (e.g., 0.05). Family-wise error rate across N peeks:

```
FWER = 1 - (1 - α)^N
```

For N = 5 peeks: FWER ≈ 23%. For N = 30: ~78%. Approaches 1 as N → ∞.

Equivalently: with continuous monitoring of a true H₀, the running p-value is a martingale; it will eventually cross any fixed threshold given enough time.

## How it shows up in practice

**A/B test platforms without sequential testing**: PMs see 'p < 0.05' on day 5; ship the change; later analysis shows the effect was noise.

**Hyperparameter sweeps**: try 100 configs; pick the one that beats baseline at p < 0.05; that 'win' is mostly multiple-testing inflation, not real signal.

**Iterative model improvements**: 'we made 20 small changes; each was significant on the test set we eyeballed' — cumulative effect of repeated peeks at the same data.

**Reporting only successful experiments**: publication bias is peeking writ large.

## Visualizing the problem

```
Day 1: p = 0.42 (peek, continue)
Day 2: p = 0.18 (peek, continue)
Day 3: p = 0.07 (peek, continue)
Day 4: p = 0.04 (peek, STOP — 'significant'!)
```

Day 4 looks fine in isolation. But you got there by checking 4 times; each check was an opportunity to falsely declare success.

## The fixes

**Pre-register**: pre-commit to sample size + final analysis time. No peeking. Simplest; conservative.

**Group sequential**: plan N peeks; allocate α budget across them.

**Always-valid p-values / confidence sequences**: continuous monitoring with valid inference at every moment.

**Bayesian methods**: posterior probability of effect; not subject to the peeking problem in the same way.

For ML A/B: use a platform that implements one of these (GrowthBook, Statsig). Don't roll your own without sequential testing.

<!-- tier:grad -->
# Peeking (Grad)

## Why naive p-values fail under peeking

The classical p-value is computed assuming a fixed sample size `n`. It's the probability, under H₀, of observing data at least as extreme — *given that you stopped at n*.

When stopping rule depends on the data ('stop when p < 0.05'), the sampling distribution under H₀ is different. The naive p-value isn't a true probability anymore.

Always-valid methods construct test statistics whose distribution under H₀ is invariant to stopping rule. Any data-dependent stopping is allowed.

## Optional stopping in Bayesian inference

Bayesian inference is *immune* to optional stopping for the posterior. The posterior `p(θ | data)` doesn't depend on what you would have done if data had been different.

Caveat: 'Bayesian decision-making with stopping rules' is more subtle. If the decision threshold itself depends on observed data, you can still bias decisions.

For most practical purposes: Bayesian A/B testing with pre-decided thresholds handles peeking cleanly. This is one reason companies are migrating to Bayesian platforms.

## The garden of forking paths

Even without explicit peeking, scientists make data-dependent decisions: which subset to analyze, which model to fit, which covariates to include. Each branching choice is implicitly a peek.

**Garden of forking paths** (Gelman & Loken 2014): even without explicit p-hacking, the *possibility* of choosing different analyses inflates the false-positive rate.

Solutions: pre-register the analysis; use a holdout that's only touched once; explicitly correct for the analysis-tree.

## Real cost of peeking

A 2018 Microsoft study found that ~25% of 'significant' A/B test results in their internal experiments were overturned upon longer running. The peeking-induced false positive rate is real and measurable.

Modern A/B platforms have largely fixed this by enforcing sequential testing. But teams rolling their own A/B infrastructure consistently re-discover the problem.
