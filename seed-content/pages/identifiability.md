---
title: Identifiability
category: causal
---
<!-- tier:intro -->
# Identifiability

A causal effect is **identifiable** from observational data + a causal DAG if there exists a function of the observable joint distribution that equals the causal effect.

Formally: `P(Y | do(X))` is identifiable iff it can be expressed in terms of `P(observable variables)` alone.

If identifiable, you can estimate it from observational data (subject to estimation error). If not identifiable, no observational analysis can recover it — you need interventions or additional assumptions.

Identifiability is decidable: Pearl's ID algorithm tests it in polynomial time given a DAG.

<!-- tier:undergrad -->
# Identifiability (Undergrad)

## When is a causal effect identifiable?

Three main sufficient conditions:

**1. Backdoor adjustment**: there exists an OBSERVED set `Z` such that:
- No descendants of `T` are in `Z`.
- `Z` blocks every backdoor path from `T` to `Y`.

If `Z` exists, `P(Y | do(T))` = `∑_z P(Y | T, Z) · P(Z)`. Identifiable.

**2. Front-door adjustment**: there exists a mediator `M` such that:
- All directed paths `T → ... → Y` go through `M`.
- No backdoor paths from `T` to `M`.
- All backdoor paths from `M` to `Y` are blocked by `T`.

If such `M` exists, the effect is identifiable via the front-door formula even with unobserved `T-Y` confounders. Pearl's smoking-tar-cancer example.

**3. Combinations**: do-calculus can derive identifying formulas that don't fit either pattern cleanly. The Shpitser-Pearl ID algorithm handles all identifiable cases.

## When is it NOT identifiable?

**Unobserved confounders without bypass**: if `T` and `Y` share an unobserved common cause and there's no front-door mediator and no instrument, the effect is unidentifiable.

**Hedges**: graph-theoretic obstructions. A C-component pair in the DAG that can't be eliminated by do-calculus. The ID algorithm detects these.

**Practically**: most DAGs with unobserved confounders and no good instruments give unidentifiable effects. This is the typical case in real research.

## What unidentifiability means in practice

If your effect isn't identifiable from observational data:

- **No regression, IPW, doubly-robust, or matching method works**. They all silently produce biased estimates.
- **You need either intervention** (run an RCT or quasi-experiment) **or additional assumptions** (parametric restrictions, IV, RDD, monotone-treatment-response bounds, sensitivity bounds).
- **You can sometimes get bounds, not point estimates**: Manski-style worst-case bounds on the effect, given assumptions about the unobserved confounder's strength.

The key thing: don't pretend to estimate an unidentifiable effect with a method that assumes ignorability. The estimate will be confidently wrong.

## Software

- **DoWhy**: Python; given DAG + query, runs ID algorithm; reports identifiability + adjustment strategy.
- **causaleffect** (R): Tian-Pearl ID algorithm directly.
- **dagitty**: browser tool; identifies adjustment sets; reports when none exist.

These tools turn the abstract identifiability question into a mechanical check.

<!-- tier:grad -->
# Identifiability (Grad)

## The completeness theorem

Pearl's three do-calculus rules are **complete**: they identify every identifiable causal effect in the DAG framework with observational data. If the rules can't simplify `P(Y | do(X))` to an observational expression, no method can.

Proven by Shpitser-Pearl (2006) and Huang-Valtorta (2006) via construction of the ID algorithm.

This makes identifiability a decidable problem with polynomial-time complexity. The hard part isn't the algorithm; it's drawing the right DAG.

## Identifiability in C-components

Tian's decomposition of the DAG into **C-components** (collections of nodes connected by bidirected edges from latent confounders) is the basis for the ID algorithm.

A C-component decomposition lets you:

- Compute identifiability per C-component.
- Compose component-level identifications into a full identification formula.
- Detect hedges as obstructions.

This is the modern way of thinking about identifiability — graph-structural rather than rule-application-based.

## Bounded identifiability

When point identification fails, **bounds** can sometimes be computed. Manski's seminal work on partial identification:

- **Worst-case bounds**: `min(P(Y | do(X))) ≤ effect ≤ max(P(Y | do(X)))` over the space of consistent SCMs.
- **Tightening with assumptions**: monotone treatment response (effect is non-negative) tightens bounds.
- **Computation**: linear or polynomial programming over the SCM parameters; Balke-Pearl bounds are a classical example.

Bounds don't replace point estimates but provide honest uncertainty when the data alone can't pin down the effect.

## Counterfactual identifiability

Counterfactual queries (`Y_{X=x}` for a unit with observed evidence) are strictly harder than interventional queries. Pearl's three-layer hierarchy:

- **Layer 1: associational** (`P(Y | X)`).
- **Layer 2: interventional** (`P(Y | do(X))`).
- **Layer 3: counterfactual** (`P(Y_{X=x} | observed evidence)`).

Higher layers require more from the model. Layer-2 needs a DAG; layer-3 needs an SCM with explicit functional forms.

The Pearl hierarchy theorem: most layer-2 identifiable effects aren't layer-3 identifiable. Counterfactual reasoning requires extra structure.

## Connection to ML interpretability

Recent mechanistic-interpretability work uses identifiability concepts:

- "Is this circuit causal for behavior X?" is an identifiability question — can we determine the circuit's causal role from interventions?
- Patching experiments correspond to interventions; their results are interventional, not counterfactual.
- Identifying the "minimal necessary" set of components for a behavior is an adjustment-set question.

Identifiability gives mech-interp a formal framework for what its experiments can and can't conclude.

## References

- Pearl 1995, 2009. Foundational work.
- Shpitser & Pearl 2006. *AAAI*. The ID algorithm.
- Tian 2002. *PhD thesis* (UCLA). C-component decomposition.
- Manski 2003. *Partial Identification of Probability Distributions*. Bounds.
- Pearl & Mackenzie 2018. *The Book of Why*. Accessible introduction.
