---
title: Mediation Assumptions
category: causal
---
<!-- tier:intro -->
# Mediation Assumptions

The four assumptions required to identify natural direct + indirect effects from observational data:

1. **No unobserved `T-Y` confounders** (standard for any causal estimate).
2. **No unobserved `T-M` confounders** (the same, applied to the `T → M` path).
3. **No unobserved `M-Y` confounders** (often the breakdown — even RCTs randomize `T`, not `M`).
4. **No `T`-induced `M-Y` confounder** (Avin-Shpitser-Pearl 2005). If `T` causes a confounder of `M` and `Y`, natural effects fail to identify.

The third assumption is what makes mediation harder than total-effect estimation. Even an RCT can't license unbiased mediation analysis.

<!-- tier:undergrad -->
# Mediation Assumptions (Undergrad)

## The four conditions in detail

**1. T-Y unconfoundedness** (`Y(t, m) ⊥ T | X` for all `t, m`):
Given observed `X`, treatment is as good as random with respect to potential outcomes. Standard for any causal estimate.

**2. T-M unconfoundedness** (`M(t) ⊥ T | X` for all `t`):
Given observed `X`, treatment is as good as random with respect to potential mediator values. Same conceptual content as condition 1.

**3. M-Y unconfoundedness** (`Y(t, m) ⊥ M | T = t, X` for all `t, m`):
Given treatment + observed `X`, mediator is as good as random with respect to potential outcomes. **The new assumption.**

**4. No T-induced confounding of M-Y**:
If `T` causes a variable `Z` that confounds `M` and `Y` (`T → Z`, `Z → M`, `Z → Y`), natural effects fail to identify.

## Why M-Y is hardest

Mediators are observed downstream of treatment. They're rarely randomized — even when treatment IS randomized.

Consider an RCT of a job-training program (`T`), with `M = study habits` mediating the effect on grades (`Y`).

- `T` is randomized: `T-Y` and `T-M` unconfoundedness hold by design.
- `M` (study habits) is determined by individual choice, ability, support systems. Many factors that affect study habits also affect grades (motivation, prior knowledge, family support).
- These factors are `M-Y` confounders. They aren't randomized; they aren't necessarily observed.

So mediation analysis layers an observational assumption (M-Y unconfoundedness) onto the RCT.

## Diagnostic question

Before running a mediation analysis, ask: in this setting, what unobserved variable might cause both `M` and `Y`?

If you have a plausible answer, you have an identifiability concern. Possible responses:

- **Sensitivity analysis**: quantify how strong the unobserved confounder would need to be to overturn the conclusion.
- **Instrumental approach**: find an instrument for `M` (rarely possible).
- **Acknowledge the limitation**: present mediation as suggestive evidence, not definitive.

If you don't have a plausible answer, the assumption may be defensible — but you should still sensitivity-analyze.

## Falsification checks

Some testable implications:

**Negative-control mediator**: a mediator that SHOULDN'T mediate the effect (e.g., an unrelated variable). If your method finds significant indirect effect through a negative-control mediator, the method is producing false positives.

**Pre-treatment placebo**: if `M` predicts `Y` controlling for `T`, but the prediction strength is very different in pre-treatment data, suspect M-Y confounding has time-varying structure.

**Subgroup heterogeneity**: if the indirect effect varies dramatically across subgroups in a way that suggests confounding, suspect violation.

These don't prove the assumption; they catch some violations.

<!-- tier:grad -->
# Mediation Assumptions (Grad)

## Counterfactual statement of the assumptions

In potential-outcomes notation, the four conditions for natural-effect identification are:

1. `Y(t, m) ⊥ T | X` for all `t, m`.
2. `M(t) ⊥ T | X` for all `t`.
3. `Y(t, m) ⊥ M | T = t, X` for all `t, m`.
4. `Y(t, m) ⊥ M(t') | X` for all `t, t', m`.

Condition 4 is the strongest and least intuitive. It's about **cross-world independence** — the relationship between potential outcomes under different counterfactual conditions. It can fail even when the other three hold.

## When condition 4 fails

Avin, Shpitser, Pearl identified a graph structure where it fails: `T → Z → M`, `Z → Y`. `Z` is a mediator-confounder caused by treatment. Natural effects aren't identified.

**Path-specific effects** (PSE) generalize the natural-effects framework to handle such cases. PSE is identifiable in some structures where NDE/NIE aren't.

## Sensitivity analysis

**VanderWeele's parametric approach**: parameterize a hypothetical unobserved `M-Y` confounder `U` by its `M-U` strength `λ_M` and `Y-U` strength `λ_Y`. Recompute NDE/NIE for varying `(λ_M, λ_Y)`. Report:

- Bias as a function of `(λ_M, λ_Y)`.
- The threshold of `(λ_M, λ_Y)` that would null the indirect effect.
- The bias-corrected estimate at "best-guess" `(λ_M, λ_Y)`.

If a small `(λ_M, λ_Y)` could overturn the conclusion, the result is fragile. If only a strong confounder would, it's more robust.

**E-value for mediation** (VanderWeele-Ding 2017): a single-number summary of the minimum confounder strength to nullify. Easy to report; standardized across studies.

## Bounds

Even when point identification fails, **bounds** on the indirect effect can sometimes be computed:

**Manski-style worst-case bounds**: under the weakest possible assumptions, what's the range of plausible indirect effects? Often very wide, but informative.

**Bounds with monotone-mediation assumptions**: if you're willing to assume the mediator's effect on the outcome is monotone, bounds tighten substantially.

## High-dimensional mediators

When there are many candidate mediators (genes, voxels, neural-net activations), the assumptions become even harder to defend. Methods:

- **High-Dimensional Mediation Analysis (HIMA)**: lasso-style sparse selection of important mediators.
- **Joint significance**: identify mediators that satisfy joint significance tests with adjustments for multiple testing.
- **Bayesian methods**: priors over which mediators matter; partial pooling reduces variance.

The identifiability assumptions still apply — sparse selection doesn't fix unconfoundedness violations.

## Time-varying mediation

When `T`, `M`, and `Y` are time-indexed:

- **G-formula**: handles time-varying confounders affected by past treatment.
- **Marginal structural models**: weight by time-varying propensity scores.
- **Sequential ignorability**: a stronger version of the four conditions, applied at each time step.

Most applied papers don't handle time-varying mediation correctly. The methodology is technical; software (`gfoRmula`, `ipw`) helps.

## Mediation in ML interpretability

When applying mediation to neural-network internals:

- The "treatment" is some input feature; the "mediator" is a layer's activation; the "outcome" is the network's output.
- M-Y unconfoundedness: are the activation's effect on output and the input's effect on output confounded by anything? In a deterministic NN with full visibility, formally no — but the framework is interventional, and intervention on activations is non-trivial (the "natural" activation distribution depends on the input).
- The Pearl framework gives mech-interp a vocabulary for what activation patching does (a CDE-style intervention) and what it doesn't do (counterfactual reasoning about what the network would have output for a different input).

## References

- Pearl 2001. Direct and indirect effects. *UAI*.
- Avin, Shpitser, Pearl 2005. Identifiability of path-specific effects. *IJCAI*.
- Imai, Keele, Yamamoto 2010. Identification, inference, and sensitivity analysis for causal mediation effects. *Statistical Science*.
- VanderWeele & Ding 2017. Sensitivity analysis in observational research: introducing the E-value. *Annals of Internal Medicine*.
- Robins & Greenland 1992. Identifiability and exchangeability for direct and indirect effects. *Epidemiology*.
