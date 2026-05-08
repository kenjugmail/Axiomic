---
title: Mediation
category: causal
---
<!-- tier:intro -->
# Mediation

A **mediator** `M` is a variable on the causal path from treatment `T` to outcome `Y`: `T → M → Y`.

Mediation analysis decomposes the **total effect** of `T` on `Y` into:

- **Direct effect**: how much flows through paths NOT going through `M`.
- **Indirect effect**: how much flows through `T → M → Y` (and other paths through `M`).

Knowing which mediator carries most of the effect informs mechanism understanding, policy refinement, and effect interpretation.

Mediation analysis requires stronger assumptions than estimating just the total effect — including no unobserved `M-Y` confounders, which often isn't plausible.

<!-- tier:undergrad -->
# Mediation (Undergrad)

## Why decompose

A mentoring program raises grades. Total effect: +0.3 GPA. Decomposition might reveal:

- 80% indirect effect via study-habit improvement.
- 20% direct effect (mentor relationship, motivation).

This decomposition is actionable: if you can't afford full mentoring, structured study-habit programs might capture most of the gain at lower cost.

Other examples:

- Drug → biomarker → mortality. Most of the drug's effect is via the biomarker. Could we target the biomarker directly?
- Education program → test scores → adult earnings. Are the gains via test-score signal, human capital, or noncognitive skills?
- A/B-tested feature → user retention → revenue. Is revenue effect via retention or directly?

## The Baron-Kenny approach (and its limits)

Classical (Baron-Kenny 1986) mediation:

1. Show `T` affects `Y` (significant total effect).
2. Show `T` affects `M` (significant `T-M` path).
3. Show `M` affects `Y` controlling for `T` (significant `M-Y` path with `T` adjusted).
4. Show the direct effect (`T-Y` controlling for `M`) is reduced compared to the total effect.

If steps 1-4 hold, conclude mediation.

This was the dominant approach in psychology + epidemiology for decades. **It's now known to be insufficient** when treatment effects are heterogeneous or interactions exist.

The modern approach uses **natural direct + indirect effects** (Pearl, Robins-Greenland), which are causally interpretable even with heterogeneous effects + interactions.

## Natural direct + indirect effects

Using potential outcomes notation with both `T` and `M(t)` (the mediator's value when `T = t`):

**Natural Direct Effect (NDE)**: effect of `T` on `Y` if we held `M` at its untreated value.
`NDE = E[Y(T = 1, M = M(0)) - Y(T = 0, M = M(0))]`

**Natural Indirect Effect (NIE)**: effect of moving `M` from its untreated value to its treated value, holding `T` at treated.
`NIE = E[Y(T = 1, M = M(1)) - Y(T = 1, M = M(0))]`

**Decomposition**:
`Total Effect = NDE + NIE`

These quantities are causally meaningful — they correspond to specific counterfactual operations.

## Identifying assumptions

To estimate NDE/NIE from observational data, you need:

1. No unobserved `T-Y` confounders (standard for any causal estimate).
2. No unobserved `T-M` confounders (the same, applied to `T → M` path).
3. **No unobserved `M-Y` confounders** (the new + hardest one).
4. **No `T`-induced `M-Y` confounder** (Avin et al. 2005). If `T` causes a confounder of `M` and `Y`, natural effects aren't identified.

Assumption 3 is often the breakdown. Mediators are observed downstream of treatment but rarely randomized — even an RCT doesn't randomize the mediator. So an RCT identifies the total effect cleanly but mediation decomposition still requires the M-Y unconfoundedness assumption.

<!-- tier:grad -->
# Mediation (Grad)

## Identifiability formulas

Under the assumptions above, NDE and NIE are identified by the **mediation formula** (Pearl 2001):

`NDE = ∑_m [E[Y | T = 1, M = m, X] - E[Y | T = 0, M = m, X]] · P(M = m | T = 0, X)`

`NIE = ∑_m E[Y | T = 1, M = m, X] · [P(M = m | T = 1, X) - P(M = m | T = 0, X)]`

Both averaged over `X`.

These are computable from observational data (under the assumptions). Implementation in `paramed` (Stata), the `mediation` R package (Imai-Keele-Yamamoto), and DoWhy.

## Controlled vs natural effects

**Controlled Direct Effect (CDE)** at level `m`: effect of `T` on `Y` when `M` is FIXED at `m` for everyone.
`CDE(m) = E[Y(T = 1, M = m) - Y(T = 0, M = m)]`

Different from NDE. CDE reflects the effect when we POLICY-FIX `M`; NDE reflects the effect when `M` is whatever it would have been without treatment.

CDE is typically the policy-relevant quantity when you can intervene on the mediator. NDE is the natural decomposition.

For a binary mediator with no `T × M` interaction, CDE = NDE = constant. With interactions, they differ.

## Sensitivity analysis

Because the M-Y unconfoundedness assumption is rarely defensible exactly, sensitivity analysis is essential:

**VanderWeele's approach**: parameterize a hypothetical unobserved `M-Y` confounder `U` by its `M-U` and `Y-U` strengths. Recompute NDE/NIE under varying values. Report bias-corrected estimates + the threshold of `U` that would overturn the conclusion.

**E-value for mediation**: minimum strength of confounding needed to nullify the indirect effect.

If a small `U` could overturn the conclusion, the mediation result is fragile. If it would take a strong `U`, the result is robust.

## High-dimensional mediators

Modern applications (medical imaging biomarkers, gene expression, neural-network internal representations) feature MANY potential mediators.

Methods:

- **Sparsity-inducing methods**: lasso-style penalties to identify which mediators carry most of the effect.
- **Principal-direction methods**: project mediators onto a low-dimensional space; estimate mediation in projected space.
- **Bayesian approaches**: priors on which mediators are relevant.

Active research area. Modern tools: HIMA (high-dimensional mediation analysis), HIMA2.

## Longitudinal mediation

When `T`, `M`, and `Y` evolve over time:

- **G-methods** (Robins): handle time-varying confounders that are also affected by past treatment.
- **Marginal structural models**: weight by the time-varying propensity.
- **Sequential ignorability**: a stronger assumption set for time-varying mediation.

The mediation literature here is technical; few applied papers do it correctly.

## Connection to ML interpretability

Mech-interp uses mediation analysis explicitly:

- "Which intermediate representation in the network mediates the input-output behavior?"
- **Activation patching** = a controlled direct effect on the output, fixing the intermediate at a particular value.
- **Path patching** = an NDE-style intervention along a specific computational path.

The methodological foundation is the same as biostatistical mediation. Adoption is increasing in ML interpretability research.

## References

- Baron & Kenny 1986. The moderator-mediator variable distinction. *J. Personality and Social Psychology*.
- Robins & Greenland 1992. Identifiability and exchangeability for direct and indirect effects. *Epidemiology*.
- Pearl 2001. Direct and indirect effects. *UAI*.
- Imai, Keele, Yamamoto 2010. Identification, inference, and sensitivity analysis for causal mediation effects. *Statistical Science*.
- VanderWeele 2015. *Explanation in Causal Inference*. (Comprehensive book.)
