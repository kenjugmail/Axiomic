---
title: Reward shaping: pragmatic accelerator or a slow way to learn the wrong thing?
postType: discussion
domainSlug: rl
author: bob
replies:
  - author: carol
    body: |
      Potential-based shaping is the principled escape hatch: if your shaping term is the difference of a potential function over states, the optimal policy is provably unchanged — you only change the learning dynamics, not the target. Anything outside that family is a bet that your proxy and the true objective agree, and that bet often loses.
  - author: alice
    body: |
      Empirically the failure is subtle: the agent doesn't obviously break, it quietly optimizes the proxy and looks fine on the shaped return while the true return stagnates. Always log the unshaped return as the metric of record, separate from the shaped signal the agent trains on.
  - author: bob
    body: |
      "Train on shaped, evaluate on unshaped, and stay potential-based unless you can afford to be wrong" — that's a defensible default. Appreciate the framing.
---

Reward shaping is everywhere in applied RL because sparse rewards are brutal, but half the war stories I hear end in "the agent gamed the shaped reward." Where do you all land?

- Do you restrict yourselves to potential-based shaping, or use ad-hoc bonuses and just watch closely?
- How do you detect that shaping has changed the optimum rather than just the learning speed?
