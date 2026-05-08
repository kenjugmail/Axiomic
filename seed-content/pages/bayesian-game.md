---
title: Bayesian Games
category: game-theory
---
<!-- tier:intro -->
# Bayesian Games

A **Bayesian game** models strategic interaction with **incomplete information** ([[incomplete-info]]) — players don't know each other's payoffs, types, or capabilities.

Each player has a **type** (private information). Common knowledge: a probability distribution over the joint types. Each player chooses a strategy that maps their type to an action.

The equilibrium concept is **Bayesian Nash equilibrium**: each type's strategy is a best response to the *expected* strategies of other players (averaged over their possible types using the common prior).

Examples: bidding in auctions ([[auction-theory]]) where you don't know rivals' valuations; signaling games where one party knows their own quality but the other doesn't.

<!-- tier:undergrad -->
# Bayesian Games (Undergrad)

## Harsanyi's transformation

Harsanyi (1967) showed any incomplete-information game can be reformulated as a complete-information game over an enlarged state space (types). This is the standard construction:

1. Nature draws a type profile $(t_1, ..., t_n)$ from the common-prior distribution.
2. Each player observes their own type.
3. Players choose actions; payoffs depend on actions and types.

The **Bayesian Nash equilibrium**: a strategy $\sigma_i(t_i)$ for each player and type, such that each type's action maximizes their expected payoff given other players' strategies and the conditional distribution of others' types.

## Auction example (first-price, two bidders)

Each bidder $i$ has private valuation $v_i$ uniform on $[0, 1]$. Strategy: bid $b_i(v_i)$.

In equilibrium, both bidders shade their bids: $b(v) = v/2$ (for risk-neutral, two-bidder case). Why? Because bidding too close to your value gives up surplus; bidding too low loses too often. The equilibrium balances.

This is the workhorse model of auction theory and underlies the design of online ad auctions.

## Connection to mechanism design

[[mechanism-design]] is the inverse problem: given desired outcomes, design payoff rules so the resulting Bayesian Nash equilibrium produces them. The **revelation principle** says any social choice function implementable in Bayesian Nash is implementable in a *truthful direct revelation mechanism*.

<!-- tier:grad -->
# Bayesian Games (Grad)

## Common prior assumption

Bayesian Nash assumes a **common prior** over types — all players agree on the distribution. This is restrictive: real players have different beliefs, and there's no obvious selection of "the right" common prior.

Alternative frameworks:
- **Interim equilibrium**: each type has its own beliefs about others' types; consistency required only locally.
- **Robust mechanism design** (Bergemann & Morris 2005): require equilibrium for *all* type-belief combinations consistent with observed payoffs.

## In ML / AI

Bayesian games appear in:
- **Recommender systems / ad auctions**: bidders' valuations are private; the auction must elicit truthfully.
- **Multi-agent RL with heterogeneous agents**: agents may have private rewards, capabilities, or beliefs.
- **AI safety** ([[principal-agent]]): the principal doesn't know the agent's full objective function or capabilities. Treating the agent as having a private "type" is one way to formalize the alignment problem.
