---
title: Why does attention scale by 1/sqrt(d_k) and not 1/d_k or 1/log(d_k)?
postType: question
domainSlug: ml
wikiPageSlug: attention
author: bob
replies:
  - author: alice
    body: |
      The Vaswani et al. paper gives the "softmax saturation" argument: for two random vectors $q, k \in \mathbb{R}^{d_k}$ with i.i.d. zero-mean unit-variance components, $q \cdot k$ has variance $d_k$. So $\sqrt{d_k}$ is the unique scale that keeps the dot product variance fixed at 1 regardless of dimension.
  - author: carol
    body: |
      Right — and the practical reason is that without it, the softmax becomes increasingly peaked as $d_k$ grows. Once one logit dominates, the softmax gradient with respect to the others vanishes. This is empirically catastrophic for training.
  - author: dave
    body: |
      I'd add: $1/d_k$ would *over*-correct (driving logits toward zero), and $1/\log(d_k)$ would under-correct (variance still grows). The square-root is the right power for variance preservation.
  - author: bob
    body: |
      Thanks all — the variance argument is what I was missing. Is there a regime where a different scaling helps? E.g., I've seen papers claim that for very long sequences with sparse attention, the optimal scaling is different.
---

I understand that attention divides $QK^T$ by $\sqrt{d_k}$ before the softmax, but I've never been satisfied with the explanations. Why exactly the square root?

Specifically:

- Is there a derivation that picks out $\sqrt{d_k}$ uniquely vs. just "any sublinear function of $d_k$"?
- Are there empirical studies of alternative scalings?
- Does the answer change in regimes where keys/queries are *not* approximately Gaussian (e.g., after layer norm with learned affine, or in very early training)?
