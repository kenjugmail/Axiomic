---
title: Multiple Testing Correction
category: stats
---
<!-- tier:intro -->
# Multiple Testing

When you run K independent hypothesis tests at level α, the chance of *at least one* false positive is `1 - (1 - α)^K`. For K = 20: ~64%.

Without correction, p < 0.05 in any of K tests means very little. Correction methods (Bonferroni, Holm, Benjamini-Hochberg) preserve interpretability.

<!-- tier:undergrad -->
# Multiple Testing (Undergrad)

## Family-wise error rate (FWER)

Probability of at least one false positive across K tests. **Bonferroni correction**: use `α / K` per test. FWER ≤ α.

For K = 20, α = 0.05: per-test threshold = 0.0025.

Pros: simple; controls FWER conservatively.
Cons: very conservative. Power drops sharply for many tests.

**Holm-Bonferroni**: order p-values from smallest to largest. Compare to `α/(K - i + 1)` thresholds. Same FWER guarantee; more powerful than Bonferroni.

## False discovery rate (FDR)

Expected proportion of false positives among rejected nulls. Less conservative than FWER.

**Benjamini-Hochberg (BH)**:
1. Order p-values: `p_(1) ≤ p_(2) ≤ ... ≤ p_(K)`.
2. Find largest `i` such that `p_(i) ≤ (i/K) · α`.
3. Reject hypotheses with p-values ≤ `p_(i)`.

FDR ≤ α at expectation. Standard in modern ML evaluation when running many tests.

## In ML evaluation

Hyperparameter sweeps: 100 configurations × 'p < 0.05 vs baseline' = 5 spurious 'wins' on average.

Multiple metrics: testing accuracy + F1 + AUC + calibration each at α = 0.05 → 4 chances to spuriously declare success.

Always correct. Bonferroni for small K (< 10); BH for larger K. Reporting p-values without correction in a many-test setting is statistical malpractice.

<!-- tier:grad -->
# Multiple Testing (Grad)

## When to use which

**FWER (Bonferroni, Holm)**: confirmatory studies where any false positive is bad. Drug trials, regulatory approvals. Strict.

**FDR (BH)**: exploratory studies, screening, sweeps where some false discoveries are acceptable. Most ML evaluation falls here.

**No correction**: pre-registered single primary analysis. Common in classical experimental design.

## Dependence among tests

Bonferroni assumes independent tests; conservative when tests are correlated. With strong positive correlation, true FWER is lower than `K · α`, so Bonferroni is overly conservative.

**Šidák correction**: `1 - (1 - α)^(1/K)`. Slightly less conservative than Bonferroni for independent tests; same conservative for correlated tests.

**Permutation-based corrections**: simulate the joint distribution of test statistics under H₀; use empirical thresholds. Works for any dependence structure. Computationally expensive.

## In ML

**Hyperparameter selection**: run K configs; report best. The 'best' p-value is biased by selection. Two solutions:

1. **Adjust for selection**: `p̂_adjusted = K × p̂_observed` (Bonferroni).
2. **Don't test on the same data**: cross-validate; final test on held-out only after config selected.

Solution 2 is preferred when feasible.

**Multiple metrics**: pre-register a single primary metric; treat secondaries as exploratory; correct if testing all.

**Many subgroups**: HTE analysis often involves many subgroup tests. BH correction is the default.

## What's still hard

The 'replication crisis' in many fields traces partly to inadequate multiple-testing correction. ML's version is the 'irreproducibility' problem — methods that win on a benchmark fail to generalize. Better evaluation discipline (pre-registration, rigorous correction) is the antidote.
