---
title: Probability Foundations
category: mathematics
---
<!-- tier:intro -->
# Probability Foundations

Probability is the language we use to reason about uncertainty. In machine learning, almost everything is probabilistic at its core: a language model predicts a probability distribution over the next token, a classifier outputs a probability for each class, training itself is the search for parameters that make the data more probable.

You don't need a full course in measure theory to use ML, but you do need fluent intuition about a few key ideas.

## Random variables and distributions

A *random variable* is something whose value is uncertain: the outcome of a die roll, the next word in a sentence, the height of a randomly chosen person. A *distribution* tells you which values are how likely.

For a discrete random variable (like a token from a vocabulary), a distribution is a list of probabilities — one per possible value, summing to 1. For a continuous random variable (like a temperature reading), it's a density function whose area under the curve equals 1.

## The distributions you'll meet

- **Bernoulli**: a single coin flip with probability $p$ of heads. Models any yes/no event.
- **Categorical**: a die with $K$ faces, each with its own probability. Every language model output is a categorical distribution over the vocabulary.
- **Gaussian (normal)**: the bell curve. Shows up everywhere — initialization noise, measurement error, the central limit theorem.
- **Uniform**: every value in some range is equally likely. Used as a baseline.

## Expectation

The expectation $E[X]$ is the average value of a random variable, weighted by probabilities. For a fair six-sided die, $E[X] = 3.5$ — even though no individual roll gives 3.5.

Expectation is the workhorse of probabilistic reasoning. Loss functions in ML are expectations: you want the *average* loss across the data distribution to be small.

## Conditional probability

$P(A | B)$ — read "the probability of A given B" — is the probability of $A$ once you know $B$ has happened. It's how new information updates beliefs.

In ML, language models compute conditional distributions: $P(\text{next token} | \text{context})$. The whole architecture is built to estimate this conditional well.

## Bayes' rule

The single most useful formula:
$$P(A | B) = \frac{P(B | A) \, P(A)}{P(B)}$$

It lets you flip a conditional. Given how often the test is positive when someone has the disease, plus the disease's base rate, you can compute how likely someone with a positive test actually has the disease. Bayes' rule underpins generative modeling, latent variable models, and Bayesian inference.

## Where probability shows up in transformers

- The output of a transformer is a probability distribution over the vocabulary, computed by [softmax](/wiki/softmax).
- [Sampling strategies](/wiki/sampling-strategies) (greedy, top-k, top-p, temperature) are all ways of drawing from that distribution.
- [Cross-entropy loss](/wiki/loss-functions) measures how surprised the model is by the true next token — a quantity from probability theory.
- [Dropout](/wiki/dropout) is a stochastic regularization technique whose effect is analyzed probabilistically.

<!-- tier:undergrad -->
# Probability Foundations

Probability theory is the formal calculus of uncertainty. For ML, the working content is: probability spaces, random variables, common distributions, expectation and variance, conditional probability and independence, and the law of large numbers / central limit theorem.

## Probability spaces

A probability space is a triple $(\Omega, \mathcal{F}, P)$:
- $\Omega$ is the *sample space* of possible outcomes
- $\mathcal{F}$ is a $\sigma$-algebra of *events* (subsets of $\Omega$ we can assign probability to)
- $P : \mathcal{F} \to [0, 1]$ assigns probabilities, with $P(\Omega) = 1$ and countable additivity

A *random variable* $X$ is a function $\Omega \to \mathbb{R}$ (with measurability). Its *distribution* is the pushforward measure $P_X(A) = P(X^{-1}(A))$.

For ML, you can usually treat sample spaces informally and focus on distributions.

## Discrete and continuous distributions

For a discrete random variable taking values in $\{x_1, x_2, \ldots\}$, its distribution is captured by the probability mass function (PMF) $p(x_i) = P(X = x_i)$.

For a continuous random variable on $\mathbb{R}$, its distribution is captured by a probability density function (PDF) $f(x) \geq 0$ with $\int f(x) dx = 1$, and $P(a \leq X \leq b) = \int_a^b f(x) dx$.

