---
title: Two-Stage Least Squares
category: causal
---
<!-- tier:intro -->
# Two-Stage Least Squares (2SLS)

The classical estimator for instrumental variable analysis.

**Stage 1**: regress endogenous treatment `T` on the instrument `Z` (and any covariates `X`):
`T = α + β · Z + γ · X + ε₁`

Get fitted values `T̂`.

**Stage 2**: regress outcome `Y` on `T̂` (and `X`):
`Y = δ + θ · T̂ + φ · X + ε₂`

The coefficient `θ` is the IV estimate of the causal effect.

`T̂` is the part of `T` driven by `Z`. Under exogeneity, this part is uncorrelated with the unobserved `T-Y` confounder. So regressing `Y` on `T̂` estimates the causal effect free of the confounding bias.

<!-- tier:undergrad -->
# Two-Stage Least Squares (Undergrad)

## Why it works

Imagine `T` has two parts: a part driven by `Z` (the instrument) and a part driven by everything else (including unobserved confounders).

`T = β · Z + (other stuff including U)`

If exogeneity holds, `Z` is uncorrelated with `U`. So the `β · Z` part is uncorrelated with `U`.

Stage 1's `T̂` is the predicted-from-`Z` part of `T`. By construction, it's uncorrelated with `U`. So regressing `Y` on `T̂` estimates the causal effect of `T` on `Y` without confounding.

## The math

Let `n` be sample size, `T` the (n × 1) treatment vector, `Z` the (n × k) instrument matrix, `X` the covariate matrix, `Y` the outcome.

Stage 1 OLS:
`β̂ = (Z'Z)⁻¹ Z'T`
`T̂ = Z β̂`

Stage 2 OLS (here just on `T̂`, ignoring `X` for simplicity):
`θ̂ = (T̂'T̂)⁻¹ T̂'Y`

Substituting:
`θ̂ = (Z'T)⁻¹ Z'Y`

For a single binary instrument, this simplifies to **Wald's estimator**:
`θ̂ = (Y_{Z=1} - Y_{Z=0}) / (T_{Z=1} - T_{Z=0})`

Numerator: reduced-form effect of `Z` on `Y`. Denominator: first-stage effect of `Z` on `T`. The ratio: causal effect of `T` on `Y` for compliers.

## Standard errors

Naive OLS standard errors on Stage 2 are WRONG — they don't account for `T̂` being a generated regressor.

Correct standard errors: use the IV-aware formulae built into `ivreg` (R), `IV2SLS` (Python statsmodels), `ivregress` (Stata). All of these handle the generated-regressor adjustment automatically.

For modern practice, use **robust standard errors** (Eicker-Huber-White) or **cluster-robust** when applicable. The default IV procedures all support these.

## Diagnostics

**First-stage F**: the F-statistic from Stage 1's regression of `T` on `Z` alone (excluding covariates). Tests whether `Z` significantly predicts `T`. Stock-Yogo critical values: `F > 10` for one instrument, larger for many.

**Reduced-form coefficient**: regress `Y` directly on `Z` (and `X`). If this is weak, the IV estimate will be weak.

**Sargan / Hansen J-test**: with multiple instruments (overidentification), tests whether they all give consistent estimates. Failure is a red flag for at least one violation of exogeneity.

**Hausman test**: compares OLS and 2SLS. Significant difference suggests endogeneity is real (and IV is needed).

## Worked example

