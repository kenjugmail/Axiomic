---
title: Exclusion Restriction
category: causal
---
<!-- tier:intro -->
# Exclusion Restriction

The most contested IV assumption: the instrument `Z` affects the outcome `Y` ONLY through the treatment `T`. No direct path; no path through unobserved confounders.

Formally: `Y(t, z) = Y(t)` for all `t, z`. The instrument's value doesn't matter once we know the treatment.

The exclusion restriction is **untestable from data alone**. It's a structural assumption defended by domain knowledge, not statistical tests.

When it fails (even mildly), IV estimates can be more biased than OLS — especially with weak instruments.

<!-- tier:undergrad -->
# Exclusion Restriction (Undergrad)

## Why it can't be tested

The exclusion restriction is about the absence of a causal path — `Z` doesn't affect `Y` except through `T`.

You can't test "no direct effect" from data because:

- Any direct effect of `Z` on `Y` is conflated with `Z`'s indirect effect through `T`.
- The data shows `Z` and `Y` are associated; the question is whether the association runs through `T` only.

The defense must come from:

- **Source of variation**: if `Z` is randomized, exogeneity is by construction (the lottery example).
- **Domain knowledge**: institutional / biological / historical reasons why `Z` plausibly only affects `Y` through `T`.
- **Falsification tests**: check if `Z` predicts placebo outcomes that shouldn't be affected by `T`. If yes, suspect direct effects.

## Famous cases + their critiques

**Vietnam draft lottery**: birth dates randomly assigned. Random with respect to anything in 1969. Exclusion: lottery affects earnings only through service. Strong defense — almost no plausible alternative path.

**Quarter of birth (Angrist-Krueger)**: birth quarter affects schooling via compulsory-attendance laws. Exclusion: birth quarter affects earnings only through schooling. Critiques: birth quarter correlates with parental SES, school cohort effects, parental seasonality of family planning. The defense relies on these effects being small.

**Distance to college**: predicts college attendance. Exclusion: distance affects earnings only through college. Critiques: distance correlates with rural-vs-urban, parental income, area characteristics. The defense relies on these being absorbed by covariates.

**Rainfall as IV for crop yield**: predicts yield. Exclusion: weather affects food prices, which affect outcomes. Plausibility depends on which outcome (clearly violated for income; less so for biological outcomes).

**Settler mortality (Acemoglu-Johnson-Robinson)**: 19th-century settler mortality predicts modern institutions. Exclusion: mortality rates affect modern income only through institutional persistence. Heavily contested — disease environments persist, affecting modern productivity directly.

## Falsification tests

You can sometimes provide partial evidence:

**Pre-treatment placebo**: if `Z` is plausibly random with respect to outcomes, it shouldn't predict outcomes that occurred BEFORE treatment was assigned. Check.

**Outcomes unrelated to treatment**: if `Z` is exogenous, it shouldn't predict outcomes unrelated to the treatment of interest. E.g., draft lottery shouldn't predict pre-1965 earnings.

**Subgroup heterogeneity**: if `Z` exogenously affects only certain subgroups, the estimated effect should be larger in those groups (homogeneity of the `Z`-`Y` relationship across populations is a sign of direct effects).

These don't prove the exclusion restriction; they fail to disprove it.

## When the assumption breaks

Suppose `Z` has a small direct effect `δ` on `Y`. The IV estimate is approximately:

`θ̂_IV ≈ θ_true + δ / (β · π_compliers)`

where `β` is the first-stage strength and `π_compliers` is the fraction of compliers.

The bias scales:

- Inversely with first-stage strength: weak instruments amplify the bias.
- Inversely with complier fraction: small complier shares amplify the bias.
- Linearly with the violation: small violations give small bias if the first stage is strong.

This is why **strong instruments are robust to small exogeneity violations**. The Vietnam lottery is robust because the first stage is strong + plausibly small violations. Quarter of birth is fragile because the first stage is weak + violations possibly larger.

<!-- tier:grad -->
# Exclusion Restriction (Grad)

## Sensitivity analysis

When the exclusion restriction is contested, sensitivity analysis quantifies how strong a violation would need to be to overturn the conclusion.

**Conley-Hansen-Rossi (2012) plausibly exogenous bounds**: assume `δ` lies in a range; report 2SLS estimates assuming `δ = 0`, `δ ∈ [δ_low, δ_high]`. Wider bounds = more honest reporting.

**Kraay (2012)**: relax the exclusion restriction; estimate the effect under the assumption that direct effects are small relative to the indirect effect.

These are increasingly standard in IV papers — the assumption is acknowledged + bounded rather than assumed away.

## Multiple instruments + overidentification

With multiple instruments, the **Sargan / Hansen J-test** tests whether they all give consistent estimates. If they don't, at least one violates exogeneity.

The test has limited power against violations that affect all instruments similarly. So passing the test isn't conclusive evidence of exogeneity; failing is suggestive of trouble.

Modern practice: report J-test alongside IV estimates; investigate when it fails; consider dropping suspect instruments.

## MR-Egger + pleiotropy

In Mendelian randomization (genetic-variant IVs), pleiotropy is the analogue of exclusion-restriction violation: a genetic variant affects the outcome through multiple paths, not just the trait of interest.

**MR-Egger** (Bowden et al. 2015): regression-based test for pleiotropy + bias correction. The intercept of MR-Egger is non-zero if there's directional pleiotropy.

**MR-PRESSO** (Verbanck et al. 2018): outlier detection for pleiotropic variants.

These tools are increasingly standard in MR; pure 2SLS without pleiotropy diagnostics is now considered insufficient.

## Continuous instruments

For continuous `Z`, the exclusion restriction is: `∂Y/∂Z = 0` holding `T` fixed. Same conceptual content; the math just generalizes.

**LATE generalization**: marginal treatment effects (MTE), identified by variation in instrument values. Heckman-Vytlacil framework.

## Connection to monotonicity

The IV identifying assumptions are:

1. Relevance.
2. Exclusion restriction.
3. Monotonicity (no defiers — assumption that `Z` affects `T` in only one direction).

Without monotonicity, `θ̂_IV` doesn't equal LATE; it's a weighted combination of compliers' and defiers' effects.

In most settings, monotonicity is plausible (encouragement + non-coercive instruments tend to push toward treatment). It can fail in adversarial / strategic settings.

## Pre-registration of IV strategy

The credibility of an IV analysis depends on whether the instrument was chosen before looking at outcome data. Post-hoc choice of instrument from many candidates is a form of p-hacking.

Modern best practice: pre-register the instrument + first stage + reduced form before the analysis. Pre-registration platforms (AEA Registry, OSF) document the timing.

## References

- Bound, Jaeger, Baker 1995. Problems with instrumental variables estimation. *JASA*.
- Conley, Hansen, Rossi 2012. Plausibly exogenous. *Review of Economics and Statistics*.
- Bowden, Davey Smith, Burgess 2015. Mendelian randomization with invalid instruments: effect estimation and bias detection through Egger regression. *Int. J. Epidemiology*.
- Pearl 2009. *Causality* §7.4 (exogeneity and confounding).
- Angrist & Pischke 2009. *Mostly Harmless Econometrics*. Discussion of exclusion-restriction critiques.
