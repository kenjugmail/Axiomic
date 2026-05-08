---
title: Mechanism Design
category: game-theory
---
<!-- tier:intro -->
# Mechanism Design

**Mechanism design** is reverse game theory: instead of analyzing the equilibria of a given game, you *design* the rules so the resulting equilibrium produces a desired outcome.

The classic question: how do you allocate a scarce resource among bidders with private valuations, in a way that's both efficient (resource goes to who values it most) and incentive-compatible (bidders don't want to lie)?

Hurwicz, Maskin, and Myerson shared the 2007 Nobel for this. Modern applications: ad auctions ([[auction-theory]]), kidney exchange, school choice, spectrum auctions.

<!-- tier:undergrad -->
# Mechanism Design (Undergrad)

## Setup

- Players have private types $t_i$ (valuations, costs, capabilities).
- Designer specifies a mechanism $(g, p)$: an allocation rule $g(t)$ and payment rule $p(t)$.
- Players report types $\hat{t}_i$ (possibly truthfully, possibly not).
- Designer commits to executing $g(\hat{t})$ + $p(\hat{t})$.

A mechanism is **truthful** (or **strategy-proof**, or **incentive-compatible**) iff truth-telling is a dominant strategy for every player.

## The revelation principle

[[revelation-principle]] (Myerson): for any mechanism that achieves outcome $X$ in equilibrium, there's a *truthful direct revelation* mechanism that achieves the same $X$.

Implication: when designing a mechanism, you can WLOG focus on truthful direct mechanisms. The harder mechanisms (Bayesian Nash equilibria of indirect mechanisms) buy you nothing in terms of feasibility.

## VCG — the canonical truthful mechanism

The **Vickrey-Clarke-Groves** mechanism ([[vcg-auction]]) is truthful in dominant strategies for any payoff structure linear in types. Each agent's payment equals the externality they impose on others.

- Single-item: VCG = second-price auction. Truthful.
- Multi-item with complementarities: VCG works but can have empty core (revenue can be lower than competing bids' total).

## Limits

**Myerson-Satterthwaite theorem**: in a bilateral trade with two-sided private info, no mechanism can be simultaneously efficient, individually rational, budget-balanced, and incentive-compatible. You always have to give something up.

This is the deep no-go result of mechanism design — perfection is impossible, design is always a tradeoff.

<!-- tier:grad -->
# Mechanism Design (Grad)

## Algorithmic mechanism design

When agents are computationally bounded or the allocation problem is itself computationally hard, classical mechanism design results break.

**Approximation mechanisms**: relax efficiency in exchange for tractability + incentive compatibility (Nisan-Ronen 2001, Lehmann-O'Callaghan-Shoham 2002).

**Combinatorial auctions**: when bidders bid on bundles, the winner-determination problem is NP-hard. VCG with approximate winner determination loses truthfulness; designing truthful approximation algorithms is its own subfield.

## Connection to AI alignment

[[principal-agent]] problems are special cases of mechanism design where the principal (human) tries to elicit truthful behavior from an agent (AI) with private information about its own capabilities and intentions. The alignment problem is partly a mechanism-design problem: design training procedures + reward functions such that the equilibrium policy aligns with human values, even when the AI knows things humans don't.