Card 1995 returns to schooling:
- `Y` = log earnings.
- `T` = years of schooling.
- `Z` = "lived near a 4-year college at age 14" (proximity affects college attendance; arguably doesn't directly affect earnings).
- `X` = age, race, region, parental education.

Stage 1: years of schooling regressed on the proximity dummy + `X`. F-statistic ~30 (strong first stage).

Stage 2: log earnings regressed on predicted schooling + `X`.

OLS estimate of the schooling-earnings coefficient: ~0.07 (each year of schooling increases earnings 7%).

IV estimate: ~0.13 (each year increases earnings 13%, considerably larger).

Interpretation: OLS biased downward by ability bias (more able people get more schooling AND have higher earnings). IV corrects for this. The 13% is the LATE for compliers — kids whose schooling decisions were affected by college proximity.

<!-- tier:grad -->
# Two-Stage Least Squares (Grad)

## Asymptotic properties

Under standard regularity conditions + strong instruments:

- 2SLS is consistent: `θ̂ → θ` as `n → ∞`.
- Asymptotically normal: `√n(θ̂ - θ) → N(0, Σ)` for some variance `Σ`.
- Standard errors as in `ivreg`/`IV2SLS`/`ivregress`.

Under weak instruments, the asymptotic distribution isn't normal — heavy tails, bias toward OLS. Inference under weak instruments needs Anderson-Rubin or CLR tests.

## Just-identified vs over-identified

**Just-identified**: number of instruments equals number of endogenous variables. 2SLS is the unique solution.

**Over-identified**: more instruments than endogenous variables. Multiple ways to combine instruments. 2SLS = OLS on stage-1 fitted values; alternatives include LIML, GMM.

LIML is sometimes preferred over 2SLS in over-identified settings — less biased with many weak instruments (though larger variance).

## GMM and 2SLS

Generalized Method of Moments (GMM) generalizes 2SLS:

- 2SLS = GMM with a particular weighting matrix.
- Optimal GMM (using the inverse of the moment-condition variance as the weighting matrix) is asymptotically more efficient than 2SLS.
- For just-identified models, GMM = 2SLS.

For complex IV problems with many instruments + heteroskedasticity, GMM gives better-behaved estimates than 2SLS.

## Many-weak-instruments

When you have many instruments, each weak, 2SLS bias accumulates. Estimators:

- **JIVE** (Jackknife IV): leave-one-out fits to avoid using each unit's own data in its first-stage prediction. Reduces small-sample bias.
- **LIML**: less bias than 2SLS with many instruments; theoretical properties analyzed by Hahn-Hausman, Bekker.
- **Hansen-Hausman-Newey JIVE2**: refinement.

These are common in Mendelian randomization (many SNPs as IVs for a phenotype).

## Continuous + non-linear IV

2SLS as described handles linear models. Extensions:

- **Probit IV / logit IV**: when outcome is binary; use control-function approach.
- **Quantile IV**: estimate effects on quantiles of `Y` via conditional-quantile-of-`T` instrumental approach.
- **Nonparametric IV**: estimate `E[Y | do(T = t)]` flexibly via integral equation; technical, see Newey-Powell 2003.
- **Deep IV** (Hartford et al. 2017): neural-network-based IV. First stage estimates `P(T | Z)`; second stage estimates `E[Y | T̂]`. Handles high-dimensional `X`.

## Doubly-robust IV / DML

Chernozhukov et al. 2018 develop **double / debiased ML** for IV settings. Key idea: use ML for nuisance parameters (`E[T | Z, X]`, `E[Y | Z, X]`); cross-fit to avoid overfitting bias; use the doubly-robust score.

Result: valid inference even when first-stage regressions involve high-dimensional `X` and use ML methods. Available in EconML.

## Connection to causal forests

Causal forests for IV settings (Athey-Tibshirani-Wager 2019) extend the 2SLS framework to estimate heterogeneous treatment effects identified by an instrument. Estimates LATE as a function of `X` rather than just an average.

Production tooling: `econml.iv` modules.

## References

- Wright 1928 (in *The Tariff on Animal and Vegetable Oils*). Earliest IV use.
- Theil 1953. Repeated least squares applied to complete equation systems.
- Stock & Yogo 2005. Testing for weak instruments. *Identification and Inference for Econometric Models*.
- Chernozhukov et al. 2018. Double/debiased machine learning. *Econometrics J.*
- Hartford et al. 2017. Deep IV. *ICML*.
