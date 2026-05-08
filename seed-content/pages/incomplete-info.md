---
title: Incomplete Information
category: game-theory
---
<!-- tier:intro -->
# Incomplete Information

A game has **incomplete information** when players don't know all the relevant features of the game — typically other players' payoffs, types, or capabilities.

Distinguished from **imperfect information**: imperfect-information games have unobserved past *actions* (poker: I don't know your hole cards). Incomplete-information games have unobserved *parameters* of the game itself (auction: I don't know your valuation).

The standard treatment converts incomplete-information games to imperfect-information ones via Harsanyi's [[bayesian-game]] formulation.

<!-- tier:undergrad -->
# Incomplete Information (Undergrad)

## The problem

Without knowing opponents' payoffs, you can't compute their best responses. Without their best responses, you can't reason about equilibrium. The naive model collapses.

## The Harsanyi fix

Treat each player's private information as a **type** drawn from a known distribution. Now the game is complete-information *over types*, and the standard equilibrium concept (Bayesian Nash) applies.

**Critical assumption**: the type distribution is common knowledge. Everyone knows everyone knows... that types are drawn from this prior. This is restrictive but tractable.

## Examples

- **Used-car market** (Akerlof's "lemons"): seller knows quality, buyer doesn't. Adverse selection drives high-quality cars out of the market. Mechanism design (warranties, certifications) solves it.
- **Insurance**: insured knows their risk, insurer doesn't. Adverse selection again. Risk-pooling + screening contracts.
- **Job market signaling** (Spence): employer doesn't know applicant ability; education serves as a costly signal.

## In ML

Federated learning has incomplete information about other clients' data distributions. Multi-agent RL ([[multi-agent-rl]]) often has incomplete information about other agents' reward functions. Auction-based ad systems ([[auction-theory]]) have incomplete information about advertisers' valuations.

<!-- tier:grad -->
# Incomplete Information (Grad)

## When the common prior fails

The common-prior assumption is the load-bearing fiction of Bayesian games. In reality:
- Different players have different beliefs.
- Beliefs may not be derivable from a single prior + different observations.
- "Robust" mechanism design (Bergemann-Morris 2005) drops the common-prior assumption, requires equilibria robust across belief structures.

## Connection to alignment

Modern AI alignment can be framed as a problem of incomplete information: humans don't fully know AI capabilities or "true" objectives; AI doesn't fully know human values. Inverse reward design (Hadfield-Menell 2017) treats alignment as a Bayesian game where the AI's prior over the principal's reward function is the alignment object.
