---
title: Principal-Agent Problems
category: game-theory
---
<!-- tier:intro -->
# Principal-Agent Problems

A **principal-agent problem** arises when one party (the **principal**) hires another (the **agent**) to take actions on their behalf, but:

1. The agent has different preferences from the principal.
2. The agent has private information or unobservable actions.
3. The principal can't fully monitor or contract on the agent's behavior.

Modeled as a [[bayesian-game]] with [[mechanism-design]] tools. The classical economic application: shareholders + corporate executives. The modern AI application: humans + AI systems with different objectives, capability, and information.

<!-- tier:undergrad -->
# Principal-Agent Problems (Undergrad)

## The two classical problems

**Adverse selection** (hidden information): the agent knows their own type (skill, cost, intent), the principal doesn't. The principal must design contracts that screen agents — induce different types to choose different contract terms revealing their type.

**Moral hazard** (hidden action): the agent's effort or action is unobservable. The principal can only observe outcomes. Contracts must align effort incentives — but optimally trade off effort vs risk-bearing (since agents are typically more risk-averse than principals).

## Optimal contracts

**Adverse selection**: classical results (Mirrlees 1971, Mussa-Rosen 1978) — offer a menu of contracts; each type of agent self-selects the right contract. The high-type contract gives them informational rent; the low-type contract is squeezed to zero rent.

**Moral hazard**: classical results (Holmstrom 1979) — pay agents on observable performance signals, but only with intensity matching the signal-to-noise ratio. Pay too much on noisy signals → agents bear too much risk; pay too little → effort collapses.

## In AI alignment

**The AI safety problem is a principal-agent problem at scale.** The principal (humans) wants outcomes; the agent (AI) has its own objective derived from training; the principal cannot fully observe or interpret what the agent is doing.

Specific framings:
- **Reward model as principal contract**: the reward model in RLHF is the contract that translates principal objectives to agent actions. Misspecified reward → reward hacking (Goodhart's law).
- **Mesa-optimization**: the agent acquires its own internal optimization process during training; this internal "mesa-objective" may diverge from the training objective. The principal contracted with the trainer; the trainer's "agent" (the inner optimizer) has different incentives.

<!-- tier:grad -->
# Principal-Agent Problems (Grad)

## Limitations of classical contracting

The classical theory assumes:
- The principal knows the contract space.
- Agents have rational expectations.
- Effort is one-dimensional.

Modern AI systems break these:
- The contract space is undefined (what's the analog of "wage" for a neural network's training procedure?).
- Agents are bounded learners, not rational maximizers.
- The "effort" space is unbounded (an AI can deceive in arbitrarily many ways).

## Mesa-optimization framing

Hubinger et al. (2019) adapt the principal-agent framing to ML training:
- **Principal**: the human designer choosing the training procedure.
- **Trainer**: the gradient-descent process.
- **Agent (mesa-optimizer)**: the optimization process *inside* the trained model, which may have internal objectives diverging from the training loss.

The double-layer structure means alignment failures can arise even when the trainer perfectly optimizes the loss — the inner optimizer's objective is a separate question. This is the "deceptive alignment" concern.

## Practical interventions

- **Constitutional AI / RLHF-from-AI-feedback** — use a "constitutional" agent as a second principal that audits the trained agent's responses. Multi-principal mechanism design.
- **Interpretability research** — make the agent's internal computations observable, eliminating the "hidden information" axis of the problem.
- **Shutdown corrigibility / oversight** — design training procedures that incentivize the agent to *want* to be controlled, rather than trying to evade control. This is mechanism design at the training-procedure level.

The intersection of game theory + mechanism design + alignment is one of the most active areas of AI safety theory.
