---
title: Linear Algebra Foundations
category: mathematics
---
<!-- tier:intro -->
# Linear Algebra Foundations

Almost everything in modern machine learning is linear algebra in disguise. When a transformer "attends" to a word, when a neural network "learns" weights, when an embedding "represents" a meaning — what's actually happening underneath is matrices being multiplied, vectors being projected, and high-dimensional spaces being reshaped.

If you only learn one branch of mathematics for ML, learn this one.

## What is a vector?

A vector is just a list of numbers — but it's a list with geometric meaning. The vector $[3, 4]$ can be thought of as an arrow in 2D space pointing from the origin to the point $(3, 4)$. In ML, vectors live in much higher-dimensional spaces — a [word embedding](/wiki/embeddings) might be a 768-dimensional vector — but the geometric intuition still holds.

Two operations on vectors matter most:
- **Addition**: combining vectors by adding component by component. Geometrically, placing arrows tip-to-tail.
- **Scalar multiplication**: stretching or shrinking a vector. Multiplying by 2 doubles its length; multiplying by -1 flips its direction.

## What is a matrix?

A matrix is a grid of numbers — a list of vectors stacked together. But its real meaning is as a *transformation*: a matrix takes vectors and turns them into other vectors. Multiplying a matrix $A$ by a vector $v$ is a way of saying "apply this transformation to this vector."

This is the core idea behind every neural network layer: each layer is a matrix that transforms its input vector into an output vector.

## Why this matters for ML

- A [word embedding](/wiki/embeddings) is a vector — a point in semantic space. Words with similar meanings end up close in this space.
- A [linear layer](/wiki/feed-forward-networks) is a matrix multiplication followed by a non-linear function.
- [Attention](/wiki/attention) computes dot products between query and key vectors to figure out which tokens should pay attention to which.
- The dimensions you'll see throughout ML papers — $d_k$, $d_{model}$, $n$, $h$ — are all sizes of vectors and matrices.

## What you'll need to know

For getting through transformer papers comfortably:
1. Vector addition, scalar multiplication, dot product
2. Matrix-vector multiplication, matrix-matrix multiplication
3. The transpose operation
4. Norms (especially the L2 norm, also called Euclidean norm)
5. The idea of a basis and dimension

For mechanistic interpretability work, you'll also want eigenvalues, singular value decomposition (SVD), and orthogonal projections.

<!-- tier:undergrad -->
# Linear Algebra Foundations

Linear algebra studies vector spaces and the linear maps between them. For machine learning, the practical content is: vectors, matrices, inner products, norms, eigendecompositions, and the singular value decomposition.

## Vectors and vector spaces

A vector $v \in \mathbb{R}^n$ is an $n$-tuple of real numbers. The set $\mathbb{R}^n$ with the operations of vector addition and scalar multiplication forms a *vector space*: addition is commutative and associative, scalar multiplication distributes over both vector and scalar addition, and every vector has an additive inverse.

Subspaces of $\mathbb{R}^n$ are subsets closed under these operations. The *span* of a set of vectors is the set of all linear combinations:
$$\text{span}(v_1, \ldots, v_k) = \left\{ \sum_{i=1}^{k} c_i v_i : c_i \in \mathbb{R} \right\}$$

A set is *linearly independent* if no vector in it is in the span of the others. A *basis* is a linearly independent spanning set; the *dimension* is the size of any basis.

## Inner product and norm

The standard inner product on $\mathbb{R}^n$:
$$\langle u, v \rangle = u^T v = \sum_{i=1}^{n} u_i v_i$$

The induced norm: $\|v\|_2 = \sqrt{\langle v, v \rangle}$.

The Cauchy-Schwarz inequality $|\langle u, v \rangle| \leq \|u\| \|v\|$ lets us define the angle between vectors:
$$\cos \theta = \frac{\langle u, v \rangle}{\|u\| \|v\|}$$

This is *cosine similarity* — the foundation of how we measure semantic similarity between [embeddings](/wiki/embeddings).

## Matrices as linear maps

A matrix $A \in \mathbb{R}^{m \times n}$ defines a linear map $\mathbb{R}^n \to \mathbb{R}^m$ by $v \mapsto Av$. The *kernel* (null space) is $\{v : Av = 0\}$; the *image* (column space) is $\{Av : v \in \mathbb{R}^n\}$. The rank-nullity theorem ties their dimensions together: $\dim(\ker) + \dim(\text{image}) = n$.

Matrix multiplication corresponds to composition of linear maps. This is why the inner two dimensions must match: $A \in \mathbb{R}^{m \times k}$, $B \in \mathbb{R}^{k \times n}$, $AB \in \mathbb{R}^{m \times n}$.

## Eigendecomposition

For a square matrix $A$, an eigenvector $v \neq 0$ satisfies $Av = \lambda v$ for some scalar $\lambda$ (the eigenvalue). Eigenvectors are the directions the matrix scales without rotating.

For symmetric real matrices, the spectral theorem guarantees an orthonormal eigenbasis: $A = Q \Lambda Q^T$ where $Q$ is orthogonal and $\Lambda$ is diagonal. This decomposition appears in PCA, in analyzing the Hessian during optimization, and in studying the dynamics of training.

