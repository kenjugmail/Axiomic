---
title: Instrumental Variable
category: causal
---
<!-- tier:intro -->
# Instrumental Variable

A variable `Z` that helps identify a causal effect of treatment `T` on outcome `Y` even when there are unobserved confounders.

`Z` qualifies as an IV if:

1. **Relevance**: `Z` affects `T`. Cov(`Z`, `T`) ≠ 0.
2. **Exogeneity (exclusion restriction)**: `Z` affects `Y` ONLY through `T`. No direct path; no path through unobserved confounders.

If both hold, you can identify the **Local Average Treatment Effect (LATE)** — the effect among compliers (units whose treatment status responds to `Z`).

The classical estimator is **two-stage least squares (2SLS)**.

<!-- tier:undergrad -->
# Instrumental Variable (Undergrad)

## Why IV exists

When `T` is endogenous (depends on unobserved factors that also affect `Y`), naive comparison of `Y` across `T` levels is confounded. Adjustment can't fix this if the confounders are unobserved.

IV gets around this by finding a variable `Z` whose variation:

- Drives variation in `T` (relevance).
- Doesn't directly affect `Y` (exogeneity).

The variation in `T` driven by `Z` is "as-if random" with respect to `Y` — it's free of unobserved confounding. So we can estimate the causal effect of `T` on `Y` using only the `Z`-driven variation.

## Two-stage least squares

The classical estimator:

**Stage 1**: regress `T` on `Z` (and any covariates `X`):
`T = α + β · Z + γ · X + ε₁`. Get predicted `T̂`.

**Stage 2**: regress `Y` on `T̂` (and `X`):
`Y = δ + θ · T̂ + φ · X + ε₂`. The coefficient `θ` is the IV estimate.

`T̂` is the part of `T` driven by `Z` — uncorrelated with the unobserved confounders. Regressing `Y` on `T̂` estimates the causal effect free from confounding bias.

**Implementation**: `ivreg` (R), `IV2SLS` (Python statsmodels), `ivregress` (Stata). All compute correct standard errors.

## Diagnostics

**First-stage F-statistic**: tests instrument relevance. Rule of thumb: `F > 10` for one instrument; `F > 20-30` for multiple. Below 10 → weak instrument; estimates may be more biased than OLS.

**Sargan / Hansen J-test**: tests overidentification when you have more instruments than endogenous variables. Doesn't test exogeneity directly but provides a sanity check: if multiple instruments give very different estimates, suspect at least one fails exogeneity.

**Reduced form**: `Y = α' + β' · Z + γ' · X + ε'`. Should show a significant coefficient on `Z` if both relevance + exogeneity hold. If reduced form is weak, IV will be weaker.

## The exclusion restriction is hard

Exogeneity isn't testable from data alone. It requires an argument from context:

- **Vietnam draft lottery**: birth dates random; lottery outcomes random. Hard to argue lottery affects future earnings except through service. Strong defense.
- **Quarter of birth**: predicts schooling via compulsory-attendance laws. Could it affect earnings directly? Maybe (parental SES, school cohort). Contested.
- **Distance to college**: predicts attendance. Could it affect earnings directly? Probably yes (rural vs urban differences). Contested.
- **Settler mortality**: predicts modern institutions. Direct effect on modern income? Disease environments persist. Heavily contested.

The strongest IVs come from genuine randomization (lotteries, weather, A/B-tested encouragement). Always-defensible exogeneity is rare.

## What IV identifies: LATE

Without homogeneous treatment effects, IV doesn't estimate the ATE. It estimates **LATE** — the effect on **compliers**.

Imbens-Angrist (1994) classification (relative to a binary instrument):

- **Always-takers**: always treated regardless of `Z`.
- **Never-takers**: never treated regardless of `Z`.
- **Compliers**: treated when `Z = 1`, untreated when `Z = 0`.
- **Defiers**: opposite of compliers (usually assumed zero — monotonicity).

IV estimates the average treatment effect among compliers. The compliers are the policy-relevant subpopulation when the policy works similarly to the instrument; they're not always representative of the whole population.

Reporting practice: name the LATE explicitly. "The IV estimate is the LATE for compliers."

<!-- tier:grad -->
# Instrumental Variable (Grad)

## Weak instruments + bias

Bound, Jaeger, Baker (1995) showed that weak instruments amplify bias from any small exogeneity violation:

- **Strong IV (high F)**: 2SLS bias is small even with mild exogeneity violations.
- **Weak IV (low F)**: 2SLS bias can EXCEED OLS bias even with tiny exogeneity violations.

So weak instruments aren't just imprecise — they can be actively misleading. If F < 10, treat the IV estimate with skepticism; consider alternatives (RDD, DiD, partial identification with bounds).

## Inference under weak instruments

Under weak instruments, the 2SLS estimator's distribution isn't normal even asymptotically. Use:

- **Anderson-Rubin (AR) test**: weak-instrument-robust inference. Constructs confidence intervals by inverting a test that's valid under any instrument strength.
- **Conditional likelihood-ratio (CLR) test** (Moreira 2003): another weak-instrument-robust approach.

These are implemented in `ivmodel` (R) and `linearmodels` (Python).

## Many weak instruments

Recent work on settings with many instruments (genome-wide variants in Mendelian randomization; many possible policy instruments). Standard 2SLS biased; alternatives:

- **JIVE** (Angrist, Imbens, Krueger): leave-one-out 2SLS.
- **LIML**: limited-information maximum likelihood; less biased than 2SLS with many instruments.
- **Many-IV-robust methods** (Hansen, Hausman, Newey).

## Continuous + multivalued treatments

Classical IV is binary T. Continuous treatment IV requires more structure:

- **2SLS with continuous T**: still works; IV estimates the linear effect under linearity.
- **Marginal Treatment Effect (MTE)** (Heckman, Vytlacil): a richer object than LATE, identifying the effect at every margin of treatment.
- **Local IV (LIV)**: variation across instruments to estimate MTE.

## Bayesian IV

Bayesian formulations of IV use priors on:

- The first-stage coefficient (instrument strength).
- The exclusion-restriction violation (allow some direct effect with a prior on its magnitude).
- The treatment effect heterogeneity.

Sensitivity analysis under these priors shows how robust the IV conclusion is to plausible exogeneity violations.

## Mendelian randomization

Genetic variants as IVs. Key insight: variants are randomly assigned at conception; if a variant predicts a phenotype, the variant is an IV for the phenotype's effect on health outcomes.

- **Standard MR**: 2SLS with one variant.
- **Multi-variant MR**: many genetic variants as instruments; IVW (inverse-variance weighting), MR-Egger, MR-PRESSO.
- **Pleiotropy concerns**: variants affecting outcomes through multiple paths violate exogeneity. Modern MR methods estimate + adjust for pleiotropy.

Used heavily in epidemiology + genomics.

## References

- Imbens & Angrist 1994. Identification and estimation of LATE. *Econometrica*.
- Bound, Jaeger, Baker 1995. Problems with instrumental variables estimation. *JASA*.
- Angrist & Krueger 2001. Instrumental variables and the search for identification. *J. Econ. Perspectives*.
- Stock & Yogo 2005. Testing for weak instruments in linear IV regression.
- Davey Smith & Hemani 2014. Mendelian randomization: genetic anchors for causal inference. *Hum. Mol. Genet.*
