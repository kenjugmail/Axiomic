---
title: Practical sanity checks before trusting an observational causal estimate?
postType: question
domainSlug: causal
author: carol
replies:
  - author: bob
    body: |
      Draw the DAG before you touch the data and commit to it. Then: a negative-control outcome (something the treatment can't plausibly affect — if you "find" an effect there, you have residual confounding), and a placebo/pre-treatment test where the effect should be zero.
  - author: alice
    body: |
      Sensitivity analysis is the one people skip: how strong would an unmeasured confounder have to be to overturn your conclusion? If the answer is "barely correlated with both," your estimate isn't decision-grade no matter how tight the CI looks.
  - author: dave
    body: |
      And report the estimate under two or three defensible adjustment sets, not one. If it swings wildly across plausible specifications, that instability *is* the finding.
  - author: carol
    body: |
      Negative control + sensitivity bound + multi-specification stability — that's a clean checklist I can actually put in a writeup. Thanks all.
---

Observational causal estimates get reported with a lot more confidence than they deserve. For those who do this in practice, what's the minimum checklist before you'd let a stakeholder act on an effect estimate from non-experimental data?

I'm less interested in the estimator zoo and more in the cheap checks that catch "this is just confounding."
