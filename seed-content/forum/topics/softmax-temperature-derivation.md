---
title: Derivation — temperature in softmax as the inverse of an energy-based model's beta
postType: derivation
domainSlug: ml
wikiPageSlug: softmax
author: carol
replies:
  - author: alice
    body: |
      Nice connection. I'd add that as $T \to 0$ the softmax becomes a hardmax (one-hot at the argmax) and the entropy goes to zero, while as $T \to \infty$ it becomes uniform and the entropy is maximized at $\log K$. That's the boundary behavior consistent with the statistical mechanics analogy.
  - author: dave
    body: |
      The connection to free energy is also satisfying: $-T \log \sum_i \exp(z_i / T)$ is the free energy of the system, and minimizing free energy gives the soft argmax distribution.
  - author: bob
    body: |
      Worth flagging: the temperature parameter in transformer decoding is *not* the same as a learned softmax temperature inside attention — they live at different layers and serve different purposes. People conflate them.
---

I want to walk through why softmax temperature is the same object as inverse temperature $\beta$ in a Boltzmann distribution.

Start with the Boltzmann distribution over discrete states with energies $E_i$:

$$p_i = \frac{e^{-\beta E_i}}{\sum_j e^{-\beta E_j}}$$

In ML, we typically have *logits* $z_i$ which are negative energies up to a constant, so $E_i = -z_i$:

$$p_i = \frac{e^{\beta z_i}}{\sum_j e^{\beta z_j}}$$

Now substitute $\beta = 1/T$:

$$p_i = \frac{e^{z_i / T}}{\sum_j e^{z_j / T}}$$

Which is exactly softmax with temperature $T$. So:

- High $\beta$ (low $T$) ↔ "cold" distribution, peaked at the maximum.
- Low $\beta$ (high $T$) ↔ "hot" distribution, more uniform.

The thermodynamic analogy isn't just metaphor — it's an isomorphism, and entropy/free-energy intuitions transfer cleanly.
