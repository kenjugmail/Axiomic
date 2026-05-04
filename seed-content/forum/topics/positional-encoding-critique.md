---
title: Critique — sinusoidal positional encodings are a historical artifact, not a principled choice
postType: critique
domainSlug: ml
wikiPageSlug: positional-encoding
author: dave
replies:
  - author: alice
    body: |
      I think you're being slightly unfair. Sinusoidal encodings *do* have a property nothing else gives you for free: any positional offset $k$ can be expressed as a linear function of the original encoding. That's a real algebraic structure that the model can in principle exploit.
  - author: dave
    body: |
      Granted — but does any trained model actually exploit it? My read of the mechanistic interpretability literature is that learned positional embeddings do approximately the same thing, and RoPE is strictly better when you care about extrapolation.
  - author: bob
    body: |
      The strongest version of the critique is: sinusoidal encodings were chosen to give a property (extrapolation to longer sequences) that the resulting models *don't actually achieve*. If the property doesn't transfer, the design rationale is moot.
  - author: carol
    body: |
      Worth distinguishing: the original sinusoidal scheme is weak, but the broader family of frequency-based encodings (RoPE, ALiBi, NoPE+ALiBi hybrids) is alive and well. The critique should land on Vaswani-style sinusoidal specifically, not on frequency methods in general.
---

The 2017 transformer paper introduced sinusoidal positional encodings with the justification that "we hypothesized it would allow the model to easily learn to attend by relative positions." This is a hypothesis, not a proof. Eight years later:

- Most production-scale models use **learned** positional embeddings or **RoPE**, not sinusoidal.
- Empirical extrapolation to longer-than-training sequences is *not* a property sinusoidal encodings deliver in practice.
- The chosen frequencies (geometric progression from $2\pi$ to $10000 \cdot 2\pi$) are unmotivated except by appeal to convenience.

I want to argue that the original sinusoidal scheme persists in textbooks more out of historical inertia than because it's a good design. Tutorials that present it without the empirical follow-up are misleading students.

Counter-arguments welcome. What does sinusoidal still get right that I'm missing?
