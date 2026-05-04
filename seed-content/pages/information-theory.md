---
title: Information Theory
category: mathematics
---
<!-- tier:intro -->
# Information Theory

Information theory is the mathematics of uncertainty, surprise, and compression. Shannon developed it in 1948 to answer a practical telecommunications question — how much information can you cram down a noisy wire? — and it turned out to underpin nearly everything in modern machine learning.

## What is information?

Shannon's insight: information is *surprise*. If you tell me the sun rose this morning, I learn nothing — that always happens. If you tell me it snowed in July, I learn a lot — that almost never happens. The amount of information in an event is inversely related to how likely it was.

The formal measure: an event with probability $p$ carries $-\log p$ bits of information. A 50/50 coin flip has $\log 2 = 1$ bit. A one-in-a-million event has 20 bits. The rarer something is, the more information you receive when you learn it happened.

## Entropy

If you average information over all possible outcomes weighted by their probability, you get *entropy*:
$$H(X) = -\sum_x p(x) \log p(x).$$

Entropy measures the expected surprise of a random variable — equivalently, the average number of yes/no questions you'd need to identify its value.

A fair coin has 1 bit of entropy. A six-sided die has $\log_2 6 \approx 2.58$ bits. A heavily biased coin (heads 99% of the time) has very low entropy — almost no surprise.

## Why this matters for ML

A language model is essentially a compressor. It assigns probabilities to next words, and a good model gives high probability to what actually comes next. Cross-entropy — the average code length you'd need under the model's predictions — is the loss function we minimize during training. Lower cross-entropy means the model is less surprised by the data, which means it has learned something.

Almost every loss function in modern ML can be derived from information-theoretic principles. The standard classification loss is cross-entropy; many regularization techniques have information-theoretic interpretations; whole subfields (information bottleneck, mutual information neural estimation) are explicitly built on Shannon's framework.

## Three quantities you'll see everywhere

- **Entropy $H(p)$**: how uncertain a distribution is.
- **Cross-entropy $H(p, q)$**: how badly $q$ predicts samples drawn from $p$. The standard loss for classifiers and language models.
- **KL divergence $D_{KL}(p \| q)$**: how much $p$ differs from $q$, measured in extra bits per sample. Always non-negative; zero iff $p = q$.

These three are linked by $H(p, q) = H(p) + D_{KL}(p \| q)$.

## Where it shows up

- [Cross-entropy loss](/wiki/loss-functions) is the workhorse training objective.
- [Softmax temperature](/wiki/temperature) directly controls output entropy.
- [RLHF](/wiki/rlhf) penalizes KL divergence from a reference model.
- VAEs minimize a KL term to a Gaussian prior.
- [Sampling strategies](/wiki/sampling-strategies) are often analyzed by their effect on entropy.

<!-- tier:undergrad -->
# Information Theory

Information theory provides the formal language for uncertainty, redundancy, compression, and channel capacity. For ML, the working content is: entropy, cross-entropy, KL divergence, mutual information, and a handful of inequalities (Jensen, data processing).

## Self-information and entropy

For an event with probability $p$, the *self-information* is $I(p) = -\log p$. Base-2 logs give bits; natural logs give nats. The choice rarely matters for ML.

The *entropy* of a discrete distribution $p$ is the expected self-information:
$$H(p) = -\sum_x p(x) \log p(x) = E_{X \sim p}[-\log p(X)].$$

For a continuous distribution with density $f$, the *differential entropy* is $h(f) = -\int f(x) \log f(x) dx$ — but it can be negative and isn't invariant to coordinate changes, so use it carefully.

## Joint, conditional, mutual

For two random variables:
- Joint entropy $H(X, Y) = -\sum_{x, y} p(x, y) \log p(x, y)$
- Conditional entropy $H(Y | X) = E_X[H(Y | X = x)]$
- Mutual information $I(X; Y) = H(X) + H(Y) - H(X, Y) = H(Y) - H(Y | X)$

Mutual information measures how much knowing $X$ reduces uncertainty about $Y$. It's symmetric, non-negative, and zero iff $X \perp Y$.

In ML, mutual information shows up as a target quantity (representation learning) and as a diagnostic (information bottleneck — Tishby et al., 2015).

