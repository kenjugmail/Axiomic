---
title: Optimization Theory
category: mathematics
---
<!-- tier:intro -->
# Optimization Theory

Every machine learning algorithm is, at its core, an optimization algorithm. You define a function — usually a loss measuring how badly the model fits the data — and you search for inputs (parameters) that make it small. The whole field of optimization studies how to do that search well.

## What you're trying to do

You have a function $L(\theta)$ — the loss — and you want to find $\theta$ that minimizes it. Sometimes $\theta$ is just a few numbers (curve fitting); for a modern language model, $\theta$ is hundreds of billions of numbers.

A *minimum* is a point where the function is smaller than all nearby points. A *global minimum* is the smallest value anywhere. For most ML problems, the loss landscape has many local minima, ridges, plateaus, and saddle points — finding the global one is hopeless, so we settle for a "good enough" minimum.

## How you find one

The simplest idea: start somewhere, look around, take a step in the most downhill direction, repeat. That's [gradient descent](/wiki/gradient-descent). The "most downhill direction" is given by the negative gradient.

In practice, modern ML uses *stochastic* gradient descent: at each step, instead of computing the gradient over the whole dataset (too expensive), you compute it over a small random batch. This is noisier but vastly faster, and the noise actually helps escape bad minima.

## What can go wrong

- **Step too large**: you overshoot and bounce around, or diverge entirely.
- **Step too small**: training takes forever.
- **Saddle points**: gradient is zero in some directions but the point isn't a minimum.
- **Vanishing gradients**: in deep networks, gradients can shrink toward zero before reaching early layers.
- **Exploding gradients**: the opposite — gradients blow up, breaking training.

Modern optimizers (Adam, AdamW) and architectural tricks (layer norm, residual connections, careful initialization) all exist to manage these issues.

## Convex vs. non-convex

A *convex* function has a single bowl-shaped minimum. Gradient descent reliably finds the global optimum. [Linear regression](/wiki/loss-functions), logistic regression, and SVMs are convex.

A *non-convex* function can have many local minima, saddles, and complex geometry. Neural networks are dramatically non-convex. The fact that gradient descent works at all on these is something of a miracle — and is partly explained by recent insights about the geometry of overparameterized loss landscapes.

## Where optimization shows up

- [Gradient descent](/wiki/gradient-descent) and its many variants (SGD, Adam, momentum) are the engine of training.
- [Backpropagation](/wiki/backpropagation) computes the gradient efficiently.
- [Loss functions](/wiki/loss-functions) define what you're optimizing.
- Hyperparameter tuning is itself an optimization problem.
- [Fine-tuning](/wiki/fine-tuning) and [LoRA](/wiki/lora) are constrained optimization within a smaller subspace.

<!-- tier:undergrad -->
# Optimization Theory

Optimization theory studies how to minimize (or maximize) functions subject to constraints. For ML, the relevant content is: convex analysis, first- and second-order methods, stochastic approximation, and the geometry of non-convex landscapes.

## Unconstrained smooth optimization

Given $f : \mathbb{R}^n \to \mathbb{R}$ continuously differentiable, find $\theta^* \in \arg\min f(\theta)$.

A *first-order necessary condition* at a minimum: $\nabla f(\theta^*) = 0$. With twice-differentiability, the *second-order necessary condition* adds $\nabla^2 f(\theta^*) \succeq 0$.

These conditions are satisfied at minima, maxima, and saddles — they're necessary, not sufficient. Strict positive definiteness of the Hessian *is* sufficient for a strict local minimum.

## Gradient descent

The basic update:
$$\theta_{t+1} = \theta_t - \eta \nabla f(\theta_t).$$

Convergence rates depend on assumptions:
- $f$ Lipschitz-smooth ($\|\nabla^2 f\| \leq L$): converges to a stationary point at rate $O(1/T)$ with $\eta \leq 1/L$.
- $f$ also $\mu$-strongly convex: converges to the minimum at rate $O((1 - \mu/L)^T)$ — exponentially fast.
- $f$ convex but not strongly convex: $O(1/\sqrt{T})$ for the average iterate.

The condition number $\kappa = L / \mu$ controls difficulty: ill-conditioned problems converge slowly.

## Stochastic gradient descent

When $f(\theta) = \frac{1}{n} \sum_i f_i(\theta)$ (e.g., empirical risk), evaluating the full gradient is $O(n)$. SGD samples $i_t$ and updates with $\nabla f_{i_t}$:
$$\theta_{t+1} = \theta_t - \eta_t \nabla f_{i_t}(\theta_t).$$

