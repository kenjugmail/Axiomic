---
title: Statistics Foundations
category: mathematics
---
<!-- tier:intro -->
# Statistics Foundations

Probability tells you how to reason from a known model to data ("if I flip this coin 100 times, what should I expect?"). Statistics is the inverse: how do you reason from data back to a model? In ML, every time we train a network, evaluate it on a held-out set, or compare two architectures, we're doing statistics — even if we don't always call it that.

## Estimation

Suppose you have a coin and you don't know whether it's fair. You flip it 100 times and get 57 heads. What's your best guess for $p$, the true probability of heads?

Two natural answers:
- The *frequentist* answer: $\hat p = 57/100 = 0.57$ — the maximum likelihood estimate.
- The *Bayesian* answer: combine the data with a prior belief about $p$. With a uniform prior, the posterior mean is $58/102 \approx 0.569$.

These usually agree on lots of data and disagree on small samples. Both perspectives appear constantly in ML.

## Maximum likelihood

If you have data $x_1, \ldots, x_n$ and a model family $p_\theta$, the maximum likelihood estimate is
$$\hat\theta = \arg\max_\theta \prod_i p_\theta(x_i)$$

— or equivalently (taking logs to make the math nicer)
$$\hat\theta = \arg\max_\theta \sum_i \log p_\theta(x_i).$$

This is exactly what training a language model does. Cross-entropy loss is the negative log likelihood — minimizing one is maximizing the other.

## Bias and variance

When you estimate something from data, two kinds of error matter:
- **Bias**: how wrong is your estimate *on average*, across many possible datasets?
- **Variance**: how much does your estimate jiggle around if you saw a different dataset?

Total error decomposes:
$$\text{MSE} = \text{Bias}^2 + \text{Variance} + \text{Noise}.$$

Big models can fit anything (low bias) but overfit easily (high variance). Small models are more stable (low variance) but miss patterns (high bias). This is the *bias-variance tradeoff*. Modern deep learning has complicated this picture (see "double descent") but the core decomposition remains useful.

## Hypothesis testing

When you compare two models — A gets 87% accuracy, B gets 88% — is the difference real or noise? Hypothesis testing gives a procedure to answer this with calibrated confidence.

The basic idea: assume there's no difference (the null hypothesis). Compute how likely you'd see a gap as big as 1% by chance. If that probability (the *p-value*) is small enough, conclude there's a real difference.

In ML, this matters for benchmark comparisons, ablation studies, and any time you're convincing skeptics that your method beats a baseline.

## Where statistics shows up in ML

- Maximum likelihood estimation is the foundation of nearly every ML training procedure.
- Cross-validation, train/test splits, and held-out evaluation are statistical practices.
- Confidence intervals on benchmark numbers are required for honest reporting.
- Bayesian methods (variational inference, Gaussian processes, deep ensembles as approximate posteriors) treat the model itself as a random variable.
- Causal inference — when you want to know whether a feature *caused* an outcome — is a statistical question that's increasingly important for safe ML.

<!-- tier:undergrad -->
# Statistics Foundations

Statistics formalizes inference from data to models. For ML, the working content is: estimators and their properties, MLE and Bayesian inference, the bias-variance tradeoff, hypothesis testing, and concentration / generalization bounds.

## Estimators

An *estimator* $\hat\theta(X_1, \ldots, X_n)$ is a function of the data targeting an unknown parameter $\theta$. Its quality is judged by:
- **Bias**: $\text{Bias}(\hat\theta) = E[\hat\theta] - \theta$
- **Variance**: $\text{Var}(\hat\theta) = E[(\hat\theta - E[\hat\theta])^2]$
- **Mean squared error**: $\text{MSE}(\hat\theta) = E[(\hat\theta - \theta)^2] = \text{Bias}^2 + \text{Var}$
- **Consistency**: $\hat\theta_n \to \theta$ in probability as $n \to \infty$
- **Asymptotic normality**: $\sqrt{n}(\hat\theta_n - \theta) \to \mathcal{N}(0, V)$ for some asymptotic variance $V$

Unbiased estimators are nice when they exist, but the MLE is generally biased in finite samples. Many "regularized" estimators (ridge regression, James-Stein) trade some bias for substantially lower variance.

## Maximum likelihood

The likelihood function for i.i.d. data $X_1, \ldots, X_n$:
$$L(\theta) = \prod_{i=1}^n p_\theta(X_i), \qquad \ell(\theta) = \sum_i \log p_\theta(X_i).$$

The MLE $\hat\theta_{\text{MLE}} = \arg\max_\theta \ell(\theta)$.

Under regularity conditions:
- **Consistency**: $\hat\theta_{\text{MLE}} \to \theta_0$ in probability.
- **Asymptotic normality**: $\sqrt{n}(\hat\theta_{\text{MLE}} - \theta_0) \to \mathcal{N}(0, I(\theta_0)^{-1})$ where $I$ is the Fisher information.
- **Asymptotic efficiency**: no consistent estimator has lower asymptotic variance (Cramér-Rao).