## Cross-entropy and KL

Cross-entropy of $q$ relative to $p$:
$$H(p, q) = -\sum_x p(x) \log q(x) = E_{X \sim p}[-\log q(X)].$$

It's the expected code length of samples from $p$ under a code optimal for $q$. Always satisfies $H(p, q) \geq H(p)$, with equality iff $p = q$.

KL divergence:
$$D_{KL}(p \| q) = \sum_x p(x) \log \frac{p(x)}{q(x)} = H(p, q) - H(p) \geq 0.$$

Properties:
- $D_{KL}(p \| q) = 0$ iff $p = q$
- *Not* symmetric: $D_{KL}(p \| q) \neq D_{KL}(q \| p)$ in general
- Convex in both arguments
- Information processing inequality: $D_{KL}(P_X \| Q_X) \geq D_{KL}(P_{f(X)} \| Q_{f(X)})$ for any function $f$

The asymmetry has practical consequences: $D_{KL}(p \| q)$ (forward KL) penalizes $q$ being small where $p$ is large — *mode-covering*. $D_{KL}(q \| p)$ (reverse KL) penalizes $q$ being large where $p$ is small — *mode-seeking*. Variational inference typically minimizes reverse KL, which is why VAEs can underutilize parts of the latent space.

## Connections to maximum likelihood

Suppose you have data $x_1, \ldots, x_n \sim p_{\text{data}}$ and a model family $q_\theta$. Maximum likelihood maximizes $\sum_i \log q_\theta(x_i)$, which converges (by LLN) to $E_{X \sim p_{\text{data}}}[\log q_\theta(X)] = -H(p_{\text{data}}, q_\theta)$.

Equivalently, MLE minimizes cross-entropy, which is equivalent to minimizing $D_{KL}(p_{\text{data}} \| q_\theta)$ since $H(p_{\text{data}})$ is constant in $\theta$.

This is why training a language model with [cross-entropy loss](/wiki/loss-functions) is exactly maximum likelihood under the model.

## Jensen's inequality

For a convex function $\phi$ and random variable $X$:
$$\phi(E[X]) \leq E[\phi(X)].$$

Applied to $-\log$ (which is convex), Jensen yields the non-negativity of KL divergence and many bounds in variational inference. Almost every information-theoretic inequality reduces to Jensen plus algebraic massaging.

## Compression and code lengths

Shannon's source coding theorem: the expected code length of any uniquely decodable code on i.i.d. samples from $p$ is at least $H(p)$. Conversely, codes achieving $H(p) + 1$ exist (arithmetic coding gets arbitrarily close to $H(p)$).

This makes the "language model as compressor" framing precise: a model with low cross-entropy on a corpus is exactly a good compressor of that corpus. The recent paper *Language Modeling Is Compression* (Delétang et al., 2024) showed Chinchilla compresses ImageNet patches and audio better than gzip, by treating them as token sequences.

## Connections to ML

- **Cross-entropy training** is MLE. The standard recipe.
- **[Softmax temperature](/wiki/temperature) $T$** scales logits before softmax. Output entropy increases monotonically with $T$.
- **[RLHF](/wiki/rlhf) KL penalty** keeps the policy close (in KL) to the reference model — a regularization with both information-theoretic and statistical justification (TRPO/PPO).
- **Information bottleneck** views representation learning as $\min_p I(X; Z) - \beta I(Z; Y)$ — compress while preserving label-relevant info.
- **InfoNCE** and contrastive learning approximate mutual information lower bounds; SimCLR, CLIP, and many self-supervised methods rest on this.

<!-- tier:grad -->
# Information Theory

Modern ML uses information theory as both a tool (loss functions, bounds) and a lens (analyzing what models compute). This page sketches the research-fluent connections beyond the standard textbook material.

## Variational bounds on mutual information

Mutual information is hard to estimate directly. Variational lower bounds let you optimize tractable surrogates:

**Donsker-Varadhan**:
$$I(X; Y) = \sup_T \left[ E_{p(x, y)}[T(x, y)] - \log E_{p(x) p(y)}[\exp T(x, y)] \right].$$