For convex $f$ with bounded variance: $O(1/\sqrt{T})$ convergence. The Robbins-Monro conditions $\sum \eta_t = \infty$, $\sum \eta_t^2 < \infty$ ensure asymptotic convergence.

In deep learning, SGD is run with mini-batches (intermediate between single-example and full-batch), constant or decaying learning rate, and almost always with momentum.

## Momentum and acceleration

Polyak's heavy ball:
$$\theta_{t+1} = \theta_t - \eta \nabla f(\theta_t) + \beta(\theta_t - \theta_{t-1}).$$

Nesterov's accelerated gradient: a clever look-ahead that achieves the optimal $O(1/T^2)$ rate on smooth convex problems — provably faster than vanilla GD.

In practice, modern deep learning uses Adam (Kingma & Ba, 2015): per-parameter adaptive learning rates with momentum on both gradient and squared-gradient. AdamW (Loshchilov & Hutter, 2019) decouples weight decay correctly. Lion, Sophia, and other newer optimizers refine the same ideas.

## Convex sets and functions

A set $C \subseteq \mathbb{R}^n$ is convex if $\theta x + (1 - \theta) y \in C$ for all $x, y \in C$, $\theta \in [0, 1]$.

A function $f$ is convex iff its epigraph is convex; equivalently, $f(\theta x + (1 - \theta) y) \leq \theta f(x) + (1 - \theta) f(y)$.

Convex functions on convex domains have a unique global minimum (if any), and any local minimum is global. This is what makes convex problems tractable. Examples in ML: [linear regression](/wiki/loss-functions), logistic regression, SVMs, LASSO.

## Second-order methods

Newton's method:
$$\theta_{t+1} = \theta_t - [\nabla^2 f(\theta_t)]^{-1} \nabla f(\theta_t).$$

Quadratic convergence locally near a strict minimum. Cost: $O(n^3)$ per step (matrix inverse). Prohibitive at scale.

Quasi-Newton (BFGS, L-BFGS) approximates the inverse Hessian using gradient differences. Used in optimization libraries (scipy.optimize) but rarely in deep learning, where the Hessian is too ill-conditioned and the noise from stochasticity defeats the second-order signal.

K-FAC (Martens & Grosse, 2015) approximates the Fisher matrix block-diagonally per layer, achieving practical second-order updates for deep networks.

## Constrained optimization and Lagrangians

For $\min f(\theta)$ subject to $g_i(\theta) \leq 0$, $h_j(\theta) = 0$:
$$\mathcal{L}(\theta, \lambda, \mu) = f(\theta) + \sum_i \lambda_i g_i(\theta) + \sum_j \mu_j h_j(\theta).$$

KKT conditions characterize optima. For convex problems with strong duality, the dual problem provides bounds and often a tractable algorithm.

In ML, constrained formulations appear in trust-region methods (TRPO), [LoRA](/wiki/lora) (rank constraint), and projection methods for staying on a manifold (Riemannian SGD).

## Non-convex landscapes

Loss landscapes of neural networks have several distinctive features (Goodfellow et al., 2015; Dauphin et al., 2014; Choromanska et al., 2015):
- Local minima are dense but most are good (close to global)
- Saddle points dominate critical points in high dimensions
- "Mode connectivity": minima are connected by low-loss paths in parameter space (Garipov et al., 2018)

Practical implications: SGD's noise helps escape saddles; warm restarts and ensembling exploit the connected structure; theoretical analysis often considers the limit of infinite width (NTK / lazy regime, see Jacot et al., 2018).

## Connections to ML

- Training is non-convex stochastic optimization with constraints (regularization).
- Architecture design considers optimization-friendliness — residual connections, layer norm, proper initialization all aim to make the loss landscape easier.
- Implicit regularization: the trajectory of SGD biases toward certain minima (margin, low-rank, sparse) even without explicit regularization.

<!-- tier:grad -->
# Optimization Theory

Modern deep learning lives at the intersection of stochastic, non-convex, and large-scale optimization, with growing connections to information geometry and dynamical systems. This page sketches the research-fluent picture.

## The implicit regularization of SGD

GD/SGD on overparameterized models converges to specific minima even without explicit regularization. Key results:

- **Linear regression with $\ell_2$ loss**: GD initialized at zero converges to the minimum-norm solution (Hardt et al., 2016).
- **Linear classifiers with logistic loss**: GD converges in *direction* to the max-margin separator (Soudry et al., 2018) — even though the loss never reaches zero.
- **Matrix factorization**: GD on $X = UV^T$ implicitly biases toward low rank (Gunasekar et al., 2017).
- **Neural networks**: GD on overparameterized networks converges to functions with minimum norm in the RKHS associated with the NTK (Jacot et al., 2018).

