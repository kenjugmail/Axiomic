---
title: Heterogeneous Treatment Effects
category: causal
---
<!-- tier:intro -->
# Heterogeneous Treatment Effects (HTE)

The recognition that treatment effects vary across the population.

The **Conditional Average Treatment Effect (CATE)** at covariate value `x`:

`τ(x) = E[Y(1) - Y(0) | X = x]`

is a function. The **ATE** is its average: `ATE = E[τ(X)]`.

When `τ(x)` is constant, ATE tells you everything. When it varies, ATE tells you only the average — potentially hiding important heterogeneity (positive effect for some, negative for others, netting to zero).

Real-world treatment effects are almost always heterogeneous. HTE methods estimate the function `τ(x)` rather than a scalar.

<!-- tier:undergrad -->
# Heterogeneous Treatment Effects (Undergrad)

## Why HTE matters

A drug works dramatically better for some patients than others. A scholarship's effect varies by income + first-gen status. An A/B-tested feature helps power users + hurts new users.

**Targeted intervention**: knowing who benefits most lets you target the intervention. Marketing applies discounts to "persuadables" rather than "sure-things" or "lost-causes."

**Hidden harm**: ATE = 0 might mean "no effect" or "helps half, hurts half." The latter is action-relevant.

**Policy refinement**: if a program works for some subgroups and not others, the program design can adjust.

## Meta-learners

Recipes that turn supervised ML algorithms into CATE estimators.

**S-learner (Single)**: train one model `μ(t, x) = E[Y | T = t, X = x]`. CATE: `μ̂(1, x) - μ̂(0, x)`.
- Pro: simple. Con: regularization can shrink CATE toward zero, especially when treatment is rare.

**T-learner (Two)**: train one model on treated, one on controls. CATE: `μ̂_1(x) - μ̂_0(x)`.
- Pro: each model unconstrained. Con: no shared structure.

**X-learner**: hybrid; impute missing potential outcomes; train second-stage on imputed effects.
- Pro: efficient when treatment is rare or treatment effect is small.

**R-learner**: Robinson decomposition; doubly-robust property.

The choice depends on data shape: treatment rare? treatment effect small? high-dimensional `X`? Each meta-learner has a regime where it dominates.

## Causal forests

Wager-Athey 2018 random-forest-style estimator for CATE.

**Key innovations**:

- Splits chosen to maximize HETEROGENEITY in treatment effects (not just predictive accuracy).
- Honest splits (sample-splitting): one half for split selection, the other for estimation. Gives valid asymptotic confidence intervals.
- Local CATE estimates with uncertainty.

**Why this matters**: causal forests give per-user CATE estimates with calibrated CIs. You can rank users by predicted effect, target the top-K, and report uncertainty on the targeting.

**Tooling**: `grf` (R), `econml.dml.CausalForestDML` (Python). Mature, well-documented, used in industry.

## Multiple-testing for HTE

If you slice the data into many segments and report per-segment CATE estimates, you'll find spurious "significant" segments by chance.

**Without correction**: false-discovery rate can be very high — most "significant" segments are noise.

**Bonferroni / Holm-Bonferroni**: conservative; controls FWER. Use for confirmatory.

**BH (Benjamini-Hochberg)**: controls FDR; more powerful than FWER methods. Use for screening.

**Pre-registration**: list segments + analysis plan BEFORE seeing the data. Eliminates p-hacking concerns.

The "we sliced 20 ways and 1 segment was significant" claim is a fishing expedition unless it's pre-specified.

## Uplift modeling

Production framing of HTE estimation, focused on the actionable quantity:

**Four user types** (relative to a binary treatment):

- **Persuadables**: would buy if treated; wouldn't if untreated. Targeting goal.
- **Sure-things**: buy regardless. Treatment wasted.
- **Lost-causes**: don't buy regardless. Treatment wasted.
- **Sleeping-dogs**: would buy untreated; wouldn't if treated. Treatment harms.

Uplift models estimate `τ(x)` and rank users; target top-N predicted persuadables.

**Eval metric**: Qini curve / cumulative gain — area under the curve when ranking by predicted uplift. Higher is better; pure-random targeting is the diagonal.

