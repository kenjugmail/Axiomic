---
title: Backdoor Criterion
category: causal
---
<!-- tier:intro -->
# Backdoor Criterion

The graphical condition for valid adjustment in causal inference.

To estimate the causal effect of `T` on `Y`, find a set of variables `Z` such that:

1. **No descendants of `T`** are in `Z`.
2. **`Z` blocks every backdoor path** from `T` to `Y`.

If such a `Z` exists, the causal effect is identifiable:

`P(Y | do(T = t)) = ∑_z P(Y | T = t, Z = z) · P(Z = z)`

This is the math underlying regression adjustment, propensity score matching, IPW, and doubly-robust estimators. They all implement backdoor adjustment.

A **backdoor path** is a path from `T` to `Y` that starts with an arrow INTO `T`. These paths transmit non-causal association.

<!-- tier:undergrad -->
# Backdoor Criterion (Undergrad)

## What backdoor paths look like

Consider the DAG `T ← Z → Y`. The path `T ← Z → Y` is a backdoor path: it starts with an arrow into `T`, and it connects `T` and `Y` non-causally (via the common cause `Z`).

Without adjustment, `T` and `Y` are correlated through this path even if `T` has no causal effect on `Y`. To estimate the causal effect, you must block the path — by including `Z` in your adjustment set.

## The two conditions

**Condition 1: no descendants of `T`**.

Descendants of `T` are mediators (or descendants of mediators). Conditioning on a mediator blocks the very path you want to measure (the causal `T → ... → Y` path). It also can introduce M-bias if the mediator is a collider on a backdoor route.

Practical rule: only adjust for variables that are pre-treatment or causally upstream of treatment.

**Condition 2: `Z` blocks every backdoor path**.

Use d-separation. Walk every backdoor path; check that `Z` blocks each one.

A common simplification: include all observed common causes of `T` and `Y`. This usually works but can be wasteful (some common causes are blocked by other adjusters) or insufficient (some confounders are unobserved).

## Examples

**DAG**: `T ← Z → Y`. Adjustment set: `{Z}`. Easy case.

**DAG**: `T ← Z₁ → Z₂ → Y`. Backdoor path is `T ← Z₁ → Z₂ → Y`. Either `{Z₁}` or `{Z₂}` blocks it. Either is a valid adjustment set; minimal is one node.

**DAG with two backdoor paths**: `T ← Z₁ → Y` and `T ← Z₂ → Y`. Need to block both. Minimum: `{Z₁, Z₂}`.

**DAG with collider on backdoor**: `T ← U₁ → Z ← U₂ → Y`. Backdoor path is open (collider at `Z` blocks naturally). DON'T include `Z` in the adjustment set — it would open the path.

## Implementation

Once you have an adjustment set `Z`, estimate the causal effect via:

**Regression**: fit `Y ~ T + Z` (or with interactions); the coefficient on `T` (under correct specification) estimates the causal effect.

**Stratification**: estimate the effect within each stratum of `Z`; weight by the marginal distribution of `Z`.

**Propensity score**: estimate `e(Z) = P(T = 1 | Z)`; use it for matching, weighting (IPW), or as a regression adjuster.

**Doubly-robust**: combine outcome regression and propensity weighting; consistent if either model is correct.

**G-formula**: estimate `P(Y | T, Z)` for each `Z`; integrate over `P(Z)`.

These are all implementations of backdoor adjustment. They differ in computational tractability and robustness to model misspecification.

<!-- tier:grad -->
# Backdoor Criterion (Grad)

## Minimum + sufficient adjustment sets

For a given DAG, multiple adjustment sets may satisfy the backdoor criterion. The choice matters:

- **Minimum sufficient adjustment set**: smallest set that blocks all backdoor paths. Reduces variance.
- **Maximum sufficient set**: includes all observed pre-treatment variables. Adds noise but is robust to specification errors.
- **All sufficient sets**: form a partial order. Tools like `dagitty` enumerate them.

Practical rule: use the minimum sufficient set when the DAG is well-defended; include extra adjusters as a sensitivity check.

## When the backdoor criterion fails

The backdoor criterion **doesn't work** when:

- **All backdoor paths require unobserved confounders to block**. Need IV, RDD, or front-door adjustment.
- **A mediator-confounder structure exists** where blocking the backdoor requires conditioning on a mediator.

Pearl's **front-door criterion** handles some of these cases. Find a mediator `M` such that:

1. `M` lies on every directed path from `T` to `Y`.
2. There are no unblocked backdoor paths from `T` to `M`.
3. All backdoor paths from `M` to `Y` are blocked by `T`.

Then `P(Y | do(T))` is identifiable via the front-door formula:

`P(Y | do(T = t)) = ∑_m P(M = m | T = t) · ∑_{t'} P(Y | M = m, T = t') · P(T = t')`

The classic example: smoking → tar → cancer, with an unobserved gene confounding smoking and cancer. The backdoor `Smoking ← Gene → Cancer` is unblockable (gene unobserved). But tar identifies the smoking-cancer effect via the front door.

## Identifiability vs estimability

The backdoor criterion gives **identifiability** — there exists a function of observable probabilities equal to the causal effect.

**Estimability** is a separate question — given finite data, can you actually estimate that function with bounded variance? Issues:

- **Positivity / overlap**: if `P(T = 1 | Z = z) ≈ 0` for some `z`, IPW estimates blow up.
- **Curse of dimensionality**: high-dimensional `Z` requires assumptions or ML for tractable estimation.
- **Model misspecification**: parametric models can be wrong; doubly-robust + ML methods help.

## Software

- **`dagitty`**: browser tool + R package. Draw DAG → get adjustment sets.
- **`DoWhy`**: Python; identification + estimation pipeline.
- **`EconML`**: Python; double-ML, causal forests.
- **`CausalForge`** / **`CausalNex`**: alternatives.

The identification step is mechanical given a DAG. The estimation step is where art remains.

## References

- Pearl 1995. Causal diagrams for empirical research. *Biometrika*.
- Pearl 2009. *Causality* (chapter 3).
- Shpitser, VanderWeele, Robins 2010. On the validity of covariate adjustment for estimating causal effects. *UAI*.
- Textor, Hardt, Knüppel 2011. DAGitty: A graphical tool for analyzing causal diagrams. *Epidemiology*.
