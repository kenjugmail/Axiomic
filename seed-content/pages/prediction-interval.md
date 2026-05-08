---
title: Prediction Interval
category: stats
---
<!-- tier:intro -->
# Prediction Interval

An interval that's expected to contain a future observation with given probability. Distinct from confidence interval (which is about a parameter).

For a future `Y_new`: a 95% prediction interval covers `Y_new` ~95% of the time.

Standard methods: assume parametric noise (Gaussian → ±1.96 σ_pred); conformal prediction (distribution-free); Bayesian posterior predictive.

<!-- tier:undergrad -->
# Prediction Interval (Undergrad)

## Confidence vs prediction interval

**Confidence interval**: about a parameter (e.g., mean response). 'The true mean is in [a, b] with 95% confidence.'

**Prediction interval**: about a future observation. 'A new observation will be in [a, b] with 95% probability.'

Prediction intervals are wider than confidence intervals because they include both:
- Uncertainty about the parameter (the regression line's intercept + slope).
- Inherent variability of the response around the line (the noise σ²).

## Computing a prediction interval — Gaussian case

For a regression `y = β·x + ε, ε ~ N(0, σ²)`:

```
y_hat = β̂·x_new
prediction_variance = Var(β̂·x_new) + σ²    # parameter + noise
PI_95 = y_hat ± 1.96 · √prediction_variance
```

The first term shrinks with sample size. The second is irreducible noise.

For complex models (neural nets), this closed form doesn't apply. Use [[conformal-prediction]] or Bayesian methods.

## In ML

For regression problems where prediction uncertainty matters:
- **Inventory forecasting**: prediction interval on demand → safety stock.
- **Pricing**: prediction interval on willingness-to-pay.
- **Healthcare**: prediction interval on patient outcome.

A point prediction without an interval is incomplete. Two predictions of '100 units demanded' could mean very different things if one has a 95% PI of [95, 105] and the other [50, 150].

## Methods

**Parametric**: assume Gaussian noise; compute closed-form PI. Sensitive to noise model violations.

**Conformal**: distribution-free; finite-sample coverage guarantee. The new default.

**Bayesian posterior predictive**: integrate predictions over the posterior over parameters. Captures parameter + observation uncertainty. Slow but principled.

**Quantile regression**: directly estimate the 2.5% and 97.5% quantiles of `Y | X`. Different from regression of mean. Provides natural prediction intervals; can be conformalized for guaranteed coverage.

For most production ML: conformal prediction. Cheap; valid; model-agnostic.

<!-- tier:grad -->
# Prediction Interval (Grad)

## Heteroscedasticity

Real data often has noise that varies across `X`. A constant `σ²` assumption gives intervals that are too wide where noise is small, too narrow where it's large.

**Quantile regression** with conformal calibration: estimate the conditional quantiles `Q_{0.025}(Y | X)` and `Q_{0.975}(Y | X)` directly. Captures heteroscedasticity. CQR (Conformalized Quantile Regression) is the standard for production heteroscedastic prediction intervals.

## Multi-output prediction intervals

For multivariate `Y`:
- **Per-dimension intervals**: separate PI for each output. Easy; not joint.
- **Joint regions** (ellipsoids): assume Gaussian; compute via covariance.
- **Conformal sets**: works with non-conformity scores defined over the full vector.

For most applications: per-dimension PIs are fine. Joint regions matter for risk-aware multi-target problems.

## Decision-theoretic use

Prediction intervals enable risk-aware decisions:

```
expected_profit_buy = ∫ π(y) (y - cost) dy   # integrate over PI of demand
```

Optimal decisions integrate over the prediction interval (or, equivalently, the predictive distribution). Point predictions can be wildly suboptimal under risk asymmetry.

For inventory: order at the (1 - service-level)-quantile, not the mean. This is the 'newsvendor problem' classic.

## When intervals fail

- **Non-stationary distributions**: PIs assume the future is sampled from the same distribution as calibration. Distribution shift breaks them.
- **Adversarial inputs**: intervals are valid for typical inputs, not adversarial ones.
- **Out-of-distribution**: PI may extrapolate badly far from training data.

Mitigations: monitor empirical coverage in production; recalibrate periodically; flag OOD inputs separately.

The key practical recommendation: produce a prediction interval, not just a point estimate, whenever the user of the prediction makes a decision under uncertainty.
