---
title: DAG (Directed Acyclic Graph)
category: causal
---
<!-- tier:intro -->
# DAG

A **causal DAG** (Directed Acyclic Graph) encodes causal assumptions visually:

- **Nodes** are variables.
- **Directed edges** (`X → Y`) say *"`X` is a direct cause of `Y` relative to the other variables in the graph."*
- **No cycles** — you can't follow arrows around back to the start.

The DAG is not data. It's an explicit set of assumptions about what causes what. Different DAGs encode different causal stories. The data tests the DAG's predictions; the DAG informs how the data should be analyzed.

From the graph alone (without numerical data), you can: identify confounders, decide whether an effect is identifiable, pick adjustment sets, derive testable conditional independencies. The graph is doing real algebraic work.

<!-- tier:undergrad -->
# DAG (Undergrad)

## Three building-block patterns

**Chain**: `X → Z → Y`. `Z` is a mediator. `X` causes `Y` via `Z`. Conditioning on `Z` blocks the path.

**Fork**: `X ← Z → Y`. `Z` is a common cause (confounder). `X` and `Y` are associated through `Z`; conditioning on `Z` blocks.

**Collider**: `X → Z ← Y`. `Z` is a common effect. `X` and `Y` are independent unconditionally; conditioning on `Z` *opens* a spurious association.

The collider behavior is the counterintuitive one. It explains:

- Berkson's bias in hospital data.
- Negative correlations among NBA players' height + skill.
- Spurious associations in selection-on-the-outcome studies.
- The "GPA vs test score among interviewees" example.

## d-separation

A path between `X` and `Y` is **blocked** by a set `Z` if:

1. The path contains a chain or fork node that's IN `Z`, OR
2. The path contains a collider that is NEITHER in `Z` NOR has any descendant in `Z`.

`X` and `Y` are **d-separated** by `Z` if every path between them is blocked. d-separation implies conditional independence (`X ⊥ Y | Z`) under faithfulness.

This is the algorithm: walk paths in the DAG; check the rules for each.

## The backdoor criterion

To estimate the causal effect of `T` on `Y`, find a set `Z` that:

1. Contains no descendants of `T`.
2. Blocks every backdoor path from `T` to `Y`.

If such a `Z` exists, the effect is identifiable: `P(Y | do(T)) = ∑_z P(Y | T, Z=z) P(Z=z)`.

This is what regression adjustment, propensity score matching, IPW are doing under the hood. They differ in how they implement the adjustment, not in what they're computing.

## Drawing a DAG

The procedure:

1. List all relevant variables (treatment, outcome, suspected confounders, mediators, instruments).
2. Draw arrows from cause to effect for each pair you have an opinion on.
3. Be explicit about UNobserved variables — show them as latent nodes.
4. Apply backdoor criterion: find an adjustment set of OBSERVED variables that blocks all backdoor paths.
5. Use d-separation to derive testable independencies; check against data as a sanity check.

The DAG is your assumption set. If reviewers disagree with your DAG, they're disagreeing with your causal story — that's a productive disagreement, not a methodological one.

## Common DAG mistakes

- **Conditioning on a collider**: opens spurious paths. The classic case.
- **Conditioning on a mediator**: estimates direct effect when you wanted total effect.
- **Adjusting for a descendant of treatment**: introduces bias.
- **Forgetting unobserved confounders**: most common failure.
- **Drawing the DAG to fit the data**: backwards. The DAG encodes assumptions; the data tests them.

<!-- tier:grad -->
# DAG (Grad)

## Causal Markov + faithfulness

The DAG framework rests on two principles:

**Causal Markov condition**: the joint distribution factorizes per the DAG.
`P(X_1, ..., X_n) = ∏ P(X_i | parents(X_i))`

This says the DAG correctly encodes all conditional independencies.

**Faithfulness**: every conditional independence in the data corresponds to a d-separation in the DAG. Equivalently: no measure-zero coincidences make conditional independencies hold without graphical justification.

Both are usually plausible. Faithfulness can fail in special cases (deterministic relationships, strict canceling effects); causal Markov can fail in the presence of cycles or latent variables not in the DAG.

## SCMs (Structural Causal Models)

A DAG + a set of structural equations + a distribution over exogenous noise:

`X_i = f_i(parents(X_i), U_i)`

where `U_i` are independent noise terms.

This is a **Structural Causal Model (SCM)**. It encodes:

- The DAG (the causal structure).
- The functional form of each causal mechanism.
- The randomness.

SCMs are more expressive than DAGs alone. They support counterfactual reasoning (what would `Y` have been if `X` had been different?) — a question DAGs alone don't answer.

## The do-operator

`do(X = x)`: an intervention that sets `X` to `x`, severing the dependence of `X` on its parents.

`P(Y | do(X = x))` is the post-intervention distribution. Computed by:

1. Set `X` to `x` (delete the arrows into `X`).
2. Compute `Y`'s distribution in the modified graph.

The do-calculus rules let you symbolically compute `P(Y | do(X))` from observational `P(...)` when identifiable.

## Equivalence classes

Multiple DAGs can imply the same conditional-independence structure. They form a **Markov equivalence class**, represented by a CPDAG (Completed Partially Directed Acyclic Graph):

- Edges are oriented if all DAGs in the class agree.
- Edges are undirected if the orientation varies.

Observational data alone identifies the equivalence class, not the unique DAG. Distinguishing within the class requires interventions, time-order, or extra parametric assumptions (like LiNGAM).

## DAGs vs structural equation models

The DAG framework (Pearl) is qualitative — about conditional independencies and identifiability. The SEM framework (older, e.g. Wright 1921) parameterizes causal effects directly.

Modern practice unifies them: SCMs are DAGs + functional forms + noise distributions. Structural equation models are SCMs with linear-Gaussian forms. Causal forests, NOTEARS, and DoWhy all live within this synthesis.

## References

- Pearl 2009. *Causality* (2nd ed). Cambridge.
- Pearl, Glymour, Jewell 2016. *Causal Inference in Statistics: A Primer*. Wiley.
- Spirtes, Glymour, Scheines 2000. *Causation, Prediction, and Search*. MIT.
- Hernán & Robins 2020. *Causal Inference: What If*. Open access.
