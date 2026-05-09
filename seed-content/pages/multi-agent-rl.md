---
title: Multi-Agent Reinforcement Learning
category: game-theory
---
<!-- tier:intro -->
# Multi-Agent Reinforcement Learning

**Multi-agent RL (MARL)** trains agents whose environment includes other learning agents. The setting is fundamentally harder than single-agent RL because:

- The environment is **non-stationary** from any agent's perspective — others are learning too.
- Equilibrium concepts ([[nash-equilibrium]]) replace optimal-policy concepts.
- Self-play, opponent modeling, population-based training, and centralized critics are the dominant techniques.

Modern landmarks: AlphaZero (perfect-information zero-sum), OpenAI Five (Dota), AlphaStar (StarCraft), Pluribus (poker), Cicero (Diplomacy).

<!-- tier:undergrad -->
# Multi-Agent RL (Undergrad)

## Three regimes

**Cooperative** (shared reward): all agents work toward a single team objective. Centralized training + decentralized execution (CTDE) is the dominant paradigm — at training time agents see each other's observations + a global critic; at deployment they act on local observations alone.

**Competitive zero-sum**: classical [[zero-sum]]; [[self-play]] converges to minimax equilibrium under right conditions (no-regret learning, sufficient exploration).

**General-sum (mixed)**: hardest. Equilibria are not unique; convergence guarantees are weaker; reward shaping + opponent modeling become critical.

## Self-play

Train an agent against copies of itself. In two-player zero-sum games, this provably converges in time-average to the Nash equilibrium. In general-sum games, self-play can collapse, cycle, or converge to "bad" equilibria.

**Population-based training** (PBT) generalizes: maintain a population of agents, train each against sampled others, retire and replace weak performers. Used in AlphaStar.

## Centralized training, decentralized execution

For cooperative MARL, the standard pattern:
- **Centralized critic** $Q(s, a_1, ..., a_n)$ at training time.
- **Decentralized policies** $\pi_i(a_i | o_i)$ at deployment.

MADDPG, COMA, QMIX are variants of this pattern. They handle the non-stationarity: the critic sees the full picture even though policies are local.

<!-- tier:grad -->
# Multi-Agent RL (Grad)

## Why convergence is hard

In single-agent RL, the environment is fixed; learning improves performance monotonically (in expectation, for compatible algorithms). In MARL, all agents are learning simultaneously — the "environment" each agent sees is the joint behavior of others, which keeps changing.

This produces:
- **Cycling**: rock-paper-scissors-style; no stable point.
- **Catastrophic forgetting**: agent A learns to beat B's strategy, B updates, A's old strategy becomes useless.
- **Mode collapse**: in cooperative games, policies can collapse to trivial coordination.

## Modern frontier

- **PSRO (Policy Space Response Oracles)** (Lanctot 2017): iteratively expand a population of policies, computing best responses against the empirical mixture.
- **Policy gradient with opponent learning awareness (LOLA)** (Foerster 2018): differentiate through the opponent's expected update.
- **MARL with mean-field approximations**: tractable for large populations of identical agents.

## Connection to alignment

Multi-agent RL surfaces the alignment problem in stark form: even when each agent's reward is well-defined, the *joint* equilibrium can be terrible (tragedy of the commons in MARL training environments). Mechanism design ([[mechanism-design]]) of the training environment matters as much as agent architecture. The intersection of MARL + mechanism design + AI safety is one of the highest-stakes research frontiers.