The Gaussian (normal) distribution:
$$\mathcal{N}(x; \mu, \sigma^2) = \frac{1}{\sqrt{2\pi\sigma^2}} \exp\left(-\frac{(x - \mu)^2}{2\sigma^2}\right)$$

is parameterized by mean $\mu$ and variance $\sigma^2$. Multivariate Gaussian: $\mathcal{N}(x; \mu, \Sigma) \propto \exp(-\frac{1}{2}(x - \mu)^T \Sigma^{-1} (x - \mu))$.

## Expectation, variance, covariance

Expectation linearizes: $E[aX + bY] = a E[X] + b E[Y]$ regardless of dependence. This is the most useful property in probability — you don't need independence to take expectations of sums.

Variance: $\text{Var}(X) = E[(X - E[X])^2] = E[X^2] - E[X]^2$.

Variance is *not* linear: $\text{Var}(aX + bY) = a^2 \text{Var}(X) + b^2 \text{Var}(Y) + 2ab \, \text{Cov}(X, Y)$.

If $X, Y$ are independent, $\text{Cov}(X, Y) = 0$ and the cross term vanishes — but uncorrelated does not imply independent in general.

## Conditional probability and Bayes

$$P(A | B) = \frac{P(A \cap B)}{P(B)}, \quad P(B) > 0$$

For random variables, conditional distributions are well-defined when densities exist:
$$f_{X | Y}(x | y) = \frac{f_{X, Y}(x, y)}{f_Y(y)}$$

Bayes' rule:
$$f_{X | Y}(x | y) = \frac{f_{Y | X}(y | x) f_X(x)}{f_Y(y)}$$

This is the engine of probabilistic generative modeling — given a likelihood and a prior, infer the posterior.

## Concentration: LLN and CLT

The *weak law of large numbers* says sample means converge to the true mean: for i.i.d. $X_i$ with finite mean $\mu$,
$$\frac{1}{n} \sum_{i=1}^n X_i \to \mu \quad \text{in probability as } n \to \infty.$$

The *central limit theorem* tells you the rate and shape: 
$$\sqrt{n} \left(\frac{1}{n} \sum_{i=1}^n X_i - \mu\right) \to \mathcal{N}(0, \sigma^2) \quad \text{in distribution.}$$

These results justify why empirical risk minimization works and how confidence intervals are computed — including the practice of estimating an LLM's loss on a held-out set.

## Information-theoretic quantities

Entropy of a discrete distribution $p$:
$$H(p) = -\sum_x p(x) \log p(x)$$

KL divergence between $p$ and $q$:
$$D_{KL}(p \| q) = \sum_x p(x) \log \frac{p(x)}{q(x)}$$

These are not symmetric in general, and $D_{KL} \geq 0$ with equality iff $p = q$.

Cross-entropy: $H(p, q) = H(p) + D_{KL}(p \| q) = -\sum_x p(x) \log q(x)$. This is the standard [language modeling loss](/wiki/loss-functions): with $p$ as the data distribution and $q$ as the model.

## Connections to ML

- Cross-entropy training: minimizing $H(p_{\text{data}}, p_{\text{model}})$ is equivalent to minimizing $D_{KL}(p_{\text{data}} \| p_{\text{model}})$ since $H(p_{\text{data}})$ is constant.
- [Sampling](/wiki/sampling-strategies) draws from a categorical distribution; [temperature](/wiki/temperature) modifies its entropy.
- VAEs minimize a KL divergence to a Gaussian prior; [RLHF](/wiki/rlhf) explicitly penalizes KL from a reference policy.

<!-- tier:grad -->
# Probability Foundations

Modern ML draws from measure-theoretic probability, information theory, and stochastic processes. This page sketches the connections at a research-fluent level.

## Measure theory in three sentences

A measure $\mu$ on $(\Omega, \mathcal{F})$ assigns $[0, \infty]$ to events with countable additivity. A probability measure has $\mu(\Omega) = 1$. Random variables are measurable functions; expectation is integration against the probability measure: $E[X] = \int X \, dP$. Densities exist (Radon-Nikodym) when one measure is absolutely continuous with respect to another.

