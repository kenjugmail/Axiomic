---
title: Uplift Modeling
category: causal
---
<!-- tier:intro -->
# Uplift Modeling

The marketing-industry framing of CATE estimation, focused on the actionable question: who responds differently if treated vs not?

The goal is to rank users by predicted treatment effect and target the top-N. This concentrates intervention budget on the users who'd actually be moved by it.

**Four user types** (relative to a binary treatment):

- **Persuadables**: would convert if treated; wouldn't if untreated. **Targeting goal.**
- **Sure-things**: convert regardless. Treatment wasted.
- **Lost-causes**: don't convert regardless. Treatment wasted.
- **Sleeping-dogs**: would convert untreated; wouldn't if treated. Treatment harms.

Naive "predict who's likely to convert" targets sure-things; uplift targets persuadables.

<!-- tier:undergrad -->
# Uplift Modeling (Undergrad)

## Why uplift beats prediction

Imagine an email-discount campaign:

- 1000 users.
- 200 sure-things (will buy regardless).
- 600 lost-causes (won't buy regardless).
- 150 persuadables (will buy iff discounted).
- 50 sleeping-dogs (will buy iff NOT discounted; the discount looks suspicious to them).

**Naive prediction targeting**: rank by `P(buy | features)`. The sure-things look "likely to buy" → high rank → get discounted. Sure-things buy; the discount is wasted.

**Uplift targeting**: rank by `τ(x) = P(buy | treated, x) - P(buy | not treated, x)`. Persuadables have `τ ≈ 1`; sure-things have `τ ≈ 0`; sleeping-dogs have `τ < 0`. Top of the ranking is persuadables. Discounts target the right group.

Cost difference can be 50%+ on the same campaign. This is why every major marketing-tech company has uplift in its stack.

## Estimation

Same techniques as CATE estimation:

- **T-learner**: separate models for treated and control; subtract.
- **S-learner**: one model on `(T, X)`; difference predictions at `T = 0` and `T = 1`.
- **X-learner**: hybrid; impute missing potential outcomes.
- **R-learner**: doubly-robust.
- **Causal forests**: forest-based with valid CIs.

In production: `econml`, `causalml` (Uber), `pylift`, `CausalLift`. All implement these methods + uplift-specific evaluation.

## Evaluation: the Qini curve

Standard ML metrics (accuracy, AUC) don't measure uplift quality.

**Qini curve**: plot the cumulative incremental conversions as a function of the fraction of the population targeted (ranked by uplift score). The curve starts at (0, 0) and ends at (1, total_incremental_conversions).

A perfect uplift model puts all persuadables first, all sure-things and lost-causes in the middle, all sleeping-dogs last. The Qini curve rises steeply, then flattens, then declines (sleeping-dogs).

**Random ranking** is the diagonal. **Above the diagonal** = better than random.

**Qini coefficient** (analogous to AUC): area between the Qini curve and the diagonal. Higher = better uplift estimation.

## Practical notes

**Need a randomized training set**: uplift models train on random A/B-test data. Selection-on-takeup data (some users self-selected into treatment) is biased and produces wrong uplift scores.

**Sleeping dogs are real**: in many markets, ~5-10% of users react adversely to the treatment. Targeting models that ignore this miss revenue.

**Production constraints**: target the top-N where N is determined by budget. The uplift model gives the ranking; the budget cap gives the threshold.

**Regular retraining**: behavior drifts; uplift models need retraining (every few months in fast-moving markets).

<!-- tier:grad -->
# Uplift Modeling (Grad)

## Connection to CATE

Uplift IS CATE estimation. The four-type framework is a particular interpretation of the CATE function:

- Persuadables: `τ(x) > 0` (large).
- Sure-things: `Y(0, x) = 1`, `Y(1, x) = 1`. `τ(x) ≈ 0`.
- Lost-causes: `Y(0, x) = 0`, `Y(1, x) = 0`. `τ(x) ≈ 0`.
- Sleeping-dogs: `τ(x) < 0`.

Note: types 2 and 3 (sure-things, lost-causes) both have `τ ≈ 0` but for different reasons. Uplift targeting can't distinguish them — and doesn't need to.

## Class-transformed-target methods

**Class transformation** (Lo 2002): convert the uplift problem to a classification problem.

Define `Z = Y · (T - 0.5) · 2`. Then `E[Z | X] = τ(x)` under randomization. Train ANY classification model on `Z`; it estimates uplift.

Pro: any off-the-shelf algorithm works; no special architecture needed.
Con: requires randomized treatment assignment.

## Direct uplift modeling

Some methods estimate uplift directly without going through CATE:

**Uplift trees** (Rzepakowski-Jaroszewicz 2010, 2012): decision trees with uplift-specific splitting criteria.

**Squared-Loss Uplift Modeling**: minimize squared error of estimated uplift relative to observed differences.

These are conceptually equivalent to T-learner / X-learner with specific base learners. Marketing-industry naming + framing.

## Multi-treatment uplift

When there are multiple treatments (different discounts, different messaging), uplift extends:

- Pairwise CATEs against control.
- Best-arm prediction: pick the treatment maximizing uplift per user.
- Multi-armed bandit framing: explore + exploit.

Tooling: `causalml` (Uber) supports multi-treatment uplift natively.

## Off-policy evaluation

Once you have an uplift model + a candidate policy `π(x)` (which treatment to give each user), how do you evaluate the policy without deploying it?

**Direct method**: estimate `V(π) = E[Y(π(X))]` from the model.
**IPW**: weight observed outcomes by `1/π_obs(T | X)` to estimate counterfactual outcomes.
**Doubly-robust**: combine both.

This is identical to off-policy evaluation in contextual bandits.

## Threshold optimization

Given uplift scores, choose a targeting threshold:

- **Profit maximization**: target users with `τ̂(x) > c / m` where `c` is treatment cost and `m` is conversion margin.
- **Budget constraints**: target top-N where N satisfies budget.
- **Constrained optimization**: fairness + budget + targeting jointly.

## Connection to RL

Uplift = causal effect of action vs no-action. In RL terminology, this is the **advantage function** for binary actions. Modern off-policy RL methods (Q-learning, doubly-robust off-policy) draw heavily on causal-inference techniques developed for uplift.

## References

- Radcliffe & Surry 2011. *Real-World Uplift Modeling with Significance-Based Uplift Trees*. (Industry standard reference.)
- Lo 2002. The true lift model — a novel data mining approach. *SIGKDD Explorations*.
- Rzepakowski & Jaroszewicz 2010. Decision trees for uplift modeling. *ICDM*.
- Künzel et al. 2019. Metalearners for estimating heterogeneous treatment effects. *PNAS*.
- Athey & Wager 2021. Policy learning with observational data. *Econometrica*.
