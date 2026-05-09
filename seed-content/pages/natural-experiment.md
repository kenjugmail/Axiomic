---
title: Natural Experiment
category: causal
---
<!-- tier:intro -->
# Natural Experiment

A setting where some external event randomly (or quasi-randomly) assigned treatment without a researcher planning it. The randomness comes from the world, not the lab.

Famous examples:

- **Vietnam draft lottery**: birth dates randomly determined draft eligibility. Used to estimate causal effects of military service.
- **Maimonides' rule (Israeli class size)**: a regulatory cap at 40 students per class created sharp variation just above and below the threshold.
- **School admission lotteries**: oversubscribed schools admitted by lottery.
- **Weather variation**: rain on election day affects turnout differentially.

Natural experiments are precious. They give you randomization-style identification in settings where deliberate randomization is impossible.

<!-- tier:undergrad -->
# Natural Experiment (Undergrad)

## What makes something a natural experiment

The key: an exogenous source of variation that affects the treatment of interest but doesn't directly affect the outcome.

This is the IV (instrumental variable) story told from the perspective of the data-generating process. Natural experiments are sources of valid instruments.

The defense of "exogeneity" is everything. The data is silent on whether the source is truly exogenous; you defend it from domain knowledge, history, or institutional rules.

## Famous natural experiments

**Angrist 1990 (Vietnam draft lottery)**: birth dates were randomly assigned draft priority. Random with respect to potential outcomes (no one chose their birthday based on future earnings). Used as IV for military service to estimate veterans' lifetime earnings.

**Angrist & Krueger 1991 (quarter of birth)**: birth quarter affects when you can leave school (compulsory-attendance laws + school-cohort cutoffs). Used as IV for years of schooling. Famous + famously contested instrument.

**Angrist & Lavy 1999 (Maimonides' rule)**: a class >40 had to be split. Schools just above and below 40 students enrolled were near-randomly different in class size. RDD-style identification of class-size effects on test scores.

**Acemoglu, Johnson, Robinson 2001 (settler mortality)**: 19th-century European-settler mortality rates predict modern institutions. Used as IV for institutions when estimating effects on modern income. Strong + heavily critiqued.

**Imbens, Rubin, Sacerdote 2001 (Massachusetts lottery winners)**: lottery wins are random; used to estimate effect of unearned income on labor supply.

**Card 1990 (Mariel boatlift)**: 125,000 Cubans arrived in Miami in 1980. Compared Miami labor market to other cities (DiD design). Estimates immigration effects on wages.

## How to defend a natural experiment

The case for an instrument is built on context, not data:

1. **Relevance**: argue (and verify with first-stage F-statistic) that the instrument predicts treatment.
2. **Exogeneity**: argue from the source of the variation that it's plausibly random with respect to the outcome.
3. **Exclusion restriction**: argue that the instrument doesn't affect the outcome through any other path.

The exclusion restriction is the hardest. For Vietnam draft, exogeneity is overwhelming; for quarter of birth, less so (could correlate with parental SES, school quality, etc.); for settler mortality, very contested (could correlate with disease environments that affect modern productivity).

Good natural-experiment papers spend significant space defending these assumptions explicitly.

## Quasi-experiments + natural experiments

The terms are nearly synonymous. "Quasi-experiment" emphasizes that the design imitates an experiment without explicit randomization; "natural experiment" emphasizes the natural origin of the variation. Different research traditions use one or the other.

The methodologies are the same: IV, RDD, DiD, synthetic controls. All exploit naturally-occurring variation for causal identification.

<!-- tier:grad -->
# Natural Experiment (Grad)

## Heterogeneous returns + LATE

Most natural-experiment estimates are LATE — local average treatment effects on compliers. The compliers are the units whose treatment status responds to the natural variation.

For Vietnam draft: compliers are men whose service depended on the lottery (high lottery number → didn't serve; low number → served). The estimated effect applies to this subpopulation, not necessarily to volunteer servicemen or everyone.

This is a feature, not a bug. The LATE is often the policy-relevant quantity (the effect of marginal recruitment policy changes). But it's important to name what subpopulation the estimate applies to.

## Threats to natural-experiment validity

**Violation of exclusion restriction**: the natural variation affects the outcome through paths other than the treatment of interest. Example: quarter of birth might affect school cohort effects, not just years of schooling.

**Weak instrument**: the natural variation has only a small effect on treatment. Bound, Jaeger, Baker (1995) showed weak instruments amplify bias from any small exogeneity violation.

**Selection**: the population subject to the natural experiment isn't representative. Generalizability concerns.

**Manipulation**: agents respond to the rule that creates the natural experiment, breaking the randomization. Example: parents timing births to game school cohort cutoffs.

The strongest natural experiments combine:

- Genuine randomization (lottery, weather).
- Strong first stage (large effect on treatment).
- No plausible alternative paths to the outcome (clean exclusion).

These three are rare; most published natural experiments compromise on at least one.

## Modern critique + replication

The "credibility revolution" in economics (Angrist & Pischke 2009, *Mostly Harmless Econometrics*) was largely a push toward natural experiments + RDD + IV.

Subsequent critique:

- Many famous instruments are weak, contested, or barely-significant.
- Replication studies sometimes fail to recover original results with updated data.
- Heterogeneous-effects + small-compliance-rates can make LATEs uninformative for policy.

The current best practice: use natural experiments where they're clean; report LATE explicitly; sensitivity-analyze the assumptions.

## Connection to A/B testing

A/B tests are deliberately-engineered natural experiments. Same identifying logic: random assignment of treatment makes the difference in observed outcomes a valid causal estimate.

The methodologies (sequential testing, CUPED, HTE estimation, multiple-testing correction) developed in industry A/B testing are largely natural-experiment econometrics applied to web-scale data.

## References

- Angrist 1990. Lifetime earnings and the Vietnam draft lottery. *AER*.
- Angrist & Krueger 1991. Does compulsory school attendance affect earnings? *QJE*.
- Angrist & Lavy 1999. Maimonides' rule. *QJE*.
- Imbens & Angrist 1994. Identification and estimation of LATE. *Econometrica*.
- Angrist & Pischke 2009. *Mostly Harmless Econometrics*. (The textbook.)
