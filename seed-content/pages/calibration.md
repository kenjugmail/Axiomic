---
title: Model Calibration
category: stats
---
<!-- tier:intro -->
# Calibration

A model is well-calibrated when its predicted probabilities match empirical frequencies. A model that says '70% likely' should be right 70% of the time when it makes such predictions.

Modern neural networks are typically poorly calibrated — they're systematically overconfident.

The fix: temperature scaling, Platt scaling, isotonic regression. Cheap; effective; standard.

<!-- tier:undergrad -->
# Calibration (Undergrad)

## Reliability diagram

Bin model predictions by confidence (0-10%, 10-20%, ..., 90-100%). For each bin, plot mean confidence vs empirical accuracy.

A perfectly calibrated model: 45° line.

Overconfident model: predictions are too peaked; the high-confidence bin's accuracy is below the line.

Underconfident model: predictions are too uniform; high-confidence bin's accuracy is above the line.

Modern deep nets typically show overconfidence. ECE (expected calibration error) of 5-15% is common after standard cross-entropy training.

## Why calibration matters

**Decision-making**: a hospital uses model predictions to triage patients. 'High risk' must mean what it says.

**Stratifying interventions**: send the discount only to users with > 60% churn probability. Wrong probabilities → wrong segmentation.

**Combining models**: ensembles of badly-calibrated models compound the error.

**Active learning**: select examples for labeling based on uncertainty. Misjudged uncertainty → wasted labels.

## Calibration methods

**Temperature scaling** (Guo 2017): post-hoc. Divide logits by a learned temperature `T`. One scalar parameter; trained on a held-out set with cross-entropy.

For overconfident models: `T > 1` smooths the softmax. Reduces ECE; preserves accuracy. The standard fix.

**Platt scaling**: logistic regression on top of model outputs. More flexible than temperature scaling; same idea.

**Isotonic regression**: non-parametric. Fits a monotone non-decreasing function from confidence to calibrated confidence. Most flexible; risks overfitting on small calibration sets.

**During training**: focal loss, label smoothing, mixup all implicitly help calibration. Less reliable than post-hoc methods.

## Practical recipe

1. Train model normally.
2. Hold out a calibration set (typically 1-5K examples).
3. Apply temperature scaling: optimize `T` to minimize cross-entropy on the held-out set.
4. Re-evaluate calibration via reliability diagram + ECE.

Takes ~1 minute of compute. Fixes most calibration problems.

<!-- tier:grad -->
# Calibration (Grad)

## ECE vs alternatives

**Expected Calibration Error (ECE)**: bin predictions; compute weighted absolute difference between confidence and accuracy. Most common metric. Sensitive to bin choice.

**Maximum Calibration Error (MCE)**: max instead of mean. Captures worst-case miscalibration.

**Brier score**: mean squared error between predictions and one-hot labels. Decomposes into reliability (calibration) + resolution (separation between classes) + uncertainty.

**Reliability diagram visualization**: most informative; shows where in the confidence spectrum the model is miscalibrated.

For ECE specifically: standard binning at 10-15 bins; compute mean across bins weighted by bin size. Modern variants (adaptive binning, ECE with continuous estimators) reduce sensitivity to bin choice.

## Multi-class calibration

For K classes, calibration is per-class:
- Top-class calibration: focus on the most-confident class. Most common.
- Per-class calibration: each class's predicted probability matches its empirical frequency.
- Joint calibration: all classes jointly. Hardest.

Top-class calibration is what most calibration methods optimize. For applications that act on multi-class probabilities (e.g., conformal prediction), per-class calibration matters more.

## When calibration isn't the right goal

For some applications:
- **Ranking** (recommender systems): order matters more than absolute probabilities. Calibration is unnecessary.
- **Threshold-based decisions**: only the threshold-crossing matters. Slight miscalibration around the threshold is fine.
- **Regression**: 'calibration' becomes prediction-interval coverage, which is a different problem (use [[conformal-prediction]]).

For most production ML: calibrate when the model serves probabilities to downstream consumers. Skip when it's a pure ranker or threshold classifier.

## Calibration drift

A well-calibrated model can become miscalibrated over time as the data distribution shifts.

Monitor calibration in production:
- Per-day reliability diagram.
- ECE trend over time.
- Alert when ECE exceeds a threshold (e.g., > 5%).

Re-fit temperature scaling periodically to re-calibrate. Cheap; standard practice in mature production stacks.
