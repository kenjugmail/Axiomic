---
title: Type I and Type II Errors
category: stats
---
<!-- tier:intro -->
# Type I and Type II Errors

Two ways a hypothesis test can be wrong:

- **Type I error (α)**: reject H₀ when it's actually true. False positive.
- **Type II error (β)**: fail to reject H₀ when H₁ is true. False negative.

Power = `1 - β` (probability of correctly rejecting H₀).

These two errors trade off. Lowering α raises β, and vice versa.

<!-- tier:undergrad -->
# Type I/II (Undergrad)

## The 2×2 table

|              | H₀ true     | H₁ true     |
|--------------|-------------|-------------|
| Don't reject | ✓ correct   | Type II (β) |
| Reject       | Type I (α)  | ✓ correct (power = 1 - β) |

The columns are mutually exclusive: H₀ is either true or false. The rows are the test's decision.

## Conventional values

- α = 0.05 (5% chance of false positive)
- power = 0.80 (80% chance of detecting a real effect)
- β = 0.20

These aren't laws of physics; they're conventions. High-stakes settings (drug trials) use α = 0.01 or smaller. Exploratory analysis can use α = 0.10.

## The trade-off

Lowering α requires more evidence to reject. Same evidence threshold → harder to reject H₀ when it's true (lower α) AND when it's false (lower power = higher β).

To improve both simultaneously, you need:
- More data (`n` larger).
- Larger true effect (out of your control).
- Reduced variance (better measurement, blocking).

## In ML evaluation

Common pathology: tests run at α = 0.05, but underpowered. With small test sets:
- p ≥ 0.05 (fail to reject) doesn't mean 'no effect' — could be Type II.
- 'No statistically significant difference' is uninformative if power is low.

Always run [[power-analysis]] up front. Without it, null results don't tell you much.

<!-- tier:grad -->
# Type I/II (Grad)

## Power analysis math

For a two-sample t-test (equal sample sizes per group):

```
n ≈ 2 (z_{α/2} + z_β)² σ² / δ²
```

where:
- `n` = sample size per group
- `δ` = effect size to detect
- `σ²` = within-group variance
- `z_{α/2}, z_β` = standard normal quantiles

For α = 0.05, power = 0.80, σ = 1, δ = 0.2 (small effect): n ≈ 393 per group. That's the magnitude of sample size needed for 'small effects'.

## Bonferroni and α inflation

Running K tests at α = 0.05 inflates the **family-wise error rate** (FWER). Bonferroni correction: use `α / K` per test. FWER ≤ α.

Conservative; inflates Type II to control Type I. For many tests, FDR control (Benjamini-Hochberg) is often preferred.

## Asymmetric costs

Conventional α = 0.05, β = 0.20 implicitly says false positives are 4× as bad as false negatives. Often wrong:

- **Cancer screening**: false negatives are catastrophic. Lower β; tolerate higher α.
- **Loan approval**: false positives expose lender to bad loans. Lower α; tolerate higher β.
- **Spam filter**: similar — Type I (good email marked spam) is more annoying than Type II (spam in inbox).

The right α and β depend on the cost ratio of the two error types in your application. Defaults are conventions, not optima.

## In ML evaluation

The ML version: false positives = shipping a 'better' model that isn't really better. False negatives = not shipping a real improvement.

The cost asymmetry: shipping a slightly-worse model is usually less bad than not shipping a real improvement, because we have lots of model versions and easy rollback. So slightly-loose α (e.g., α = 0.10) is often defensible for ML deploys with rollback infrastructure.

In high-stakes settings (medical, legal), the cost asymmetry flips. Be conservative.