Cross-entropy training of language models is MLE in disguise — see [information theory](/wiki/information-theory).

## Bayesian inference

Bayes' rule for parameters:
$$p(\theta | X) \propto p(X | \theta) p(\theta).$$

The posterior $p(\theta | X)$ summarizes everything we believe about $\theta$ given the data and prior. Point estimates: posterior mean ($\hat\theta_{\text{MMSE}}$), posterior median, MAP ($\hat\theta_{\text{MAP}} = \arg\max p(\theta | X)$).

Predictive distribution:
$$p(x_{\text{new}} | X) = \int p(x_{\text{new}} | \theta) p(\theta | X) d\theta.$$

This integration over the posterior captures parameter uncertainty in predictions — something MLE doesn't do. Deep ensembles and Bayesian neural networks are practical approximations.

## Bias-variance decomposition

For squared-error loss with a fixed test point $x$ and a randomly sampled training set $D$:
$$E_D[(\hat f_D(x) - y)^2] = \underbrace{(E_D[\hat f_D(x)] - E[y | x])^2}_{\text{bias}^2} + \underbrace{\text{Var}_D[\hat f_D(x)]}_{\text{variance}} + \underbrace{\text{Var}[y | x]}_{\text{noise}}.$$

Classical ML wisdom: increasing model complexity reduces bias but increases variance, with a sweet spot in the middle.

Modern deep learning shows *double descent* (Belkin et al., 2019): test error decreases, then increases (classical regime), then decreases *again* in the highly overparameterized regime. This is one of the central empirical surprises of modern ML and is the subject of ongoing theoretical work.

## Hypothesis testing

Setup: null hypothesis $H_0$, alternative $H_1$, test statistic $T$, decision rule based on $T$.

Two error types:
- Type I (false positive): reject $H_0$ when true. Probability: $\alpha$ (significance level).
- Type II (false negative): fail to reject $H_0$ when false. Probability: $\beta$. Power = $1 - \beta$.

The $p$-value: probability of observing a $T$ at least as extreme as the data, under $H_0$. If $p < \alpha$, reject.

For comparing two model accuracies on a shared test set, McNemar's test or paired bootstrap CIs are appropriate. For benchmark comparisons across many models, multiple-testing corrections (Bonferroni, FDR) matter.

## Cross-validation

When you split your data into train/validation/test, you're empirically estimating generalization error. $k$-fold CV partitions data into $k$ folds, trains on $k-1$, evaluates on the remaining one, averages. Reduces variance of the estimate compared to a single split.

CV is itself a statistical estimator with bias and variance — and its behavior under model selection (especially when many hyperparameters are tuned) is subtle. Hold out a final test set you never look at.

## Confidence intervals

A $(1-\alpha)$ confidence interval contains the true parameter with probability $\geq 1-\alpha$ over repeated samples. For asymptotically normal estimators:
$$\hat\theta \pm z_{\alpha/2} \, \widehat{\text{SE}}(\hat\theta).$$

For ML benchmarks, bootstrap CIs are usually best — they don't require parametric assumptions about the loss distribution.

## Concentration and generalization

For bounded losses, Hoeffding gives:
$$P(|\hat L_{\text{train}} - L_{\text{true}}| \geq t) \leq 2 \exp(-2nt^2 / R^2)$$

— with rate $1/\sqrt{n}$, the empirical risk concentrates around the true risk. Combined with uniform convergence over a hypothesis class (VC dimension, Rademacher complexity), this gives generalization bounds.

These classical bounds are *vacuous* for deep networks (predicted gap $\gg$ observed gap). Modern bounds (PAC-Bayes, compression-based, NTK) attempt to close this gap.

## Connections to ML

- **Training** is MLE; test loss is a frequentist estimator of true loss.
- **Cross-validation** is a statistical procedure with its own bias/variance properties.
- **Reporting**: confidence intervals on benchmarks, paired tests for ablations.
- **[RLHF](/wiki/rlhf)** uses Bradley-Terry preference models — pairwise comparison statistics translated into reward learning.
- **Calibration**: a model is calibrated if its confidence equals its accuracy. Modern LLMs are systematically miscalibrated (Guo et al., 2017); temperature scaling and Platt scaling fix this post-hoc.

<!-- tier:grad -->
# Statistics Foundations

Modern ML draws from non-parametric statistics, high-dimensional statistics, causal inference, and Bayesian decision theory. This page sketches the research-fluent connections.

## High-dimensional statistics

In modern ML, $p$ (parameters) is typically $\gg n$ (samples). Classical asymptotics (which assume $p$ fixed and $n \to \infty$) often break down. Useful frameworks:

- **Random matrix theory**: the spectrum of sample covariances converges to Marchenko-Pastur distributions; this drives phenomena like double descent.
- **Compressed sensing**: with $p \gg n$ but signal $s$-sparse, $O(s \log p)$ samples suffice. LASSO, basis pursuit.
- **High-dimensional concentration**: subgaussian tails, matrix Bernstein, generic chaining (Talagrand) — all needed when the target quantity is a function of many random variables.

