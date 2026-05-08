---
title: Causal Forests
category: causal
---
<!-- tier:intro -->
# Causal Forests

A random-forest-style estimator specifically designed for **CATE** (Conditional Average Treatment Effect) estimation.

Wager & Athey 2018. Built on the ideas of generalized random forests; later refined by Athey, Tibshirani, Wager 2019.

**Key innovations**:

- **Causal-aware splits**: trees split nodes to maximize HETEROGENEITY in treatment effects, not just predictive accuracy.
- **Honest estimation**: use one half of the data for split selection, the other half for leaf-value estimation. Eliminates bias from splitting.
- **Valid asymptotic confidence intervals**: per-user CATE estimates with calibrated uncertainty.

Used in production at Microsoft, Uber, Netflix, and many academic studies. The state of the art for CATE in tabular data.

<!-- tier:undergrad -->
# Causal Forests (Undergrad)

## What's different from a random forest

Standard random forest splits nodes to maximize predictive accuracy of `Y`. The forest estimates `E[Y | X]`.

Causal forest splits nodes to maximize HETEROGENEITY in treatment effects. The forest estimates `τ(x) = E[Y(1) - Y(0) | X = x]`.

The procedure:

1. Sample bootstrap trees.
2. At each split, evaluate candidate splits by estimated CATE difference between left and right subtrees.
3. Pick the split maximizing the score.
4. Continue until leaves are small.
5. Average across trees.

The result: a forest where each leaf has a more-homogeneous treatment-effect group, and the leaf-level CATE estimate is the difference in observed means within each leaf (under unconfoundedness).

## Honest splits

Causal forests use **honest sample splitting**:

- Split sample into "training" half and "estimation" half.
- Use training half to grow trees + choose splits.
- Use estimation half to compute leaf-level CATE.

This eliminates split-selection bias that would otherwise inflate treatment-effect estimates. The cost: half the data for splitting; half for estimation.

**Why it matters**: without honesty, the splits are chosen to maximize observed heterogeneity, which inflates the apparent heterogeneity. With honesty, the heterogeneity is computed on data not used for splitting; estimates are unbiased.

## Confidence intervals

Causal forests give per-user CATE estimates AND valid asymptotic confidence intervals.

The CI uses the empirical sandwich estimator over the trees:

- Each tree gives a CATE estimate at point `x`.
- Average across trees: `τ̂(x)`.
- Standard error: variance across trees, with a sample-splitting correction.
- 95% CI: `τ̂(x) ± 1.96 · SE(x)`.

Wager-Athey 2018 prove this is asymptotically valid under regularity conditions.

## Tools

**`grf` (R)**: the canonical implementation. Mature, well-documented.

**`econml.dml.CausalForestDML` (Python)**: causal forest with DML nuisance handling. Plays well with scikit-learn.

**`CausalNex` (Python)**: alternative.

These tools handle:

- Cross-fitting for nuisance parameters.
- Honest sample splitting.
- Per-user CATE estimates with CIs.
- Variable importance for treatment-effect drivers.
- Goodness-of-fit diagnostics.

## When to use causal forests

**Best fit**:
- Tabular data.
- Continuous or many discrete covariates.
- Sample size in the thousands to millions.
- Treatment is binary or discrete with few levels.
- Unconfoundedness conditional on `X` is plausible.

**Less well-suited**:
- Image / text / sequential data (use neural-net meta-learners instead).
- Very small samples (< 1000): variance dominates.
- Continuous treatment with rich dose-response curve (other estimators handle this better).
- When the treatment-effect heterogeneity is in a low-dimensional projection of `X` rather than axis-aligned (DML with deep nets handles this better).

<!-- tier:grad -->
# Causal Forests (Grad)

## Theoretical foundation

Causal forests are part of the broader **Generalized Random Forests (GRF)** framework (Athey-Tibshirani-Wager 2019). GRF generalizes random forests to estimate any locally identified estimand:

- Mean: `E[Y | X = x]` (standard random forest).
- Quantile: `Q_τ(Y | X = x)` (quantile forest).
- Treatment effect: `τ(x)` (causal forest).
- IV-identified effect: LATE (`x`) (instrumental forest).

The GRF framework provides asymptotic theory for all of these uniformly.

## Asymptotic results

Under regularity (e.g., bounded covariates, sample-splitting honesty, strict positivity), causal forests are:

- **Consistent**: `τ̂(x) → τ(x)` as `n → ∞`.
- **Asymptotically normal**: `√n (τ̂(x) - τ(x)) → N(0, σ²(x))`.
- **Confidence-interval valid**: the empirical sandwich CIs cover at the nominal rate.

The convergence rate depends on the smoothness of `τ(·)` and the dimensionality of `X`. Slower than parametric rates but faster than nonparametric kernel methods in many regimes.

## Limitations

**Curse of dimensionality**: with very high-dimensional `X`, the leaf samples become too small for accurate CATE estimation. Theoretical work shows convergence slows.

**Axis-aligned splits**: random forests split on individual variables; complex interactions may be hard to capture. Boosted causal forests / oblique forests address this partly.

**Interactions vs main effects**: causal forests focus on heterogeneity, but most treatment effects have a strong main-effect component. The forest uses many splits to capture the main effect, leaving little capacity for interactions. T-learner with strong base learners can sometimes outperform.

**Overlap requirement**: positivity (`0 < e(X) < 1`) must hold. With poor overlap in high `X` dimensions, estimates blow up.

## Variants

**Local Centering**: Athey-Tibshirani-Wager add a step that residualizes `Y` and `T` against estimated nuisance functions before running the forest. Improves performance.

**Cluster-Robust Causal Forest**: handles clustered data (panel / longitudinal). Adjustments to the variance estimator.

**Multi-armed causal forest**: extends to multi-valued treatments. Estimates pairwise CATEs across arms.

**Survival causal forest**: extends to time-to-event outcomes.

**Off-policy evaluation forest**: extends to evaluating policies from logged data.

All implemented in `grf`.

## Comparison to meta-learners

Empirical comparisons (Künzel et al. 2019, Nie-Wager 2021) show:

- **Causal forest** wins when treatment effect is locally constant, axis-aligned heterogeneity exists.
- **X-learner** wins when treatment is rare, treatment effect is small.
- **R-learner** wins when nuisance functions are complex; doubly-robust property kicks in.
- **DML with deep nets** wins on complex interactions, image/text data.

No single method dominates; the choice depends on the data shape. Production teams typically run multiple and check agreement.

## Connection to off-policy evaluation

Causal forests directly estimate `τ(x)`. Combined with a policy `π(x)`, the estimated value of the policy is:

`V(π) = E[Y(π(X))] = E[Y(0)] + E[π(X) · τ(X)]`

So policy evaluation via causal forests reduces to:

1. Estimate `τ̂(x)`.
2. For a candidate policy `π`, compute `E[π(X) · τ̂(X)]` averaging over the data.

This is the substrate of modern off-policy RL evaluation.

## References

- Wager & Athey 2018. Estimation and inference of heterogeneous treatment effects using random forests. *JASA*.
- Athey, Tibshirani, Wager 2019. Generalized random forests. *Annals of Statistics*.
- Künzel et al. 2019. Metalearners for estimating heterogeneous treatment effects. *PNAS*.
- Nie & Wager 2021. Quasi-oracle estimation of heterogeneous treatment effects. *Biometrika*.
- Athey & Imbens 2019. Machine learning methods for estimating heterogeneous causal effects. *Annu. Rev. Econ.*
