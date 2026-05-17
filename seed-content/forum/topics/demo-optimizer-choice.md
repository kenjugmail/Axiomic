---
title: Is AdamW still the default in 2026, or has the field moved on?
postType: discussion
domainSlug: ml
author: bob
replies:
  - author: alice
    body: |
      For most fine-tuning workloads AdamW is still the safe default — predictable, well-understood, and the failure modes are documented. The interesting movement is at pre-training scale where memory pressure makes the optimizer state itself a cost.
  - author: dave
    body: |
      Practically: I reach for AdamW first, and only consider alternatives when the optimizer state genuinely doesn't fit or when I have a stable enough setup to risk a less-battle-tested choice. "Boring default + good schedule + gradient clipping" beats a fancy optimizer with a bad schedule almost every time.
  - author: bob
    body: |
      That's the consensus I was expecting — schedule and clipping dominate the optimizer choice in the regime I care about. Good to have it stated plainly.
---

Genuine question, not rage-bait: across your last few projects, what did you actually train with?

I ask because tutorials still default to AdamW, but the memory cost of the optimizer state is non-trivial at scale and there's a steady stream of "X beats Adam" papers that rarely replicate. Curious what people are running in practice vs. what they'd recommend a newcomer start with.
