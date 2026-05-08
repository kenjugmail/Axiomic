---
title: Revelation Principle
category: game-theory
---
<!-- tier:intro -->
# Revelation Principle

The **revelation principle** (Myerson 1979): any social choice function implementable by *some* mechanism in Bayesian Nash equilibrium is also implementable by a *direct truthful* mechanism.

In plain English: if you're trying to design a mechanism that produces outcomes through any equilibrium concept, you might as well restrict attention to mechanisms that simply ask each agent for their type and use it directly — making truth-telling the optimal strategy.

This collapses the design space: instead of searching over arbitrary mechanisms × all possible equilibria, you only search over allocation rules + payment rules that satisfy incentive compatibility.

<!-- tier:undergrad -->
# Revelation Principle (Undergrad)

## The proof, intuitively

Suppose mechanism $M$ produces outcome $f(t)$ in equilibrium. Construct a new mechanism $M'$:
1. Ask each agent for their type.
2. Internally simulate $M$ as if each agent had played their equilibrium strategy in $M$ at their reported type.
3. Output $M$'s result.

Claim: truth-telling is optimal in $M'$. If lying about your type were beneficial in $M'$, the same lie would have been beneficial in $M$ (deviating to whatever strategy you'd play under the lied type). But by assumption, the original strategy was equilibrium in $M$. Contradiction.

The principle works for dominant-strategy implementation, Bayesian Nash, ex-post implementation — separate revelation principles for each.

## Why it matters

The revelation principle reduces "design any mechanism, analyze any equilibrium" to "design an incentive-compatible direct revelation mechanism." This is what makes mechanism design tractable as a mathematical theory.

Specifically: it says the search for optimal mechanisms is a search over functions $\{(g(t), p(t))\}$ subject to **incentive constraints** (truth-telling is best response) and **individual rationality** (participation is profitable). These are linear constraints; the optimization is solvable.

<!-- tier:grad -->
# Revelation Principle (Grad)

## When it fails

The revelation principle assumes:
- **Common knowledge of the mechanism**: everyone knows the rules.
- **No bounded rationality**: agents can compute equilibria.
- **No commitment problems**: the designer commits to executing the mechanism's output.

When these fail (e.g., agents are computationally bounded, the designer can't commit), indirect mechanisms can outperform direct revelation. The revelation principle's elegance hides assumptions that often don't hold in practice.

## Limits

In **dynamic** mechanism design (Bayesian persuasion, repeated mechanisms), the revelation principle still holds but the "type" must be expanded to include all signals received over time. The truthful direct mechanism becomes computationally infeasible.

In **algorithmic** mechanism design, even the static revelation principle becomes weaker — finding the truthful optimal mechanism may itself be NP-hard, even though the principle says one exists.
