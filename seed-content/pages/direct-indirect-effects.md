---
title: Direct and Indirect Effects
category: causal
---
<!-- tier:intro -->
# Direct and Indirect Effects

The two components of a total causal effect, given a mediator `M`:

- **Direct effect**: the part of `T → Y` that doesn't go through `M`. Captured by paths `T → ... → Y` not passing through `M`.
- **Indirect effect**: the part that goes through `T → M → Y` (and other paths through `M`).

`Total Effect = Direct Effect + Indirect Effect`

Knowing the decomposition tells you the mechanism. Useful for policy design, mechanism research, and effect interpretation.

Modern formalism distinguishes:

- **Natural direct + indirect effects** (NDE/NIE): effects when `M` takes its natural value under one or the other treatment condition.
- **Controlled direct effect** (CDE): effect when `M` is policy-fixed at a particular value.

<!-- tier:undergrad -->
# Direct and Indirect Effects (Undergrad)

## Natural vs controlled

**Natural direct effect (NDE)**: hold `M` at the value it would have taken if `T = 0`. Vary `T`; measure `Y`. The effect of `T` not via the mediator's response.

`NDE = E[Y(T = 1, M = M(0)) - Y(T = 0, M = M(0))]`

**Natural indirect effect (NIE)**: hold `T` at treated. Move `M` from its untreated value to its treated value. Measure `Y`'s change.

`NIE = E[Y(T = 1, M = M(1)) - Y(T = 1, M = M(0))]`

**Decomposition**: `TE = NDE + NIE`.

**Controlled direct effect (CDE)**: hold `M` at a SPECIFIC value `m` for everyone. Vary `T`. CDE is an effect at a specific mediator level.

`CDE(m) = E[Y(T = 1, M = m) - Y(T = 0, M = m)]`

When there's no `T × M` interaction, CDE is the same for all `m` and equals NDE. When there's interaction, they differ.

## Why the distinction matters

CDE is policy-relevant when you can intervene on the mediator. "If we set the biomarker at level `m`, what's the residual treatment effect?" — this is CDE.

NDE is the natural mechanism-decomposition. "How much of the effect is direct vs through the mediator's natural response?" — this is NDE.

Most papers use NDE/NIE for mechanism research; CDE for policy.

## Concrete example

Drug → blood pressure → mortality.

- **Total effect**: drug reduces mortality by 5%.
- **Indirect effect (NIE)**: drug reduces mortality by 4% through blood-pressure reduction (the natural pathway).
- **Direct effect (NDE)**: drug reduces mortality by 1% via other paths (e.g., direct cardiac effects).

Decomposition: 80% indirect, 20% direct. Most of the benefit is via blood-pressure control. If a cheaper drug also lowers blood pressure but lacks the direct cardiac effect, you'd predict ~80% of the benefit.

This is the kind of decomposition mediation analysis enables — and why it's useful even when the total effect is well-established.

## Estimation

Given observational data + adjustment set `X` for confounding, estimate:

- `μ_t(m, X) = E[Y | T = t, M = m, X]`
- `f_M(m | T = t, X) = P(M = m | T = t, X)`

Then:

`NDE = ∑_m [μ_1(m, X) - μ_0(m, X)] · f_M(m | T = 0, X)`, averaged over `X`.

`NIE = ∑_m μ_1(m, X) · [f_M(m | T = 1, X) - f_M(m | T = 0, X)]`, averaged over `X`.

`CDE(m) = μ_1(m, X) - μ_0(m, X)`, averaged over `X`.

Implementation: `mediation` R package, `paramed` Stata, DoWhy mediation.

<!-- tier:grad -->
# Direct and Indirect Effects (Grad)

## When the decomposition fails

Avin, Shpitser, Pearl (2005) identified a graph structure where natural effects ARE NOT identified: when there's a `T`-induced `M-Y` confounder.

If `T` causes a variable `Z` that confounds `M` and `Y` (`T → Z → M`, `T → Z → Y`, or similar), the natural-effects framework fails. The graph permits the total effect to be identified but not the natural decomposition.

Workarounds:

- **Path-specific effects**: a more general framework that handles some of these cases.
- **Bounds**: when point identification fails, sometimes the natural effects can be bounded.

## Sequential mediation

When there's a chain of mediators `T → M₁ → M₂ → Y`, you can decompose into:

- Direct effect (not through `M₁` or `M₂`).
- Effect through `M₁` only.
- Effect through `M₂` only.
- Effect through both `M₁` and `M₂`.

This requires careful handling — the simple NDE/NIE decomposition doesn't generalize cleanly to multiple mediators with interactions. **Path-specific effects** (Pearl 2001, VanderWeele 2009) provide the right framework.

## Stochastic interventions

Sometimes you don't want to fix `M` at a specific value but shift its distribution. **Modified-treatment-policy** mediation (Hubbard-van der Laan) considers interventions like "increase blood pressure exposure by 10%" instead of "set blood pressure to `m`". More realistic for many policy questions.

## Mediation in ML interpretability

A growing application:

- **Activation patching** asks: if we replace this layer's activation with the activation from a different prompt, how does the output change?
- This is a CDE-style intervention: the mediator (the layer's activation) is set to a specific value; the residual treatment effect is the rest of the network.
- **Path patching** (Wang et al. 2022 "induction heads"): intervene along specific computational paths; identify which paths carry the behavior.

Mediation analysis gives mech-interp a formal framework for what its experiments compute.

## Counterfactual mediation

The mediation decomposition can be framed counterfactually:

`Y_{T=1} = Y_{T=1, M = M_{T=1}}` (factual outcome under treatment)
`Y_{T=0} = Y_{T=0, M = M_{T=0}}` (factual outcome under control)

NDE compares `Y_{T=1, M = M_{T=0}}` vs `Y_{T=0, M = M_{T=0}}` — counterfactual outcomes that don't correspond to any observed unit.

This requires an SCM (not just a DAG); functional forms + noise distributions are needed for the counterfactual computation. Counterfactual mediation is strictly more demanding than interventional decomposition.

## Effect modification vs mediation

Often confused:

**Effect modification**: the effect of `T` on `Y` differs across levels of `Z`. `Z` is a moderator.

**Mediation**: `T` affects `Z`; `Z` affects `Y`. `Z` is a mediator.

Same variable can be a moderator + mediator simultaneously. The DAG distinguishes them by arrow direction. Different analyses for different roles.

## References

- Pearl 2001. Direct and indirect effects. *UAI*.
- Avin, Shpitser, Pearl 2005. Identifiability of path-specific effects. *IJCAI*.
- Imai, Keele, Tingley 2010. A general approach to causal mediation analysis. *Psychological Methods*.
- VanderWeele 2015. *Explanation in Causal Inference: Methods for Mediation and Interaction*.
- Wang et al. 2022. Interpretability in the wild: a circuit for indirect object identification in GPT-2. *arXiv*. (Mech-interp application.)
