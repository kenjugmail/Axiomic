---
title: RCT Design
category: causal
---
<!-- tier:intro -->
# RCT Design

A **randomized controlled trial (RCT)** randomizes treatment assignment, breaking the dependence between treatment and any potential confounder.

Why RCTs are the gold standard:

- **Observed and unobserved confounders**: handled by construction. Randomization is independent of all variables.
- **Selection bias**: handled (assignment is random).
- **No need for a DAG or adjustment set**: the simplicity of the analysis is the simplicity of the design.

The cost: you need to be able to randomize. Many causal questions can't be answered this way (ethical, logistical, cost reasons).

When you can run an RCT, do. When you can't, the rest of the causality path applies.

<!-- tier:undergrad -->
# RCT Design (Undergrad)

## Anatomy of an RCT

1. **Define the population**. Who's eligible? Inclusion / exclusion criteria.
2. **Define the treatment**. Specifically what intervention; specifically when.
3. **Define the outcome**. Primary endpoint; secondary endpoints.
4. **Power analysis**. Compute required sample size for a given MDE + α.
5. **Randomize**. Allocate units to treatment or control.
6. **Apply treatment**. To the treatment group only.
7. **Measure outcomes**. Same way for both groups.
8. **Analyze**. Difference in means (or ITT analysis); confidence intervals; significance test.

The sequencing matters: pre-specify power, primary outcome, randomization, and analysis BEFORE collecting data. Post-hoc decisions invalidate the math.

## Randomization schemes

**Simple randomization**: each unit independently flipped a coin. Simplest; can produce imbalanced groups by chance.

**Block randomization**: units assigned in blocks (e.g., 4 at a time, 2 to each arm). Guarantees balance at the block level.

**Stratified randomization**: stratify on covariates that strongly predict the outcome (e.g., baseline severity); randomize within each stratum. Reduces variance.

**Cluster randomization**: randomize at the cluster level (school, hospital, region) rather than individual level. Used when individual randomization isn't feasible (network effects, contamination).

**Crossover designs**: each unit experiences both treatment and control in different time periods. Tightens within-unit comparison; introduces sequence-effect concerns.

## Threats to RCT validity

**Differential attrition**: treatment causes some units to drop out (e.g., side effects). Remaining sample is biased.

**Crossover / non-compliance**: units assigned to treatment don't take it; units in control take it anyway. Biases the per-protocol comparison.

**Network effects (SUTVA violation)**: my treatment affects your outcome (social experiments).

**Hawthorne effect**: being observed changes behavior, regardless of treatment.

**Implementation drift**: treatment fidelity varies across sites or over time.

These threats convert a clean RCT into a quasi-experiment. ITT (intent-to-treat) analysis treats everyone according to assigned arm — preserves randomization but estimates the ITT effect, not the per-protocol effect.

## Production A/B tests

A clean A/B test is an RCT. The same design principles apply:

- Pre-register hypotheses + primary metric.
- Power-analyze to determine sample size.
- Randomize at the right unit (user, session, request — depends on the question).
- Use sequential testing or fixed-horizon, not naive peeking.
- Apply multiple-testing correction for secondary metrics.
- Report ITT analysis; don't drop users who didn't engage.

Most production A/B-test failures are violations of these principles, not statistical-method choice.

<!-- tier:grad -->
# RCT Design (Grad)

## Power analysis details

Power = `P(reject H₀ | H_a is true)`. Depends on:

- Effect size (the MDE).
- Sample size per arm.
- Significance level α.
- Outcome variance.
- Test type (one-sided / two-sided; chosen test).

For a two-sample t-test on means with equal variance:
`n_per_arm = 2 σ² (z_{α/2} + z_β)² / Δ²`

where Δ is the MDE. In practice, use `power.t.test` (R) or `statsmodels.stats.power` (Python). For non-Gaussian outcomes, use simulation.

## Variance reduction techniques

Beyond increasing `n`, reduce `σ`:

- **Stratification**: balance on strong predictors of the outcome.
- **Covariate adjustment in analysis (ANCOVA)**: regress on baseline covariates as well as treatment.
- **CUPED** (Microsoft 2013): use pre-treatment data on the same metric to subtract baseline variance. Standard in production A/B testing.
- **Repeated measures**: each unit measured multiple times; use within-unit variance reduction.

These can reduce variance 30-70%; equivalent to a 30-70% sample-size reduction.

## Adaptive designs

**Group sequential**: pre-specified interim looks with adjusted significance boundaries (O'Brien-Fleming, Pocock). Allows early stopping for efficacy or futility while controlling Type I error.

**Always-valid inference** (mSPRT, AVCI): p-values valid at any stopping time. Allows continuous monitoring.

**Adaptive randomization**: probability of treatment changes based on observed responses. Multi-armed bandit hybrids.

**Dose-finding designs** (Bayesian CRM, BOIN): adaptive allocation across dose levels.

These designs trade complexity for efficiency. They've largely replaced fixed-horizon tests in industry A/B platforms.

## Cluster-randomized trials

When randomization must happen at the cluster level (schools, hospitals, geographic units):

- **Design effect**: variance is inflated by `1 + (m - 1)ρ` where `m` is cluster size and `ρ` is intraclass correlation.
- **Sample size**: needs to be larger than individual-randomization, by the design effect.
- **Analysis**: must account for clustering (mixed-effects models, GEE, cluster-robust standard errors).

## Encouragement designs

When mandating treatment is unethical or impractical, randomize encouragement to take treatment, with non-mandatory compliance. The encouragement is the IV; actual treatment is endogenous. Estimates LATE for compliers via 2SLS.

Used in education (random invitations to programs), healthcare (random reminder letters), economics (random lottery for benefit eligibility).

## Stepped-wedge designs

Cluster-level interventions rolled out over time, with all clusters eventually treated. Each cluster contributes pre-post data; staggered rollout enables identification of treatment effect separately from time trend.

Useful when withholding treatment permanently is unacceptable. Analysis: mixed-effects model with cluster + time + treatment effects.

## References

- Imbens & Rubin 2015. *Causal Inference for Statistics, Social, and Biomedical Sciences*. Chs. 4-6 on RCT design + analysis.
- Friedman, Furberg, DeMets 2015. *Fundamentals of Clinical Trials*. Bedrock textbook.
- Hemming et al. 2015. The stepped wedge cluster randomised trial. *BMJ*.
- Deng et al. 2013. CUPED variance reduction. *KDD*.
- Howard et al. 2021. Time-uniform confidence sequences. *Annals of Statistics*.