## Singular value decomposition

For any matrix $A \in \mathbb{R}^{m \times n}$:
$$A = U \Sigma V^T$$

where $U \in \mathbb{R}^{m \times m}$ and $V \in \mathbb{R}^{n \times n}$ are orthogonal, and $\Sigma$ is diagonal with non-negative entries (the singular values).

SVD is the most useful tool in applied linear algebra. It tells you about rank, invertibility, low-rank approximation, and the geometry of the linear map. [LoRA](/wiki/lora) is essentially a rank-constrained perturbation justified by SVD intuitions.

## Connections to ML

- A [linear layer](/wiki/feed-forward-networks) $y = Wx + b$ is matrix-vector multiplication plus an offset.
- [Attention](/wiki/attention) is built from inner products: $QK^T$ measures how aligned each query is with each key.
- The Jacobian of a neural network at a point is a matrix — its singular values describe how the network locally stretches space.
- Backpropagation is a sequence of matrix-vector multiplications, applied via the chain rule.

<!-- tier:grad -->
# Linear Algebra Foundations

The vocabulary of ML is the vocabulary of linear algebra over real (and increasingly, low-precision) Hilbert spaces. This page connects the standard graduate-level results to where they show up in deep learning research.

## Inner product spaces and the geometry of representations

A finite-dimensional real inner product space $(V, \langle \cdot, \cdot \rangle)$ is isomorphic to $\mathbb{R}^n$ with the standard inner product, but treating it abstractly clarifies what's invariant. The set of orthogonal transformations $O(n) = \{Q : Q^T Q = I\}$ is the symmetry group preserving the inner product; weight initialization schemes like *orthogonal initialization* (Saxe et al., 2014) and architectures using rotation-equivariant operations (e.g., RoPE — see [rotary position embeddings](/wiki/rope)) exploit this structure.

Cosine similarity is the inner product on the unit sphere $S^{n-1}$. Many modern embedding models (CLIP, sentence transformers) explicitly normalize outputs to live on $S^{n-1}$ so similarity is well-defined.

## Spectral theory and stability of training

For a symmetric matrix $A$, the spectral theorem gives $A = Q \Lambda Q^T$. The Rayleigh quotient $R(A, x) = \frac{x^T A x}{x^T x}$ achieves its maximum at the top eigenvector with value $\lambda_1$, and the variational characterization (Courant-Fischer) generalizes to all eigenvalues.

This matters in two places in deep learning:
1. **The Hessian** at a critical point determines the local geometry: positive eigenvalues are stable directions, negative are escape directions, zero are flat. The *spectrum* of the Hessian shapes optimization. Empirical work (Sagun et al., 2017; Ghorbani et al., 2019) finds that the Hessian of trained networks has a small bulk plus a few outlier eigenvalues — a structure that constrains generalization theory.
2. **The Jacobian's singular values** at initialization control gradient propagation. Networks where these are concentrated near 1 (dynamical isothermal initialization, Pennington et al., 2017) train more stably.

## SVD and low-rank structure

The SVD $A = U \Sigma V^T$ admits a remarkably useful low-rank approximation: $A_k = \sum_{i=1}^{k} \sigma_i u_i v_i^T$ is the best rank-$k$ approximation in both Frobenius and operator norm (Eckart-Young).

This justifies several ML techniques:

- **[LoRA](/wiki/lora)** parameterizes weight updates as $\Delta W = BA$ where $B \in \mathbb{R}^{m \times r}$, $A \in \mathbb{R}^{r \times n}$, $r \ll \min(m, n)$. Implicit assumption: the optimal fine-tuning update is well-approximated by a low-rank matrix.
- **Whitening** and PCA amount to truncating an SVD of the data covariance.
- **Lottery ticket hypothesis** (Frankle & Carbin, 2019) and pruning literature exploit that trained networks have approximately low effective rank.

## The pseudoinverse and least squares

For $A \in \mathbb{R}^{m \times n}$ with SVD $U \Sigma V^T$, the Moore-Penrose pseudoinverse is $A^+ = V \Sigma^+ U^T$ where $\Sigma^+$ inverts non-zero singular values. The minimum-norm least-squares solution to $Ax = b$ is $A^+ b$.

This is the formal solution to the *implicit bias* of gradient descent on overparameterized linear models: GD initialized at zero converges to $A^+ b$ (Gunasekar et al., 2017), connecting linear algebra directly to generalization.

## Matrix calculus essentials

Almost no ML paper survives without matrix calculus. The two indispensable identities:
$$\frac{\partial}{\partial X} \text{tr}(AX) = A^T, \qquad \frac{\partial}{\partial X} \text{tr}(X^T A X) = (A + A^T) X$$

Differentials and the trace trick give a coordinate-free path to gradients of complicated matrix-valued losses, which becomes important when deriving backpropagation rules for new architectures.

## Where to go next

- **Functional analysis**: when you generalize to infinite dimensions (Gaussian processes, kernel methods, neural tangent kernel).
- **Random matrix theory**: when you study the *distribution* of eigenvalues at initialization or after training (Marchenko-Pastur, Wigner semicircle).
- **Tensor decompositions**: when you go beyond bilinear structure into trilinear and higher-order interactions.