**InfoNCE** (Oord et al., 2018; Poole et al., 2019):
$$I_{\text{NCE}}(X; Y) = E\left[\log \frac{f(x, y)}{\frac{1}{K} \sum_{k=1}^K f(x, y_k)}\right] \leq I(X; Y) + \log K.$$

The latter is what contrastive learning maximizes — CLIP, SimCLR, MoCo all instantiate this. The $\log K$ ceiling explains why batch size matters so much for these methods.

## The information bottleneck and deep learning

Tishby's information bottleneck (Tishby et al., 1999) frames representation learning as
$$\min_{p(z|x)} I(X; Z) - \beta I(Z; Y).$$

The "two-phase" claim (Shwartz-Ziv & Tishby, 2017) — that SGD first fits then compresses — was contested (Saxe et al., 2018) and remains a partially open empirical question. But the framework is now ubiquitous in disentanglement and self-supervision research.

## Rate-distortion theory

For lossy compression, rate-distortion gives the minimum bit rate required to reconstruct a source within distortion budget $D$:
$$R(D) = \min_{p(\hat{x} | x) : E[d(X, \hat{X})] \leq D} I(X; \hat{X}).$$

VAEs are essentially rate-distortion machines: the ELBO decomposes into a reconstruction term (distortion) and a KL term (rate). Beta-VAE explicitly tunes the rate-distortion tradeoff.

## Channel capacity and learning bounds

Shannon's channel coding theorem: any channel with capacity $C$ can transmit at rates $R < C$ with vanishing error.

Applied to learning: the *capacity* of a neural network — its ability to memorize random labels — bounds what it can learn. Zhang et al. (2017) showed standard architectures can fit random labels, undermining classical generalization theory and prompting new explanations (NTK, double descent, implicit regularization).

## Compression and generalization

The PAC-Bayes framework (McAllester, 1999) bounds generalization error in terms of a KL divergence between the posterior over weights and a prior:
$$E_{w \sim Q}[L_{\text{test}}(w)] \leq E_{w \sim Q}[L_{\text{train}}(w)] + \sqrt{\frac{D_{KL}(Q \| P) + \log(1/\delta)}{2(n - 1)}}.$$

This is the most predictive generalization bound for deep networks empirically (Dziugaite & Roy, 2017; Jiang et al., 2020) — and it's intimately information-theoretic.

The MDL (minimum description length) view (Rissanen, Hinton & van Camp): a model that compresses the data well *and* is itself short to describe generalizes well. Modern interpretation: low-rank weight matrices, low-effective-rank activations, sparse circuits — the various "compressed" structures that show up in mechanistic interpretability.

## Mutual-information critiques and bounds

Two cautionary results:

1. **MI is unbounded for deterministic representations**. If $Z = f(X)$ deterministically, then $I(X; Z)$ is not well-defined for continuous variables (it's infinite for invertible $f$, can be anything for non-invertible). Deep learning representations are deterministic, so MI estimates are sensitive to estimation procedure.

2. **Variational MI bounds have known biases**. McAllester & Stratos (2020): no bound on MI from samples can be tighter than $\log n$ where $n$ is the sample size, with high probability. This bounds how much "information" any contrastive method can extract from a batch.

## Information-theoretic interpretability

Mechanistic interpretability has started using IT tools:
- **Causal scrubbing** (Chan et al., 2023): replace activations with conditional samples; measures the information content of a hypothesis about model behavior.
- **Probing** classifiers: use a classifier on intermediate representations to estimate $I(Z; \text{property})$.
- **Sparse autoencoders** (Bricken et al., 2023; Cunningham et al., 2024): learn dictionaries of features; the sparsity-vs-reconstruction Pareto frontier is rate-distortion in disguise.

## Where to go next

- **Algorithmic information theory** (Kolmogorov complexity, Solomonoff induction): the theoretical bedrock connecting compression and intelligence; Hutter's AIXI and recent papers on language models as universal predictors.
- **Quantum information theory**: when quantum-inspired ML methods (tensor networks, quantum-classical hybrids) become relevant.
- **Optimal transport** as an alternative geometry: Wasserstein distances complement KL where divergences misbehave (e.g., for distributions with disjoint supports).
- **Information bottleneck for theory of generalization**: ongoing efforts to derive sharp bounds that explain modern overparameterized models.
