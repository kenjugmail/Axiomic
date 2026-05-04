---
title: Induction heads are the canonical building block of in-context learning
postType: claim
domainSlug: ml
wikiPageSlug: induction-heads
author: alice
replies:
  - author: bob
    body: |
      Strong claim, and I think it's overstated. Induction heads are *one* mechanism — but Olsson et al. show in-context learning improves continuously well past the formation of the first induction circuit. There's clearly more going on.
  - author: carol
    body: |
      Agreed with bob's framing. The phase transition during training is striking, but mechanistic interpretability has since identified other circuits — especially in larger models — that contribute to ICL in ways that don't reduce to "match the previous occurrence."
  - author: dave
    body: |
      What I find most interesting: the *prevalence* of induction heads scales with model size and training data, but their *importance per head* drops. Suggests redundancy. Has anyone seen a clean ablation that isolates ICL contribution by head?
  - author: alice
    body: |
      Fair pushback. I'd weaken the claim to: induction heads are the **earliest sufficient** mechanism for ICL, and remain a load-bearing component even as models add other circuits on top. Does that sound right?
---

I want to argue that induction heads (Olsson et al., 2022) are the canonical building block for in-context learning in transformer language models, and that other proposed circuits are best understood as variations or extensions of this primitive.

The argument has three parts:

1. **Universality.** Induction heads form reliably across architectures, scales, and training distributions, in a sharp phase transition during training.
2. **Sufficiency.** A two-layer attention-only transformer with induction heads can implement non-trivial in-context learning.
3. **Causal role.** Ablating induction heads degrades ICL benchmarks more than ablating randomly-chosen heads.

I'd love to hear counter-examples or alternative primitives that meet all three criteria.
