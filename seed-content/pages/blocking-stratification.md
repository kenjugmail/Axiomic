---
title: Blocking & Stratification
category: stats
---
<!-- tier:intro -->
# Blocking & Stratification

Variance-reduction techniques for experiments. Group similar units together; randomize within blocks. Same true effect detected with smaller samples than fully-randomized designs.

In ML: stratified train/test splits, stratified A/B assignment, blocked benchmark evaluation.

<!-- tier:undergrad -->
# Blocking (Undergrad)

## The idea

A/B testing on heterogeneous traffic: mobile vs desktop users have different baseline metrics. A randomly-imbalanced split can bias results.

**Blocked design**: stratify by device type. Within each device, randomize 50/50 to treatment vs control. Both groups have the same device-type distribution.

Reduces variance in the treatment-effect estimate because the device-type variation is 'subtracted out'.

## Math

For a randomized design with blocking:
```
Var(ATE_block) = Var(ATE_random) - "between-block" variance
```

The 'between-block' variance is removed by blocking. If device type explains 50% of the outcome variance, blocking by device cuts the SE of the ATE estimate roughly in half.

## In ML

**Stratified train/test split**: stratify by class label. Standard for imbalanced datasets — without it, random splits can put all of a rare class in training (or test).

```python
from sklearn.model_selection import train_test_split
X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y)
```

**Stratified A/B testing**: stratify by user segment. Mobile/desktop, country, tenure bucket. Each segment is internally randomized 50/50.

**Stratified cross-validation**: each fold has the same class distribution.

## Common blocking variables for ML A/B

- **Device** (mobile/desktop/tablet).
- **Geography** (country, region).
- **Tenure bucket** (new user / regular / power user).
- **Subscription tier** (free / paid / enterprise).
- **Language** (often correlated with country).
- **Day of week / time of day** (for time-sensitive metrics).

Decide blocking variables based on what's known to be important for the outcome.

<!-- tier:grad -->
# Blocking (Grad)

## Latin squares + factorial

For complex experiments with multiple blocking variables, **factorial designs** (full blocking on all variable combinations) or **Latin squares** (partial blocking that achieves balance with fewer cells) are options.

In agricultural / clinical research, these are common. Rare in ML; usually one or two stratification variables is enough.

## Within-subject vs between-subject

**Between-subject**: each unit assigned to one arm only. Standard A/B.

**Within-subject** (paired design): each unit is its own control. Compare 'before' vs 'after' for the same user. More powerful (no between-unit variation), but introduces order effects + carryover.

For ML: within-subject is rare in A/B (the user's experience changes); common in benchmark evaluation (paired comparisons of model A vs model B on the same examples).

## When NOT to stratify

- **Random imbalance is small**: with large `n`, random imbalance is small; stratification adds little.
- **Stratification variables aren't predictive**: only helps if blocks have different baseline outcomes.
- **Adding too many strata**: with K strata and small n, each stratum might have unstable estimates.

For ML A/B at large scale: 1-3 stratification variables is the sweet spot. More strata → diminishing returns + complexity.

## Implementation gotchas

- **Hash function for sticky assignment**: must be deterministic + uniform. Bad hashing destroys stratification.
- **Stratum boundaries change**: user moves from 'new' to 'regular' tenure bucket mid-experiment. Reassign? Keep original assignment? Document the policy.
- **Stratum imbalance over time**: user influx changes the segment mix. The pre-vs-post comparison can be confounded by mix shift even within strata.

For most production A/B: hash by user ID + stratify by 1-2 segments + sticky assignment. This is what mature platforms (Optimizely, GrowthBook) build in.
