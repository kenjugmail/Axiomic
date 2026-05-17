---
title: When do scaling laws stop being useful for a small team's decisions?
postType: discussion
domainSlug: ml
author: alice
replies:
  - author: bob
    body: |
      They're a planning tool, not a law of nature. The useful question for a small team isn't "what's the exponent" — it's "given my compute budget, is it better spent on more data, a bigger model, or more epochs?" A small scaling sweep over 3-4 model sizes answers that for your setup far better than a published exponent from a different data distribution.
  - author: carol
    body: |
      The failure mode I've seen: teams fit a curve on three points and extrapolate two orders of magnitude. The curve is real but the confidence interval at extrapolation is enormous, and data-quality cliffs aren't on the curve at all.
  - author: alice
    body: |
      Agreed on both — the actionable version is a local sweep to pick the next allocation, not a forecast to a regime nobody in the room has tested.
---

Scaling laws are great pedagogy and great for the labs that can spend at the frontier. For a team training models that fit on a handful of GPUs, where's the line between "useful planning tool" and "false precision"?

Concretely: have any of you actually changed a project decision because of a fitted scaling curve, vs. it just being a nice plot in the writeup?
