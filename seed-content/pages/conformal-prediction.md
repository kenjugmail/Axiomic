---
title: Conformal Prediction
category: stats
---
<!-- tier:intro -->
# Conformal Prediction

A distribution-free framework for prediction intervals (regression) and prediction sets (classification) with finite-sample coverage guarantees.

For any base model: wrap it in conformal prediction; get intervals/sets that cover the true outcome with probability ≥ 1 - α.

The new default for uncertainty quantification in production ML.

<!-- tier:undergrad -->
# Conformal Prediction (Undergrad)

## Split conformal — the simplest case

For regression:

```
1. Split data into train + calibration sets.
2. Train any model M on train.
3. On calibration: compute residuals r_i = |y_i - M(x_i)|.
4. Compute the (1 - α)-quantile q of the residuals.
5. For new x_test: output [M(x_test) - q, M(x_test) + q].
```

Theorem (under exchangeability): the interval covers `y_test` with probability ≥ 1 - α.

Proof is clean: the new test residual is exchangeable with calibration residuals; ranks uniformly among them; so the test residual exceeds the q-quantile with probability α.

## For classification

Use a non-conformity score (1 - softmax_probability of the true class on calibration data). Compute the (1 - α)-quantile.

For a new test input: output the **set** of all classes whose 1 - softmax_probability is below the q-quantile.

The set typically has 1 element when the model is confident, multiple when uncertain. Larger sets = more uncertainty.

## Why this is special

- **Distribution-free**: no Gaussian assumption, no specific noise model.
- **Finite-sample valid**: not just asymptotically.
- **Model-agnostic**: works with any base model. Plug in your favorite predictor.
- **Cheap**: just a calibration set + a quantile computation.

The trade-off: intervals/sets are often wider than ideal because the framework is conservative. But the guarantee is real and unconditional.

## Practical recipe

```python
from scipy.stats import beta as beta_dist

# Calibration step
residuals = np.abs(y_cal - model.predict(X_cal))
q = np.quantile(residuals, 1 - alpha)

# Predict with conformal interval
y_pred = model.predict(X_test)
intervals = list(zip(y_pred - q, y_pred + q))
```

5 lines. Plug into any regression model.

For classification: similar, with non-conformity scores instead of residuals.

<!-- tier:grad -->
# Conformal Prediction (Grad)

## Adaptive variants

**Locally-adaptive conformal prediction**: scale the interval by an estimate of local difficulty (heteroscedasticity). Wider intervals where the model is less certain; narrower where it's confident.

**Conformalized Quantile Regression (CQR)**: fit a quantile regression model; conformalize its predictions. Better than scalar-residual conformal when the noise is heteroscedastic.

**Adaptive Prediction Sets (APS)**: for classification, build sets that adapt to per-instance difficulty. Provides more useful sets than naive conformal.

## Distribution shift

Conformal prediction assumes exchangeability between calibration + test data. Under distribution shift, the guarantee can be lost.

**Adaptive conformal prediction** (Gibbs & Candès 2021): online updates to the threshold based on observed coverage. Maintains target coverage even under shift.

Standard split conformal: assumes static distribution. Use adaptive variants when production traffic shifts.

## Marginal vs conditional coverage

Standard conformal gives **marginal coverage**: averaged across all inputs, the interval covers `y` with probability 1 - α.

It does NOT give **conditional coverage**: for any specific subgroup or input, the interval covers `y` with probability 1 - α.

Conditional coverage is harder; some methods (Mondrian conformal, group-conditional CQR) approach it for pre-specified subgroups.

For most applications: marginal coverage is the right target. Conditional coverage matters when fairness across subgroups is critical.

## Why conformal beats Bayesian for many applications

- **No prior choice**: just a calibration set.
- **No retraining**: works on top of any model.
- **Finite-sample**: Bayesian guarantees are usually asymptotic.
- **Computationally cheaper**: no MCMC.

Trade-offs: Bayesian inference gives full posteriors over parameters, not just intervals; conformal gives intervals only. For applications that need parameter-level uncertainty (e.g., scientific inference), Bayesian is still preferred. For prediction intervals, conformal is the modern default.
