---
title: Calculus Foundations
category: mathematics
---
<!-- tier:intro -->
# Calculus Foundations

Training a neural network is, at its heart, a calculus problem. We have a function — the loss — and we want to find inputs (the weights) that make it small. The single most important idea in calculus is the *derivative*: a way of asking "if I nudge this input slightly, how does the output change?" If we know the answer, we know which way to nudge. Repeat this billions of times, and you've trained a model.

## Derivatives in one variable

For a single-variable function $f(x)$, the derivative $f'(x)$ tells you the slope of $f$ at $x$. Geometrically, it's the slope of the tangent line. Algebraically, it's the limit of the rise-over-run as the run shrinks to zero.

A few that matter:
- The derivative of $f(x) = x^2$ is $f'(x) = 2x$.
- The derivative of $f(x) = e^x$ is $f'(x) = e^x$ (it's its own derivative — that's why exponentials are everywhere).
- The derivative of $f(x) = \log(x)$ is $f'(x) = 1/x$.

If $f'(x) > 0$, $f$ is increasing at $x$. If $f'(x) < 0$, decreasing. If $f'(x) = 0$, you're at a flat point — possibly a minimum, maximum, or saddle.

## The chain rule

When functions are composed, $h(x) = f(g(x))$, the derivative is
$$h'(x) = f'(g(x)) \cdot g'(x).$$

This is the most important rule in ML. A neural network is a deep composition of functions. To compute how the loss changes when you nudge a weight 20 layers deep, you apply the chain rule 20 times, multiplying derivatives at each layer. That's [backpropagation](/wiki/backpropagation).

## Gradients in many variables

For a function $f(x_1, x_2, \ldots, x_n)$ of many variables, the *gradient* is the vector of partial derivatives:
$$\nabla f = \left[\frac{\partial f}{\partial x_1}, \ldots, \frac{\partial f}{\partial x_n}\right].$$

The gradient points in the direction of steepest ascent. So if you want to *minimize* $f$, you walk in the direction $-\nabla f$. That's [gradient descent](/wiki/gradient-descent).

## Where calculus shows up in ML

- Training itself is the search for weights that minimize a loss. [Gradient descent](/wiki/gradient-descent) uses the gradient at each step.
- [Backpropagation](/wiki/backpropagation) is the chain rule applied to a deep computation graph.
- Activation functions like [softmax](/wiki/softmax), GELU, and SwiGLU are chosen partly for their derivative properties.
- Vanishing and exploding gradients — the bane of deep networks — are a calculus phenomenon.

## What you'll need

- Single-variable derivatives and the chain rule
- Partial derivatives and gradients
- A working understanding of what an integral represents (areas, expectations)
- Comfort with $\nabla f$ notation and basic vector calculus identities

You don't need real analysis or measure-theoretic integration to do ML, but if you want to read theoretical papers fluently, those become useful.

<!-- tier:undergrad -->
# Calculus Foundations

For ML, the working content of calculus is: differentiation in one and many variables, the chain rule and its multivariate form, optimization via critical points and second-order conditions, and the basics of integration as it appears in expectations.

## Single-variable differentiation

The derivative is the limit
$$f'(x) = \lim_{h \to 0} \frac{f(x + h) - f(x)}{h}$$

when it exists. Standard rules — sum, product, quotient, chain — let you differentiate any elementary function.

The fundamental theorem of calculus connects differentiation and integration:
$$\frac{d}{dx} \int_a^x f(t) dt = f(x), \qquad \int_a^b f'(t) dt = f(b) - f(a).$$

## Multivariate calculus

For $f : \mathbb{R}^n \to \mathbb{R}$, the gradient is the vector of partial derivatives:
$$\nabla f(x) = \begin{pmatrix} \partial f / \partial x_1 \\ \vdots \\ \partial f / \partial x_n \end{pmatrix}.$$

The gradient is the unique vector such that for any direction $v$,
$$\frac{d}{dt} f(x + tv) \Big|_{t=0} = \langle \nabla f(x), v \rangle.$$

Geometrically: $\nabla f$ points in the direction of fastest ascent, with magnitude equal to that rate.