These results connect optimization, generalization, and the geometry of solution sets — the "implicit bias" research program.

## NTK and lazy training

In the infinite-width limit with appropriate scaling, neural networks behave linearly: the function class is fixed by the NTK at initialization, and gradient descent solves a linear regression in feature space (Jacot et al., 2018; Lee et al., 2019).

In this regime:
- Training dynamics are exactly characterized by a kernel
- Generalization can be analyzed via classical statistical learning theory
- Empirical behavior of moderately large networks is sometimes well-predicted

But finite-width networks *do* leave the lazy regime — the "feature learning" regime — and that's where most of the interesting deep learning behavior lives. The mean-field limit (Mei et al., 2018) and tensor programs (Yang, 2019) are alternative scaling regimes that *do* allow feature learning.

## Stochastic dynamics and SDE limits

SGD with small step size $\eta$ and gradient noise covariance $\Sigma$ converges to the SDE
$$d\theta_t = -\nabla L(\theta_t) dt + \sqrt{2 \eta \Sigma(\theta_t)} \, dW_t$$

The noise term has temperature $\eta \cdot \Sigma$. The Smith et al. linear-scaling rule and the "noise scale = learning rate / batch size" heuristic both fall out of this. Recent extensions consider non-Gaussian noise (Simsekli et al., 2019) and connections to fractional Brownian motion.

This SDE perspective unifies SGD, Langevin sampling (just add isotropic noise), and diffusion models (run the SDE forward to noise, learn the reverse).

## Non-convex theory under structural assumptions

PL (Polyak-Łojasiewicz) condition: $\frac{1}{2}\|\nabla f(\theta)\|^2 \geq \mu (f(\theta) - f^*)$ for some $\mu > 0$.

Under PL, GD converges linearly to the minimum — even on non-convex functions. Many overparameterized neural networks satisfy a *local* PL near initialization (Liu et al., 2022), explaining why gradient methods work despite non-convexity.

Other useful conditions: weak convexity, error bound conditions, restricted strong convexity. Modern convergence proofs for SGD on neural networks combine PL-like assumptions with concentration arguments.

## Adaptive methods and their pitfalls

Adam's update:
$$m_t = \beta_1 m_{t-1} + (1 - \beta_1) g_t, \qquad v_t = \beta_2 v_{t-1} + (1 - \beta_2) g_t^2$$
$$\theta_{t+1} = \theta_t - \eta \frac{\hat{m}_t}{\sqrt{\hat{v}_t} + \epsilon}.$$

Adam normalizes per-coordinate, which makes it robust to ill-conditioning but can hurt generalization compared to SGD with momentum (Wilson et al., 2017). AdamW decouples weight decay correctly, fixing one of the original Adam's bugs.

Recent variants:
- **Lion** (Chen et al., 2023): sign-based update with momentum; competitive with AdamW at lower memory.
- **Sophia** (Liu et al., 2023): clipped second-order updates with Hutchinson's estimator for the diagonal Hessian.
- **Shampoo / SOAP** (Gupta et al., 2018; Vyas et al., 2024): full second-order via tensored preconditioning, used in recent frontier training runs.

## Federated, distributed, and decentralized

Training a frontier model is now a distributed optimization problem:
- **Data parallel**: replicate the model, split the batch, sync gradients (AllReduce). The dominant approach.
- **Tensor parallel** (Megatron): split tensors across devices.
- **Pipeline parallel** (GPipe, PipeDream): split layers across devices.
- **Expert parallel** (mixture of experts): different experts on different devices.

Each introduces optimization questions: gradient compression (1-bit Adam, PowerSGD), local SGD with infrequent averaging, async updates and their staleness. The fully-decentralized regime (no central server, peer-to-peer averaging) connects to consensus algorithms.

## Continuous-time analysis

The integral curves of $\dot{\theta} = -\nabla L(\theta)$ are gradient flows. For the Adam dynamics, the corresponding ODE involves both the parameter and the running averages.

Wibisono, Wilson, & Jordan (2016) showed that all accelerated methods (Nesterov, heavy ball) arise as discretizations of a single Bregman Lagrangian flow — a unifying view that treats acceleration as a continuous-time phenomenon and integration scheme.

## Where to go next

- **Continuous-time deep learning**: Neural ODEs, deep equilibrium models, and the gradient-flow / SGD connections.
- **Riemannian optimization**: when parameters live on a manifold (orthogonal weights, hyperbolic embeddings).
- **Bilevel optimization**: meta-learning, hyperparameter optimization, GAN training.
- **Min-max optimization**: GANs, robust learning, RL — fundamentally different stability properties from minimization.
- **Combinatorial optimization in ML**: integer programming, branching, neural combinatorial methods.
