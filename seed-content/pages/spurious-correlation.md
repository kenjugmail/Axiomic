---
title: Spurious Correlation
category: causal
---
<!-- tier:intro -->
# Spurious Correlation

A **spurious correlation** is a statistical association between variables that doesn't reflect a direct causal relationship. The variables are correlated but not because either causes the other.

Sources of spuriousness:

- **Confounding**: a common cause drives both.
- **Collider conditioning**: selecting on a common effect creates association where there was none.
- **Time-trend coincidence**: both variables happen to trend together over the observation period.
- **Selection bias**: the sample is non-representative in a way that creates association.

Most "correlation does not imply causation" cases are spurious correlations. Recognizing them is half of causal inference.

<!-- tier:undergrad -->
# Spurious Correlation (Undergrad)

## Confounding-driven

The textbook case. `Z` causes both `X` and `Y`; `X` and `Y` are correlated but neither causes the other.

- Ice cream sales ← summer → drownings.
- Chocolate consumption ← national wealth → Nobel laureates.

Adjustment for `Z` (when observed) removes the spurious association.

## Collider-driven (Berkson's bias)

Selecting on a common effect creates spurious correlation.

**Example**: in a hospital, severity-of-disease A and severity-of-disease B are positively correlated. But in the general population they're independent. The mechanism: people are admitted when they have severe disease — of any kind. Among admittees, having mild A means you got in because of severe B (or vice versa). Selection induced negative correlation.

This is **Berkson's bias** (1946). It's not unique to medicine — any selection on a common effect produces it.

**Famous case**: in NBA data, height and basketball skill are negatively correlated among players. In the general population, they're positively correlated. Reason: NBA selection requires talent, so among NBA players, shorter players had to be more skilled to make it.

## Time-trend coincidence

Two variables that both trend over time will be correlated even if unrelated. The spurious-correlation website (Tyler Vigen) collects extreme examples — margarine consumption and divorce rates, cheese consumption and bedsheet entanglements.

Detrending (regress on time first; correlate residuals) usually kills this.

## Selection-bias driven

When the sample is non-random in a way related to both variables, association can emerge from selection alone.

**Example**: a study of the effect of helmet use on accident severity, sampled from people who came to the ER. ER visits are conditional on injury — selection on a common effect of helmet use AND accident severity. Naive analysis on this sample is biased.

The fix: random sampling, or explicit modeling of the selection mechanism.

## How to spot a spurious correlation

- The proposed causal mechanism doesn't hold up under scrutiny.
- The correlation is sensitive to the time period or sample.
- A plausible confounder isn't ruled out.
- The association vanishes when conditioning on a candidate confounder.

The hardest case: when both correlation and a plausible mechanism exist, but the mechanism is wrong (the canonical pneumonia-asthma mortality case).

<!-- tier:grad -->
# Spurious Correlation (Grad)

## Why the term is contested

"Spurious" is a contested word. Some statisticians prefer "confounded" or "non-causal" — "spurious" implies the correlation isn't real, but the correlation IS real; it's just that it doesn't reflect a direct causal relationship.

Pearl-style framing: every correlation between `X` and `Y` corresponds to SOME path in the causal DAG between them. The question is whether that path is a directed `X → ... → Y` (or reverse) or a non-causal path (backdoor or collider-conditioned). All paths produce real associations; only directed paths are causal.

## Detecting spuriousness without knowing the truth

In real research, you don't know the true causal structure. Heuristics:

1. **Pre-specify candidate confounders**. Before looking at the data, list every variable that could plausibly cause both `X` and `Y`. Adjust for them. If the association vanishes, suspect confounding.
2. **Look for time-precedence violations**. If `X` doesn't precede `Y` in time but the proposed mechanism requires it, suspect reverse causation or common cause.
3. **Look for distribution-shift patterns**. Spurious correlations are often unstable across populations, time periods, or contexts. True causal effects are more stable.
4. **Pre-specified replication**. If a correlation doesn't replicate in a new sample, suspect spuriousness.
5. **Sensitivity analysis**. Compute how strong an unobserved confounder would need to be to overturn the conclusion (E-value; Cornfield's inequality).

## Modern ML risk: shortcut learning

In neural networks, "shortcut learning" is the deep-learning analogue of spurious correlation. The model latches onto features that correlate with the label in training but aren't causally related.

**Examples**:

- Image classifiers learning to detect "tank" via the photo's lighting (military photos taken outdoors, civilian indoors).
- Pneumonia X-ray classifiers learning the hospital metadata (the metadata leaked into image headers, hospital correlated with disease prevalence).
- Sentiment classifiers learning that "movie was X" patterns predict positive sentiment regardless of `X` (because the syntax pattern correlates).

These are all spurious correlations. The fix isn't more data of the same distribution — it's distribution shift testing, causal feature engineering, or interventional training data.

## Connection to fairness

Many fairness violations are spurious correlations the model learns. A hiring model that "predicts" success from features correlated with gender + correlated with historical hiring bias is learning the bias as a spurious correlation with success.

The fairness mitigation literature can be read as causal-inference applied to ML: identify confounders (protected attributes), break their association with the prediction (pre-processing or post-processing), or learn representations that are independent of the protected attribute (in-processing).

## References

- Berkson 1946. Limitations of the application of fourfold table analysis to hospital data.
- Vigen 2015. *Spurious Correlations* (book of canonical examples).
- Geirhos et al. 2020. Shortcut learning in deep neural networks.
- VanderWeele 2017. E-values for sensitivity analysis to unmeasured confounding.
