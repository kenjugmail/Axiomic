---
title: do-Operator
category: causal
---
<!-- tier:intro -->
# do-Operator

Pearl's notation for an **intervention**: `do(X = x)` means forcibly set `X` to `x`, ignoring whatever causal mechanism normally determines `X`.

Critical distinction:

- **`P(Y | X = x)`**: observational. *"Among units where `X` happens to equal `x`, what's `Y`?"*
- **`P(Y | do(X = x))`**: interventional. *"If we forced `X` to be `x`, what would `Y` be?"*

These differ when `X` is associated with `Y` through paths other than the direct causal effect — i.e., when there's confounding. Under randomization, they coincide. Under observation, they typically don't.

The do-operator is the mathematical formalization of "what would happen if we intervened."

<!-- tier:undergrad -->
# do-Operator (Undergrad)

## How `do` modifies the DAG

`do(X = x)` deletes all incoming arrows to `X` in the DAG. `X` is no longer determined by its parents — it's set to `x` by the intervention.

The resulting graph (with arrows into `X` deleted) is the **post-intervention DAG**. Compute `P(Y | do(X))` in this modified graph.

This is the formal definition: `P(Y | do(X = x))` = `P(Y | X = x)` computed under the post-intervention DAG.

## Example

DAG: `Z → T → Y` plus `Z → Y` (`Z` is a confounder).

Observational: `P(Y | T = 1)` reflects both the direct effect `T → Y` AND the indirect path via `Z` (because `T = 1` is more likely when `Z` is high).

Interventional: `P(Y | do(T = 1))` reflects only the direct effect. The intervention severs `Z → T`; the path `T ← Z → Y` is no longer relevant.

The difference quantifies the confounding bias.

## Why we care

Causal claims are about interventions. *"Should we deploy this drug?"* asks `P(recovery | do(drug = 1))`, not `P(recovery | drug = 1)`.

Most ML predictions answer the latter: given the historical association between features and outcome, what's the conditional probability? Acting on these predictions implicitly treats them as interventional, which is often wrong.

The pneumonia-asthma case (Caruana 2015) is a perfect example: `P(mortality | asthma = 1, X)` was lower than `P(mortality | asthma = 0, X)` because asthmatics get aggressive treatment. `P(mortality | do(asthma = 1), X)` would have been higher (no protective treatment effect from the do-intervention). Acting on the observational prediction would have killed people.

## Identifiability

`P(Y | do(X = x))` is **identifiable** from observational data + DAG if there's a formula expressing it in terms of observable probabilities.

Two main identification strategies:

**Backdoor adjustment**: find an observed `Z` blocking all backdoor paths.

`P(Y | do(X = x)) = ∑_z P(Y | X = x, Z = z) · P(Z = z)`

**Front-door adjustment**: when there's a mediator `M` with no `M-Y` confounder.

`P(Y | do(X = x)) = ∑_m P(M = m | X = x) · ∑_{x'} P(Y | M = m, X = x') · P(X = x')`

**Tian-Pearl identifiability algorithm** generalizes both: tests whether the effect is identifiable by ANY combination of these strategies. Implemented in DoWhy + the `causaleffect` R package.

## When `do` and conditioning agree

The two coincide when:

- `X` is **randomized** (no parents in the DAG).
- All confounders of `X` and `Y` are observed AND adjusted for.

Most observational ML satisfies neither. The do-operator's value is in making this difference explicit.

<!-- tier:grad -->
# do-Operator (Grad)

## The three rules of do-calculus

Pearl's three rules let you symbolically simplify expressions involving `do(·)`:

**Rule 1 (insertion / deletion of observations)**: under d-separation conditions in a modified graph,
`P(Y | do(X), Z, W) = P(Y | do(X), W)` if `Y ⊥ Z | X, W` in the post-intervention graph.

**Rule 2 (action / observation exchange)**: under appropriate d-separation,
`P(Y | do(X), do(Z), W) = P(Y | do(X), Z, W)` — i.e., the `do(Z)` can be replaced by conditioning if backdoor paths from `Z` to `Y` are blocked by `X, W`.

**Rule 3 (insertion / deletion of actions)**: under appropriate d-separation,
`P(Y | do(X), do(Z), W) = P(Y | do(X), W)` — i.e., `do(Z)` can be removed if `Z` doesn't causally affect `Y` in the modified graph.

The exact d-separation conditions are intricate; software automates them.

## Completeness

**Tian & Pearl (2002)**: do-calculus is **complete** for identifiability. If a causal effect is identifiable from observational data + DAG, the three rules will derive the formula. If they can't, the effect isn't identifiable.

This makes identifiability a decidable problem — given a DAG and a query, you can mechanically check whether `P(Y | do(X))` is computable from observables.

**Shpitser-Pearl algorithm**: the canonical implementation. Polynomial-time check for identifiability.

## Counterfactuals

`do(X)` answers "what would happen if we forced `X`?" — a population-level claim.

**Counterfactuals** answer "for THIS unit, what would `Y` have been if `X` had been different?" — a unit-level claim.

Counterfactuals require more than the DAG; they need a Structural Causal Model (SCM) with explicit functional forms and noise distributions. The "twin network" technique computes counterfactuals by duplicating the SCM and constraining the duplicate to match observed evidence.

Counterfactual identification is strictly harder than interventional identification. Some interventional effects are identifiable; few counterfactual effects are.

## Surrogate experiments + transportability

When a target population's causal effect isn't identifiable but a related population's IS, **transportability** asks: can we extrapolate from the source to the target?

Pearl & Bareinboim's transportability framework formalizes this. Add "selection" nodes representing population differences; apply do-calculus on the augmented graph; identify which source-population estimates transport to the target.

This matters for ML deployments: an A/B-tested effect in one user segment might or might not transport to another. Causal-aware analysis can distinguish.

## Connection to ML interventions

In ML systems, "interventions" can mean:

- **Counterfactual prediction**: predict `Y` for a unit at a different `T`.
- **Off-policy evaluation**: estimate the value of a different policy from logged data.
- **Distribution shift**: the deployment distribution differs from training.
- **A/B testing rollouts**: the policy change is itself an intervention.

The do-operator gives a unified formal vocabulary for all of these. Off-policy reinforcement learning, in particular, is a fully causal framing — every action is `do(action = a)`, and the goal is computing `E[reward | do(policy)]` from observational data.

## References

- Pearl 1995. Causal diagrams for empirical research. *Biometrika*.
- Tian & Pearl 2002. A general identification condition for causal effects. *AAAI*.
- Shpitser & Pearl 2008. Complete identification methods for the causal hierarchy. *J. Mach. Learn. Res.*
- Bareinboim & Pearl 2016. Causal inference and the data-fusion problem. *PNAS*.
- Pearl 2018. *The Book of Why*.
