---
title: Factor Graphs
category: robotics
---
<!-- tier:intro -->
# Factor Graphs

A graphical representation of a joint probability distribution. The modern foundation of SLAM, sensor fusion, and probabilistic robotics.

A factor graph is a bipartite graph with two types of nodes:
- **Variables** (circles): the quantities to estimate (poses, landmarks, calibration parameters).
- **Factors** (squares): probabilistic constraints between variables (measurements, priors).

The joint distribution factorizes:

`p(X) = ∏_i f_i(X_i)`

where `X_i` is the subset of variables connected to factor `f_i`.

For Gaussian factors, MAP estimation reduces to nonlinear least squares — solvable by sparse Levenberg-Marquardt or Gauss-Newton.

<!-- tier:undergrad -->
# Factor Graphs (Undergrad)

## Why factor graphs

For SLAM + sensor fusion, factor graphs offer:

**Sparse**: each factor connects few variables. Sparse Jacobians + Hessians enable efficient solvers.

**Modular**: adding a sensor = adding a new factor type. Adding a calibration parameter = adding a new variable.

**Loop closure handled naturally**: a loop-closure constraint is just a new factor connecting two poses.

**Re-linearization**: each iteration linearizes around current estimates; not just first-step like EKF.

**Smoothing not just filtering**: solves for the entire trajectory + map jointly. More accurate than recursive filtering.

## Common factor types in SLAM

**Prior factor**: initial pose has Gaussian prior.
`f_prior(x_0) = N(x_0; μ, Σ)`

**Odometry factor**: relative motion between consecutive poses.
`f_odo(x_i, x_{i+1}) = N(x_{i+1} ⊖ x_i; ẑ, Σ)`

(`⊖` is the relative-pose operator; `ẑ` is the measurement.)

**Landmark observation factor**: pose + landmark + measurement.
`f_obs(x_i, l_j) = N(h(x_i, l_j) - z; 0, Σ)`

**Loop-closure factor**: same as odometry but between non-consecutive poses.

**IMU pre-integration factor**: integrates many IMU measurements between two poses; produces a single factor.

**Smart factor**: structureless visual landmarks; marginalize landmarks out of the optimization.

## Solving the optimization

MAP estimation:
`X̂ = argmax_X ∏ f_i(X_i)` (= argmin sum of squared residuals for Gaussian factors)

**Levenberg-Marquardt**: hybrid of Gauss-Newton + gradient descent. Standard for nonlinear least squares.

**Gauss-Newton**: faster but less robust to bad initialization.

**Sparse linear solver**: at each iteration, solve a large sparse linear system. Cholesky factorization (CHOLMOD) or QR (SuiteSparseQR).

**Tooling**: GTSAM (C++ + Python, Frank Dellaert), g2o (C++), Ceres Solver (Google, C++ + Python), MROB. All production-grade.

## Incremental smoothing

Adding new factors + variables incrementally without re-optimizing everything:

**iSAM** (Kaess-Ranganathan-Dellaert 2008): use QR factorization with Givens rotations; update incrementally as new factors arrive.

**iSAM2** (Kaess et al. 2012): uses Bayes tree; only re-linearizes affected variables. Much faster.

Production SLAM uses iSAM2 or similar. Real-time on long trajectories.

## Why this beats EKF-SLAM

EKF-SLAM:
- Single linearization per step.
- Quadratic in landmarks (dense covariance).
- Errors accumulate.

Factor graph + iSAM2:
- Re-linearizes affected variables on every update.
- Sparse (linear or near-linear).
- Loop closure naturally redistributes error.

Modern SLAM is uniformly factor-graph-based.

<!-- tier:grad -->
# Factor Graphs (Grad)

## Bayes tree

The data structure underlying iSAM2. The Bayes tree organizes the variables into a tree such that:
- Each clique is a small group of variables.
- Cliques are connected via separators (shared variables).
- The factorized distribution is a product of conditionals at each clique.

When a new factor arrives:
1. Identify affected cliques.
2. Re-eliminate them.
3. Re-linearize the affected variables.

Total work scales with the affected subtree, not the whole graph. Enables real-time SLAM.

Reference: Kaess et al. 2012. *iSAM2: Incremental smoothing and mapping using the Bayes tree*. IJRR.

## Marginalization vs elimination

**Marginalization**: eliminate variables by integrating them out. Marginal distribution depends on the rest.

**Elimination**: schur-complement-style elimination produces conditional distributions on the remaining variables.

For Gaussian factor graphs, both produce the same result. Used for sliding-window optimization, fixed-lag smoothing.

## Schur complement + structure exploitation

In SLAM, landmarks vastly outnumber poses. Structure exploitation:

`H = [H_pp H_pl; H_lp H_ll]` (Hessian, blocked into pose-pose, pose-landmark, landmark-landmark blocks).

Schur complement: solve for pose updates first using `H_pp - H_pl H_ll⁻¹ H_lp`; then back-substitute landmark updates.

`H_ll` is block-diagonal (each landmark observed independently); inversion is per-landmark and cheap.

Standard in bundle adjustment + visual SLAM. The "Hessian sparsity" exploitation that makes structure-from-motion tractable for hundreds of thousands of points.

## Robust factors

Real measurements have outliers. Robust factor variants:

**Huber loss**: `ρ_H(r) = r²/2` for `|r| < δ`, linear beyond. Down-weights extreme residuals.

**Cauchy / Tukey**: even more aggressive outlier suppression.

**M-estimators**: family of robust loss functions; all reduce sensitivity to outliers.

**Switchable constraints**: each factor has a switch variable that can deactivate it. Sünderhauf-Protzel 2012.

**Max-Mixtures**: each factor is a max-mixture of two Gaussians (valid + outlier). Olson-Agarwal 2013.

These are essential for SLAM with imperfect loop-closure detection.

## Beyond Gaussian factors

**Discrete factors**: data association uncertainty. "This observation matches landmark A or B".

**Mixture factors**: multimodal beliefs.

**Non-Gaussian noise**: heavy tails, Poisson, etc.

For non-Gaussian factor graphs, MCMC or variational methods replace direct optimization.

## Generalizations

Factor graphs generalize to:

- **Hidden Markov Models**: factor graph with discrete states + chain structure.
- **Conditional Random Fields**: factor graphs for sequence labeling.
- **Probabilistic Graphical Models**: Bayesian networks, Markov random fields.

The unified view: factor graph is the most general framework; specific models are subgraph patterns.

## Connection to ML

Factor graphs in ML:

- **Sum-product algorithm**: belief propagation on factor graphs. Used in inference for graphical models.
- **Variational inference on factor graphs**: VMP, expectation propagation.
- **Differentiable factor graphs**: optimize gradient through the SLAM problem; used in end-to-end SLAM learning.
- **Neural factor graphs**: replace handcrafted factors with neural networks.

## References

- Dellaert & Kaess. *Factor Graphs for Robot Perception*. *Foundations and Trends in Robotics* (2017). The reference.
- Kschischang, Frey, Loeliger 2001. Factor graphs and the sum-product algorithm. *IEEE T. Inform. Theory*.
- Kaess et al. 2012. iSAM2. *IJRR*.
- Sucan, Moll, Kavraki — OMPL motion planning library uses factor-graph concepts internally.
