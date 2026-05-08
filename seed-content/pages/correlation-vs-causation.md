---
title: Correlation vs Causation
category: causal
---
<!-- tier:intro -->
# Correlation vs Causation

The single most ignored line in statistics: *correlation does not imply causation*.

Two variables can be statistically associated for three reasons:

1. **`X` causes `Y`** — a real causal relationship.
2. **`Y` causes `X`** — reverse causation.
3. **A common cause `Z` causes both** — confounding.

Observational data alone cannot distinguish these. The same correlation pattern emerges in all three cases. Distinguishing them requires either intervention (experiments) or strong assumptions encoded in a causal model (DAGs + identifiability analysis).

For ML practitioners: most ML training data is observational; most ML predictions are correlational; the handoff to causal claims is silent and often wrong.

<!-- tier:undergrad -->
# Correlation vs Causation (Undergrad)

## Famous spurious correlations

- **Ice cream sales + drownings**: both caused by hot weather.
- **Chocolate consumption + Nobel laureates per capita**: both caused by national wealth.
- **Pirates + global temperature**: spurious; cited by FSM-ites for satire.
- **Margarine consumption + divorce rates in Maine**: spurious time-trend correlation.

These look like causal relationships. They aren't. The data has the same shape that real causation would; the mechanism is confounding.

## Why this matters in production ML

ML models trained on observational data produce predictions that are correlational. When you act on them, you implicitly treat them as causal — and you're often wrong.

**Caruana et al. 2015 (pneumonia mortality)**: a model learned that asthmatic patients had LOWER mortality. The mechanism: asthmatics get faster + more aggressive treatment because they're flagged as high-risk for respiratory complications. Acting on this prediction (sending asthmatics home as low-risk) would have killed them.

**Hiring screening models**: trained on historical hiring data, models learn from features that correlate with promotion bias rather than performance. Deploying them amplifies the historical bias.

**Recommender systems**: 'predict' clicks, but acting on the prediction (showing the recommended item) shifts user behavior. Training-time and deploy-time distributions diverge.

In all three: prediction was correct as prediction. It failed as a causal claim.

## The right framing

If you'll act on a prediction, ask: is this prediction supposed to tell me what an intervention will do?

- **Yes** → you need causal inference. Either an experiment or explicit causal-inference methods (instrumental variables, regression discontinuity, do-calculus on a defended graph).
- **No, just describing the world** → prediction is fine; don't oversell.

ML accuracy metrics are silent on causality. A 99% accurate model can be 100% wrong about what an intervention will do.

## What rules out the alternatives

For a claim that `X → Y` causally:

- **Rules out reverse causation**: time order (`X` precedes `Y`), or `X` is exogenously assigned.
- **Rules out common cause**: randomization (the gold standard), or backdoor adjustment for ALL confounders, or front-door criterion, or instrumental variables.

These methods are the rest of this path.

<!-- tier:grad -->
# Correlation vs Causation (Grad)

## Hill's criteria + their modern critique

Bradford Hill (1965) proposed nine criteria for evaluating causal claims from observational data: strength, consistency, specificity, temporality, biological gradient, plausibility, coherence, experiment, analogy.

These are heuristics, not a sufficient set. Modern causal inference would say: Hill's criteria help build a story, but identifiability needs a formal causal model + assumptions verifiable in principle.

## Reichenbach's common cause principle

If `X` and `Y` are statistically dependent and neither causes the other, there exists a common cause `Z` such that conditioning on `Z` makes `X` and `Y` independent.

Reichenbach's principle is what justifies the search for confounders. The principle has known violations (quantum entanglement; common-fate scenarios) but is sound for most macroscopic causal inference.

## Why machine learning gets this wrong

A typical supervised-learning setup:

- Train on `(X, Y)` from observational distribution `P_obs(X, Y)`.
- Predict `Y` from `X` at deployment.

If the deployment distribution differs from training (because you'll *intervene* on `X`), the prediction is generally wrong. The model learned `P_obs(Y | X)`; you wanted `P(Y | do(X))`.

**The two coincide** only when:

- The protocol guarantees no confounding (e.g., randomized assignment of `X` at train time).
- Or you've adjusted for all confounders.

Most production ML satisfies neither. The ML literature has historically been silent on this; it's gradually waking up (causal-aware ML, causal-DML, causal forests).

## When prediction itself is the goal

Not all ML is causal. Image classification, language modeling, search ranking, OCR — all of these are pure prediction tasks. The goal is to predict labels at test-time data drawn from the same distribution as training.

The trouble starts when prediction is *acted on* and the action *changes the distribution*. Recommendation, ad-targeting, content moderation, autonomous-vehicle decision-making — all live in this space. Causality matters here even though the team thinks of itself as 'just doing ML'.

## Reading list

- Pearl, *Causality* (2009). The DAG framework's textbook.
- Hernán & Robins, *Causal Inference: What If* (2020). Modern epidemiologically-flavored treatment.
- Imbens & Rubin, *Causal Inference for Statistics, Social, and Biomedical Sciences* (2015). The potential-outcomes framework.
- Rosenbaum, *Observational Studies* (2002). Foundations of selection-on-observables methods.
- Pearl, Glymour, Jewell, *Causal Inference in Statistics: A Primer* (2016). Lighter introduction; good first read.
