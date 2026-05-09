---
title: Regression Discontinuity
category: causal
---
<!-- tier:intro -->
# Regression Discontinuity (RDD)

A causal-identification design exploiting a **sharp threshold** in treatment assignment.

When treatment is determined by whether a continuous variable crosses a cutoff (e.g., test score ≥ 80 → scholarship), units just above and just below the cutoff are nearly identical except in treatment status. Comparing their outcomes estimates the local causal effect.

Two flavors:

- **Sharp RDD**: treatment is deterministic at the cutoff (≥80 → treated; <80 → not treated).
- **Fuzzy RDD**: probability of treatment jumps at the cutoff but isn't deterministic. Requires IV-style adjustment.

RDD gives credible local causal estimates even with selection on the running variable.

<!-- tier:undergrad -->
# Regression Discontinuity (Undergrad)

## The intuition

Imagine a scholarship awarded to students with test scores ≥ 80. Comparing all scholarship recipients to non-recipients is confounded — recipients are higher-scoring, more capable, etc.

But comparing students who scored 79 vs 81 is much cleaner. They're nearly indistinguishable in ability; the only difference is one got the scholarship and one didn't. The local difference in their outcomes estimates the local causal effect of the scholarship.

The bandwidth question: how close to the cutoff do you compare?
- Wider bandwidth → more data → less variance, but more bias (units differ more in non-treatment ways).
- Narrower bandwidth → less data → more variance, less bias.

Modern RDD uses **optimal bandwidth selection** (Imbens-Kalyanaraman, Calonico-Cattaneo-Titiunik) plus **local linear regression** to balance the trade-off.

## Identification assumption

**Continuity**: at the cutoff, all OTHER variables (potential outcomes, covariates) are continuous.

In particular: there's no other treatment that ALSO changes at exactly the same threshold. If two interventions both kick in at score = 80, RDD can't separate them.

**Defending continuity**: argue that no other policy or natural process changes at exactly the same point. Often plausible for arbitrary administrative thresholds (income limits, scholarship cutoffs, election margins). Less plausible when thresholds align with biology / development (age cutoffs near major life transitions).

## Sharp RDD analysis

For sharp RDD with running variable `R`, treatment `T = 1{R ≥ c}` (where `c` is the cutoff):

1. Restrict to a bandwidth `[c - h, c + h]`.
2. Fit local linear regressions on each side: `Y = α + β · R + ε` for `R ≥ c`, separately for `R < c`.
3. The estimate at the cutoff: `α_above - α_below`. This is the local treatment effect.

Standard errors via the bandwidth's effective sample size; common to use robust standard errors.

**`rdrobust`** (R + Stata + Python): the canonical implementation. Reports point estimates, robust standard errors, optimal bandwidth, plots.

## Fuzzy RDD

When the threshold doesn't deterministically assign treatment but causes a discontinuity in the probability of treatment, use IV-style adjustment:

- The threshold is the IV.
- Treatment is endogenous (some units near cutoff are treated, some aren't).
- 2SLS with the threshold as instrument estimates LATE.

Example: school assignment. Students above a test cutoff are GIVEN PRIORITY for a magnet school but can decline. The threshold creates a probabilistic treatment shift. Fuzzy RDD estimates the effect on compliers (kids who attend if and only if they're above the cutoff).

## Threats to RDD

**Manipulation around the cutoff**: if units can manipulate their running variable (e.g., students retake exams to crack 80), bunching just above the cutoff appears. McCrary's (2008) density test detects bunching.

**Other discontinuities at the cutoff**: covariates that also jump at `c` indicate that the threshold isn't isolated. Test by running RDD on covariates as outcomes; should find no jumps.

**Bandwidth sensitivity**: results that change dramatically with bandwidth choice are a red flag.

These are testable. Strong RDD papers run all the diagnostics.

<!-- tier:grad -->
# Regression Discontinuity (Grad)

## Optimal bandwidth selection

The Imbens-Kalyanaraman (IK) optimal bandwidth minimizes asymptotic mean squared error of the local-linear estimator. Calonico-Cattaneo-Titiunik (CCT) refined this with bias-corrected estimators and robust standard errors.

Modern practice: report estimates at IK or CCT optimal bandwidth + sensitivity at adjacent bandwidths. If the qualitative conclusion changes across reasonable bandwidths, the result is fragile.

## Continuity-based vs local randomization frameworks

Two ways to think about RDD:

**Continuity-based** (Hahn, Todd, van der Klaauw 2001): assume potential outcome functions are continuous in `R` at the cutoff. Estimator is the difference between left and right limits.

**Local randomization** (Cattaneo, Frandsen, Titiunik 2015): assume in some neighborhood of the cutoff, treatment assignment is as good as random conditional on `R`. Use difference-in-means in the neighborhood.

Both yield similar estimates when the methods agree. Local-randomization is more common when the running variable is discrete with limited values near the cutoff.

## Density manipulation

McCrary (2008) test: estimate the density of `R` near the cutoff. If there's a discontinuous jump in density, manipulation is suspected.

If manipulation is detected:

- Estimates of treatment effects are biased.
- Sometimes possible to bound the bias.
- Sometimes RDD is invalid; use a different design.

Common in tax-policy data: agents bunch at thresholds for tax brackets, scholarship eligibility, etc.

## Multiple cutoffs / multi-score RDD

When there are multiple running variables (e.g., GPA AND test score, both must exceed thresholds), the "boundary" is a curve in 2D space, not a point. Methods:

- **Frontier RDD**: estimate effect along the frontier; report average effect.
- **Multi-score RDD**: separate RDD for each running variable.
- **Geographic RDD**: treats spatial discontinuities (border between treated / untreated regions).

## Fuzzy RDD as IV

In fuzzy RDD, the cutoff is an instrument for treatment:

- First stage: `T = α + β · 1{R ≥ c} + γ · R + ε` (probability of treatment as function of cutoff dummy).
- Reduced form: `Y = α' + β' · 1{R ≥ c} + γ' · R + ε'` (outcome as function of cutoff dummy).
- LATE estimate: `β' / β`.

Standard errors via 2SLS. Identifies LATE for compliers — units near the cutoff whose treatment status responds to the cutoff.

## Connection to ML

RDD-style identification in ML systems:

- **Threshold-based deployment decisions**: a model assigns scores; users above a threshold get treatment X. The threshold is the basis for an RDD analysis of treatment effect.
- **A/B test rollout thresholds**: gradual rollout based on score / cohort can create natural RDD windows.

These are underused in production ML. The threshold is sitting there; the analysis is straightforward; few teams run it.

## References

- Hahn, Todd, van der Klaauw 2001. Identification and estimation of treatment effects with a regression-discontinuity design. *Econometrica*.
- Imbens & Kalyanaraman 2012. Optimal bandwidth choice for the regression discontinuity estimator. *RES*.
- Calonico, Cattaneo, Titiunik 2014. Robust nonparametric confidence intervals for regression-discontinuity designs. *Econometrica*.
- McCrary 2008. Manipulation of the running variable in the regression discontinuity design: a density test. *J. Econometrics*.
- Cattaneo, Idrobo, Titiunik 2019. *A Practical Introduction to Regression Discontinuity Designs*.