The reason this matters for ML: when you write $\nabla_\theta E_{x \sim p_\theta}[f(x)]$, the question of when you can swap gradient and expectation is a measure-theoretic one. The reparameterization trick (Kingma & Welling, 2014) and score function estimator (REINFORCE) give two answers under different conditions.

## Conditional expectation as projection

For random variables $X, Y$ with $E[X^2] < \infty$, the conditional expectation $E[X | Y]$ is the orthogonal projection of $X$ onto the space of measurable functions of $Y$ (in $L^2$). It minimizes mean squared error: $E[X | Y] = \arg\min_g E[(X - g(Y))^2]$.

This is exactly what regression does — and it's why training a regressor on cross-entropy or MSE loss approximates the conditional expectation of the target given the input. For language models, the optimal next-token predictor is $E[e_{w_{t+1}} | w_{1:t}]$ where $e_w$ is the one-hot vector of word $w$ — i.e., the true conditional distribution.

## KL divergence and information geometry

KL is the unique divergence (up to scaling) satisfying:
- Non-negativity, zero iff equal
- Information processing inequality: $D_{KL}(P_X \| Q_X) \geq D_{KL}(P_{f(X)} \| Q_{f(X)})$
- Chain rule: $D_{KL}(P_{X, Y} \| Q_{X, Y}) = D_{KL}(P_X \| Q_X) + E_{X \sim P}[D_{KL}(P_{Y | X} \| Q_{Y | X})]$

The Fisher information $I(\theta) = E[(\nabla_\theta \log p_\theta(x))(\nabla_\theta \log p_\theta(x))^T]$ is the second-order term in the Taylor expansion of $D_{KL}(p_\theta \| p_{\theta + d\theta})$. The associated *natural gradient* (Amari, 1998) preconditions optimization in the metric induced by Fisher information — a perspective that motivates K-FAC, Shampoo, and modern second-order methods.

## Concentration inequalities

When mean $\to$ tail, you need concentration:
- **Markov**: $P(|X| \geq t) \leq E[|X|] / t$
- **Chebyshev**: $P(|X - \mu| \geq t) \leq \sigma^2 / t^2$
- **Hoeffding**: for bounded i.i.d. variables, $P(|\bar{X} - \mu| \geq t) \leq 2 \exp(-2nt^2 / R^2)$
- **Bernstein** and **sub-Gaussian** generalizations: tighter when variance is small relative to range

These power generalization bounds (PAC-Bayes, Rademacher) and the exploration-exploitation tradeoff in bandits / RL.

## Stochastic processes for training

SGD itself is a stochastic process. Its continuous-time limit (under appropriate scaling) is the Langevin SDE
$$d\theta_t = -\nabla L(\theta_t) dt + \sqrt{2\beta^{-1}} \, dW_t$$

whose stationary distribution is $p(\theta) \propto \exp(-\beta L(\theta))$. The implicit *temperature* $\beta$ explains why SGD prefers flat minima: high-temperature exploration finds them, low-temperature exploitation settles in.

For sequence models, the data themselves are stochastic processes. Mixing-time arguments matter for in-context learning analyses; ergodicity arguments matter for offline RL.

## Exchangeability and de Finetti

A sequence $X_1, X_2, \ldots$ is exchangeable if its distribution is invariant under permutation. de Finetti's theorem says any infinite exchangeable sequence is a mixture of i.i.d. sequences:
$$P(X_1, \ldots, X_n) = \int \prod_{i=1}^n P_\theta(X_i) \, \mu(d\theta)$$

This justifies the Bayesian posture: any time you assume the data are exchangeable, there is a latent parameter you can integrate over. Modern transformers learn exchangeable structures implicitly via in-context learning — connections to de Finetti are an active area (Garg et al., 2022; Müller et al., 2022).

## Where to go next

- **Empirical processes**: VC theory, Rademacher complexity, generalization without independence assumptions.
- **Optimal transport**: Wasserstein distances, Monge / Kantorovich, used in generative modeling and distribution-matching losses.
- **Stochastic calculus**: SDEs, Itô integrals, score-based generative models (Song et al., 2021), diffusion models.
- **Information bottleneck** (Tishby et al.): a principled probabilistic framing of representation learning.