Bai-Yin, Wainwright's text *High-Dimensional Statistics* is the standard reference.

## PAC-Bayes and generalization

Classical PAC bounds: $E[L_{\text{test}}] \leq L_{\text{train}} + O(\sqrt{\text{complexity}/n})$. For neural networks, complexity terms are huge; bounds are vacuous.

PAC-Bayes (McAllester, 1999): for any prior $P$ over parameters, with probability $\geq 1 - \delta$ over the data, for any posterior $Q$:
$$E_{w \sim Q}[L_{\text{test}}(w)] \leq E_{w \sim Q}[L_{\text{train}}(w)] + \sqrt{\frac{D_{KL}(Q \| P) + \log(1/\delta)}{2(n-1)}}.$$

Choosing $Q$ to be a Gaussian centered on the trained weights gives non-vacuous bounds (Dziugaite & Roy, 2017). Recent work (Jiang et al., 2020) shows PAC-Bayes is the most predictive of the modern complexity measures.

## Causal inference

Most ML predicts $P(Y | X)$. Causal inference is about $P(Y | \text{do}(X))$ — interventional, not observational. Key formalisms:

- **Pearl's structural causal models**: directed acyclic graphs over variables; $\text{do}$ operators; back-door and front-door adjustments.
- **Potential outcomes** (Rubin): each unit has counterfactual outcomes $Y(0), Y(1)$; identification under unconfoundedness.
- **Instrumental variables, regression discontinuity, difference-in-differences**: observational identification strategies.

Why this matters for ML:
- **Spurious correlation** is a major source of failure modes (Geirhos et al., 2020).
- **Distribution shift** decomposes into shifts in $P(X)$, $P(Y | X)$, and the underlying causal mechanism — different shifts demand different remedies.
- **Counterfactual fairness** uses causal models to specify fairness criteria.
- **Causal representation learning** (Schölkopf et al., 2021) is an active research program.

## Empirical processes

The supremum of an empirical process — $\sup_{f \in F} |E_n[f] - E[f]|$ — controls uniform deviation. Bounds via Rademacher complexity:
$$E[\sup_f |E_n f - E f|] \leq 2 R_n(F).$$

For neural networks, Rademacher complexity scales with weight norms (Bartlett et al., 2017; Neyshabur et al., 2018) — informative but not always tight.

Talagrand's chaining and generic chaining give sharp bounds for Gaussian and sub-Gaussian processes; these underlie modern bounds on neural network generalization.

## Density estimation and minimax rates

Estimating $p(x)$ from i.i.d. samples has known minimax rates:
- For $p$ with $s$ derivatives in $d$ dimensions: $n^{-s/(2s+d)}$ in $L^2$.
- Curse of dimensionality: rate degrades exponentially in $d$.

Neural-network density estimators (normalizing flows, autoregressive models, score-based) circumvent this by leveraging structure — the data lives on a low-dimensional manifold. Quantifying when this works is an active research area.

## Bayesian deep learning

Exact Bayesian inference for neural networks is intractable. Approximations:
- **Laplace approximation**: Gaussian centered at MAP, covariance from Hessian inverse.
- **Variational inference**: minimize $D_{KL}(q_\phi(\theta) \| p(\theta | X))$.
- **MCMC**: Hamiltonian Monte Carlo, SGLD (Welling & Teh, 2011).
- **Deep ensembles**: train $K$ models from different inits; treat as samples from an implicit posterior. Surprisingly effective (Lakshminarayanan et al., 2017; Wilson & Izmailov, 2020).

The recent *neural network Gaussian process* and NTK perspectives give exact posterior inference for infinite-width networks via kernel methods.

## Statistical decision theory

Loss $\ell(\theta, a)$, action $a$, parameter $\theta$. Bayes risk:
$$R(\pi, \delta) = E_\theta E_X[\ell(\theta, \delta(X))]$$

The Bayes optimal decision $\delta^*(x) = \arg\min_a E[\ell(\theta, a) | X = x]$ minimizes posterior expected loss. Predictions from a calibrated probabilistic model are exactly Bayes optimal under cross-entropy.

This frames many ML choices as decision-theoretic:
- **Calibration** (Guo et al., 2017): match confidence to accuracy.
- **Selective prediction**: abstain when uncertain.
- **Active learning**: choose queries to minimize expected loss.
- **Conformal prediction** (Vovk et al., 2005): distribution-free prediction sets with marginal coverage guarantees.

## Where to go next

- **Robust statistics**: estimation under contamination, M-estimators, Huber loss.
- **Sequential analysis**: bandits, online learning, regret minimization.
- **Distribution-free inference**: conformal prediction, jackknife+, stability-based bounds.
- **Causal ML**: representation learning, treatment-effect estimation, confounder adjustment in deep models.
- **Differential privacy**: $(\epsilon, \delta)$-DP, the privacy-utility tradeoff for training, DP-SGD.
