---
title: Randomized Algorithms
category: algorithms
---
<!-- tier:intro -->
# Randomized Algorithms

A **randomized algorithm** uses random choices to make decisions during execution. Two flavors:

- **Las Vegas**: always correct; runtime is random. Quicksort with random pivot is Las Vegas.
- **Monte Carlo**: runtime is bounded; correctness is probabilistic. Karger's min-cut algorithm is Monte Carlo.

Randomization can dramatically simplify algorithms or improve expected complexity. Used extensively in modern systems (random sampling for sketches, hash functions, hashing-based approximate nearest neighbor).

<!-- tier:undergrad -->
# Randomized Algorithms (Undergrad)

## Why randomize?

1. **Simplicity**: deterministic algorithms can be brittle to specific input patterns; random choices average over patterns.
2. **Lower expected complexity**: quicksort with random pivot has $O(n \log n)$ expected runtime even on adversarial input.
3. **Provable bounds without algorithmic complexity**: Karger's min-cut is much simpler than the deterministic Stoer-Wagner.
4. **Sublinear / constant-time approximations**: Monte Carlo lets you sample without examining all data.

## Probability + correctness

Las Vegas algorithms are always correct; their runtime is a random variable. Bounds are typically expected runtime + variance.

Monte Carlo algorithms have bounded runtime but may produce wrong answers with some probability $p$. Independent runs reduce error to $p^k$ — exponential decay.

## Examples

- **Quicksort with random pivot**: Las Vegas. Expected $O(n \log n)$, worst case $O(n^2)$ (probability $\to 0$).
- **Miller-Rabin primality test**: Monte Carlo. Polynomial time. Composite numbers detected with $\geq 1/2$ probability per round; $k$ rounds give error $2^{-k}$.
- **Karger's min-cut**: Monte Carlo. $O(V^2)$ per run; needs $O(V^2 \log V)$ runs for high probability.
- **Bloom filter** insertion: $O(k)$ where $k$ = number of hash functions; lookup may have false positives at rate $(1 - e^{-kn/m})^k$.
- **MinHash, HyperLogLog**: cardinality estimation in sublinear space with bounded error.

## Derandomization

Sometimes a randomized algorithm can be derandomized: replace random choices with structured deterministic ones that achieve the same effect. This is a deep area; for many problems it's open whether derandomization is possible.

The "BPP = P" conjecture: any problem solvable in randomized polynomial time is also solvable in deterministic polynomial time. Believed true but unproven.

## In ML

Randomization is everywhere:
- **Stochastic gradient descent**: random sample of training data per step.
- **Random forests**: random subsets of features + samples per tree.
- **Dropout**: randomly mask units during training.
- **Random projection**: dimensionality reduction via random matrices (Johnson-Lindenstrauss lemma).
- **Locality-sensitive hashing (LSH)**: approximate nearest-neighbor search via random hash functions.
- **MCMC**: random sampling from posterior distributions.

Modern ML is far more dependent on randomization than classical CS. Reproducibility ("set a seed and report it") is as important as correctness.