For $f : \mathbb{R}^n \to \mathbb{R}^m$, the *Jacobian* $J_f$ is the matrix of partial derivatives. The chain rule generalizes:
$$J_{g \circ f}(x) = J_g(f(x)) \, J_f(x).$$

## The chain rule and backpropagation

A neural network with $L$ layers is a composition $f = f_L \circ f_{L-1} \circ \cdots \circ f_1$. The gradient of the loss with respect to layer-$k$ parameters is, by the chain rule, a product of Jacobians.

[Backpropagation](/wiki/backpropagation) is the *reverse-mode* implementation: rather than computing each Jacobian explicitly (memory-prohibitive), you compute and store activations on a forward pass, then accumulate gradients backward. The key efficiency: you never materialize the full Jacobian — you propagate the cotangent vector $\partial L / \partial \text{layer output}$ through one layer at a time.

## Second-order information

The Hessian:
$$H_{ij} = \frac{\partial^2 f}{\partial x_i \partial x_j}.$$

For sufficiently smooth functions, mixed partials commute (Schwarz's theorem) so $H$ is symmetric. At a critical point ($\nabla f = 0$):
- $H$ positive definite ⇒ local minimum
- $H$ negative definite ⇒ local maximum
- $H$ indefinite ⇒ saddle point

Modern deep learning theory (Dauphin et al., 2014) showed that high-dimensional non-convex landscapes are dominated by saddles rather than local minima — which is one reason gradient descent works at scale.

## Convexity

A function $f$ is *convex* if for all $x, y$ and $t \in [0, 1]$:
$$f(tx + (1-t)y) \leq tf(x) + (1-t)f(y).$$

For differentiable $f$: convex iff $f(y) \geq f(x) + \langle \nabla f(x), y - x \rangle$ everywhere.

For twice-differentiable $f$: convex iff $H \succeq 0$ everywhere.

Convex functions have a single global minimum (if any). Most loss landscapes in deep learning are *not* convex, but [linear regression](/wiki/loss-functions), logistic regression, and SVMs all are.

## Integration and expectation

The Riemann integral $\int_a^b f(x) dx$ represents area under the curve. For ML, the most common use of integration is *expectation*:
$$E[g(X)] = \int g(x) p(x) dx \quad \text{(continuous)}, \qquad E[g(X)] = \sum_x g(x) p(x) \quad \text{(discrete)}.$$

Training objectives are expectations under the data distribution. The gradient of an expectation often requires care — see the reparameterization trick and score function estimator under [probability foundations](/wiki/probability-foundations).

## Vector calculus identities you'll see

For $A$ a constant matrix, $b$ a constant vector:
$$\nabla_x (b^T x) = b, \qquad \nabla_x (x^T A x) = (A + A^T) x.$$

For trace-form expressions: $\nabla_X \text{tr}(AXB) = A^T B^T$.

These come up constantly when deriving gradients of layer outputs and loss functions.

## Connections to ML

- [Gradient descent](/wiki/gradient-descent) and its variants are first-order optimization on a non-convex landscape.
- [Backpropagation](/wiki/backpropagation) is multivariate chain rule with reverse-mode differentiation.
- Vanishing/exploding gradients are a chain-rule phenomenon: products of Jacobians can blow up or shrink to zero across many layers — motivating residual connections, layer normalization, and careful initialization.
- The Hessian's spectrum near minima is studied as a window into generalization.

<!-- tier:grad -->
# Calculus Foundations

Modern deep learning depends on multivariate calculus, automatic differentiation, optimization on non-convex landscapes, and increasingly, calculus on manifolds. This page sketches the research-fluent connections.

## Automatic differentiation, formally

Reverse-mode AD is the algorithmic realization of the chain rule on a computation graph. For a function $f : \mathbb{R}^n \to \mathbb{R}$ with intermediate quantities $v_1, \ldots, v_K$:

Forward pass: compute and store $v_k = \phi_k(\text{predecessors of } v_k)$.

Backward pass: initialize $\bar{v}_K = 1$. For $k = K, K-1, \ldots, 1$:
$$\bar{v}_j \mathrel{+}= \bar{v}_k \cdot \frac{\partial \phi_k}{\partial v_j}$$
for each predecessor $v_j$ of $v_k$.

Time complexity: $O(\text{forward time})$ — same as the forward pass, regardless of input dimension. This is the killer feature: neural networks have $n \gg m$ (parameters $\gg$ scalar loss), so reverse mode dominates.

Forward-mode AD is the dual: $O(\text{forward} \cdot n_{\text{input}})$ but doesn't need to store activations. Used for Jacobian-vector products and Hessian-vector products.

The implementation insight: a tape (Wengert list) records operations during the forward pass; the backward pass walks the tape in reverse. Modern frameworks (PyTorch's autograd, JAX's grad) implement this in different ways but the core algorithm is the same.

## Higher-order derivatives and Hessian-free methods

Computing the full Hessian costs $O(n^2)$ — prohibitive at scale. But Hessian-vector products $Hv$ can be computed in $O(\text{forward time})$ via the Pearlmutter trick:
$$Hv = \nabla_\theta (\nabla_\theta L(\theta) \cdot v).$$

Apply reverse-mode AD twice. This enables conjugate gradient on the Hessian (truncated Newton), curvature-aware regularization, and approximations like K-FAC and Shampoo.

## Differential geometry of optimization

The parameter space of neural networks isn't naturally Euclidean. *Information geometry* (Amari, 2016) views it as a Riemannian manifold with the Fisher metric:
$$g_{ij}(\theta) = E_{x \sim p_\theta}[\partial_i \log p_\theta(x) \, \partial_j \log p_\theta(x)].$$

The natural gradient $g^{-1} \nabla L$ is the steepest-descent direction in this metric, and it's invariant to reparameterization. K-FAC approximates $g^{-1}$ block-diagonally; recent work like Shampoo (Gupta et al., 2018) and SOAP refine this.

## Implicit differentiation

For optimization-defined functions $\theta^*(x) = \arg\min_\theta L(\theta, x)$, the implicit function theorem gives gradients of $\theta^*$ with respect to $x$ via:
$$\frac{\partial \theta^*}{\partial x} = -[\nabla_\theta^2 L]^{-1} \nabla_x \nabla_\theta L \Big|_{\theta = \theta^*}.$$

This is the foundation of meta-learning (MAML, iMAML), differentiable bilevel optimization, and Deep Equilibrium Models. JAX's `implicit_diff` operationalizes this.

## Optimization on non-convex landscapes

Loss landscapes of overparameterized networks have a few empirical regularities:
- Overwhelming dominance of saddles over local minima (Dauphin et al., 2014)
- "Mode connectivity": minima found by SGD are connected by low-loss paths (Garipov et al., 2018; Frankle et al., 2020)
- Linear mode connectivity *after permutations* — the "permutation symmetry" of neural networks (Entezari et al., 2022; Ainsworth et al., 2023)
- Approximately self-similar loss profiles across scales

These structural facts inform second-order method design and explain why gradient descent doesn't get stuck in pathological minima.

## Stochastic differential equations and the SGD limit

In a continuous-time scaling, SGD converges to the SDE
$$d\theta_t = -\nabla L(\theta_t) dt + \sqrt{2\beta^{-1} \Sigma(\theta_t)} \, dW_t$$
where $\Sigma$ is the gradient noise covariance. The temperature $\beta^{-1}$ scales as $\eta / B$ (learning rate over batch size), explaining the linear-scaling rule (Goyal et al., 2017) and Smith et al.'s analysis of generalization vs. batch size (2017).

This perspective unifies SGD, Langevin sampling, and diffusion models (Song et al., 2021), where the same SDE machinery is run *forward* (to noise) and *reverse* (to denoise).

## Where to go next

- **Tropical geometry** of ReLU networks (Zhang et al., 2018) — the function classes are piecewise linear with combinatorial structure.
- **Neural tangent kernel** (Jacot et al., 2018) — the linearization of infinite-width networks, where calculus reduces to kernel methods.
- **Functional calculus** for operator learning — when "weights" become functions rather than vectors.
- **Differential forms and manifolds** for equivariant architectures — increasingly relevant as we build models with built-in symmetry.
