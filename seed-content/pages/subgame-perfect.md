---
title: Subgame Perfect Equilibrium
category: game-theory
---
<!-- tier:intro -->
# Subgame Perfect Equilibrium

A **subgame-perfect equilibrium** (SPE) is a [[nash-equilibrium]] that survives in every subgame. The refinement rules out equilibria sustained by **incredible threats** — threats that wouldn't actually be carried out if the moment came.

Found by **backward induction** in finite games of perfect information ([[extensive-form]]).

<!-- tier:undergrad -->
# Subgame Perfect Equilibrium (Undergrad)

## Why Nash isn't enough

Consider entry deterrence:
- Incumbent threatens: "If you enter, I'll fight."
- Entrant: stays out.
- This is a Nash equilibrium given the incumbent's announced strategy.

But if the entrant enters, fighting is *more* expensive for the incumbent than accommodating. The incumbent wouldn't actually fight — the threat is **incredible**.

SPE rules this out: the equilibrium must specify behavior at *every* node, including ones not reached on the equilibrium path, and that behavior must itself be optimal at that node.

## Backward induction

In finite games of perfect information, SPE is found by backward induction:
1. Start at terminal subgames.
2. At each, players choose optimally.
3. Replace the subgame with its equilibrium value.
4. Repeat upward to the root.

The result is the unique SPE (when there are no ties).

## In repeated games

SPE in repeated games admits cooperation that one-shot Nash equilibrium doesn't. The **folk theorem**: in infinitely repeated games with sufficiently patient players, any individually rational payoff profile can be sustained as an SPE (via grim-trigger or similar punishment strategies).

Cooperation is sustainable when defection's short-term gain is outweighed by the long-term cost of triggered punishment. The discount factor $\delta$ determines what's sustainable.

<!-- tier:grad -->
# Subgame Perfect Equilibrium (Grad)

## Limitations

SPE is too permissive in some settings:
- **Multiple SPEs**: many strategy profiles can be sustained; equilibrium selection unsolved.
- **Imperfect information**: SPE doesn't apply directly; you need the stronger sequential equilibrium concept (Kreps-Wilson 1982) to handle out-of-equilibrium beliefs.
- **Bounded rationality**: backward induction assumes hyperrational play arbitrarily far in the future. Empirically humans don't reason this deeply (centipede game).

## In RL training

Self-play training in sequential games is, implicitly, searching for SPE. AlphaZero's value function approximates the value at each subgame; the policy approximates the SPE strategy at each node.

The policy-improvement step in MCTS-PUCT corresponds to the backward-induction step in SPE. The function approximator generalizes across similar positions.

For imperfect-information games (poker), SPE doesn't directly apply; CFR variants target sequence-form Nash equilibria instead.
