---
title: Quantum Machine Learning
category: quantum
---
<!-- tier:intro -->
# Quantum Machine Learning (QML)

The intersection of quantum computing and machine learning.

The most-hyped quantum subfield; real advantages are limited.

**Major directions**:
- Variational quantum classifiers (VQC).
- Quantum kernels.
- Quantum-assisted classical ML (specific subroutines).
- Quantum data ML (ML on quantum-system outputs).

**Reality check**: most QML on classical data hasn't beaten classical ML. Provable QML advantages exist for specific synthetic tasks. Real-world application advantages: limited.

<!-- tier:undergrad -->
# QML (Undergrad)

## Variational quantum classifiers (VQC)

A parameterized quantum circuit acts as a classifier:
1. Encode classical data `x` into quantum state `|x⟩`.
2. Apply parameterized circuit `U(θ)`.
3. Measure; map outcome to class label.
4. Train `θ` via gradient descent on classification loss.

**Strengths**:
- Compact (few parameters).
- Quantum-native; can in principle exploit superposition + interference.

**Weaknesses**:
- Training is hard (barren plateaus).
- Encoding cost dominates: classical-to-quantum conversion is itself expensive.
- No clear advantage over classical classifiers on standard benchmarks.

## Quantum kernels

**Idea**: compute kernel function `K(x, y) = |⟨φ(x)|φ(y)⟩|²` on quantum hardware; pass to classical SVM.

**Hope**: quantum feature map `|φ(x)⟩` may be classically hard to compute, giving expressive kernels classical can't.

**Liu-Arunachalam-Temme 2021**: provable quantum advantage on a synthetic problem (Discrete Logarithm SVM). First rigorous separation.

**Reality**: synthetic problems show advantage. Real-world data hasn't shown clear advantage; classical kernels typically competitive.

## Quantum-assisted classical ML

**HHL (Harrow-Hassidim-Lloyd)**: solves sparse linear systems in `O(log N)` quantum time vs `O(N)` classical (under conditions). Could accelerate ML methods involving large matrix solves (regression, kernel methods).

**Catch**: many caveats — input sparsity, condition number, ability to extract output. Most "exponential speedups" disappear under these conditions.

Aaronson 2015: dequantization showed many HHL applications are matched by classical algorithms with similar input assumptions.

## Quantum data ML

**Quantum-native ML**: ML applied to quantum data (chemistry simulation outputs, condensed-matter states, quantum sensor measurements).

**Strong fit**: quantum data is naturally encoded in quantum states; quantum processing avoids classical-quantum encoding bottleneck.

**Examples**:
- Phase classification of quantum states.
- Ground-state preparation via ML-guided VQE.
- Quantum metrology.

This is where QML may shine first: when the data IS quantum.

## The reality check

Most QML demos:
- Classical data encoded in quantum form.
- Encoding cost dominates any speedup.
- Classical methods competitive or better.

QML hype vastly exceeds practical impact today. Genuine research interest exists; commercial applications are narrow.

For ML practitioners in 2026: QML is mostly a research bet. Classical ML still dominates.

<!-- tier:grad -->
# QML (Grad)

## Theoretical foundations

**Quantum learning theory**: PAC learning extended to quantum settings. Sample-complexity advantages for some learning tasks.

**Quantum statistical-query model**: quantum queries to a function; what's learnable vs not.

**Recent**: rigorous separations (Liu et al., Sweke et al.) on synthetic tasks. Real-world relevance debated.

## Barren plateaus in QML

Same issue as VQE/QAOA: gradient variance vanishes exponentially in qubit count for random ansätze.

**Mitigations**:
- Structured ansätze (problem-aware).
- Layer-wise training.
- Initialization strategies.

Open research; same limits as VQE.

## Quantum kernels details

**Feature map circuit**: `|φ(x)⟩ = U_φ(x)|0⟩`.

**Kernel**: `K(x, y) = |⟨φ(x)|φ(y)⟩|² = |⟨0| U_φ(x)† U_φ(y) |0⟩|²`.

**Expressivity**: high-depth feature maps can produce kernels classically hard to compute.

**Trainability**: high-expressivity often comes with concentration of measure — kernel approaches a constant for random data, becoming useless.

Trade-off between expressivity + trainability is a key design issue.

## Recent QML results (2024-2025)

**Provable advantages**:
- Discrete-log SVM (Liu et al. 2021).
- Specific structured datasets where quantum kernels separate.

**Empirical results**:
- VQC on MNIST + Iris: comparable to classical, no clear advantage.
- Quantum convolutional networks: research-frontier.
- Quantum Boltzmann machines: theoretical framework; few practical demonstrations.

**Quantum-data ML**:
- Phase recognition in condensed-matter systems.
- Quantum sensing inference.
- Promising; specific applications.

## Dequantization

**Tang 2019** + others: showed many HHL-based QML algorithms have classical counterparts with similar performance under reasonable input assumptions.

The pattern: HHL needs `1/condition_number` precision; classical algorithms with similar memory access can achieve the same.

**Implication**: many proposed QML "exponential speedups" reduce to polynomial improvements at best on real data.

## Quantum neural networks (QNN)

**Architectures**:
- Parameterized quantum circuits as neural networks.
- Quantum convolutional networks (QCNN) for translation invariance.
- Quantum recurrent networks (limited).

**Limits**:
- Same barren-plateau issues.
- Encoding cost.
- Expressivity vs trainability.

QNNs are research vehicles; production ML doesn't use them.

## Practical advice

**Don't bet ML production on quantum advantage today**. Real impact is years away.

**Watch**:
- Quantum chemistry + materials science (where data is quantum-native).
- Niche kernel applications with structured data.
- Long-term: post-fault-tolerance.

**Skeptical evaluation**: most QML claims are research demos, not production breakthroughs.

## References

- Biamonte et al. 2017. Quantum machine learning. *Nature*. (Comprehensive review.)
- Schuld & Petruccione 2018. *Supervised Learning with Quantum Computers*.
- Liu, Arunachalam, Temme 2021. A rigorous and robust quantum speedup in supervised machine learning.
- Aaronson 2015. Read the fine print. *Nature Physics*. (Caveats on QML claims.)
- Tang 2019. A quantum-inspired classical algorithm for recommendation systems. (Dequantization.)