**Tools**: CausalML (Uber), EconML (Microsoft), pylift, CausalLift.

<!-- tier:grad -->
# Heterogeneous Treatment Effects (Grad)

## Identifiability

CATE identification under unconfoundedness:

`τ(x) = E[Y(1) - Y(0) | X = x] = E[Y | T = 1, X = x] - E[Y | T = 0, X = x]`

Same assumptions as ATE — but now they must hold conditionally.

Under unconfoundedness conditional on `X` (a stronger version of standard unconfoundedness), CATE is point-identified.

Bounds + sensitivity analysis for HTE under unconfoundedness violations: same toolkit as for ATE; applied conditionally.

## Causal forest details

**Splitting rule**: maximize estimated treatment-effect heterogeneity:
`split_score = #(left) · τ̂(left)² + #(right) · τ̂(right)²`

Equivalently, minimize within-group variance in CATE.

**Honest estimation** (Athey-Imbens 2016): split sample into "training" and "estimation" halves. Use training half to grow trees + select splits. Use estimation half to fill in leaf values + compute confidence intervals. Eliminates split-selection bias.

**Asymptotic normality**: under regularity, `√n (τ̂(x) - τ(x)) → N(0, σ²(x))`. Confidence intervals via the empirical sandwich.

**Limitations**: high-dimensional `X` requires very large `n`; the variance scales unfavorably with dimensionality. Also, the splits are still axis-aligned — not great for complex interactions.

## Double machine learning (DML)

Chernozhukov et al. 2018: estimate nuisance parameters (conditional means, propensity scores) with ML; use cross-fitting to avoid overfitting bias; combine via the doubly-robust score.

**For CATE estimation**: 

1. Estimate `m(x) = E[Y | X = x]` and `e(x) = P(T = 1 | X = x)` via ML on cross-fits.
2. Compute residuals: `Ỹ = Y - m̂(X)`, `T̃ = T - ê(X)`.
3. Estimate `τ(x)` by regressing `Ỹ` on `T̃ · g(x)` for a basis `g`.

Result: valid inference even with high-dimensional `X`, ML nuisance estimators, and complex `τ(·)`.

Implementation: `econml.dml.LinearDML`, `econml.dml.CausalForestDML`, `DoubleML` (R/Python).

## Personalization vs prediction

CATE estimation is not the same as predicting `Y`. A model that predicts `Y` well might predict `τ` poorly:

- `Y` prediction: `E[Y | X]`. Includes baseline + treatment effect.
- `τ` prediction: `E[Y(1) - Y(0) | X]`. Just the differential.

Most ML algorithms optimize for the former; meta-learners + causal forests are designed for the latter.

**Practical implication**: don't use a "good predictor of `Y`" as a "good estimator of `τ`". The objectives differ.

## Targeted policies

The policy-evaluation problem: given an estimated `τ̂(x)`, what's the optimal treatment rule?

- **Threshold rules**: treat if `τ̂(x) > c` for some cost-benefit threshold.
- **Personalized rules**: treat user-specific based on `τ̂(x)`.
- **Constrained rules**: treat top-K to satisfy budget; treat fairly across protected groups.

**Off-policy evaluation**: estimate the value of a policy from logged data. Direct method, IPW, doubly-robust. Connects to RL literature.

## Connection to RL + bandit problems

HTE and contextual bandits are deeply related:

- A contextual bandit chooses actions to maximize reward.
- The optimal action at context `x` depends on the CATE of each action.
- Off-policy bandit evaluation is doubly-robust HTE estimation.

Modern reinforcement-learning theory (especially off-policy + offline RL) leans on causal-inference machinery.

## References

- Wager & Athey 2018. Estimation and inference of heterogeneous treatment effects using random forests. *JASA*.
- Künzel, Sekhon, Bickel, Yu 2019. Metalearners for estimating heterogeneous treatment effects using machine learning. *PNAS*.
- Nie & Wager 2021. Quasi-oracle estimation of heterogeneous treatment effects. *Biometrika*.
- Chernozhukov et al. 2018. Double/debiased machine learning. *Econometrics J.*
- Athey & Imbens 2019. Machine learning methods for estimating heterogeneous causal effects. *Annu. Rev. Econ.*
