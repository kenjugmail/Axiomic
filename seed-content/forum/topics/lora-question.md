---
title: When does LoRA fail to match full fine-tuning? Looking for failure-mode taxonomy
postType: question
domainSlug: ml
wikiPageSlug: lora
author: dave
replies:
  - author: alice
    body: |
      The empirical paper I'd start with is Hu et al.'s original LoRA paper plus the follow-up by Biderman et al. on "LoRA Learns Less and Forgets Less." Their finding: LoRA underperforms full FT on tasks that require learning *new* domains/distributions, but matches it on tasks that require *adapting* existing knowledge.
  - author: bob
    body: |
      A useful frame: think of LoRA as a low-rank perturbation of the base model. It's expressive enough when the optimal solution is close (in operator norm) to the base — and expressive-bottlenecked when it isn't. That predicts the failure modes Alice mentions.
  - author: carol
    body: |
      Concrete failure modes I've seen:
      1. Heavy domain shift (medical, legal jargon)
      2. Long-horizon code generation requiring new tools/APIs
      3. Multimodal grafting (adding a new modality)
      4. RLHF-style preference optimization (sometimes LoRA misses)
      
      The common thread is "the new task requires updating low-frequency directions in weight space that low-rank perturbations can't reach efficiently."
---

I'm seeing mixed claims in the literature about when LoRA matches full fine-tuning and when it doesn't, and I'd love a cleaner taxonomy.

Anecdotally I've heard:
- "LoRA always works, full FT is wasteful"
- "LoRA breaks under heavy domain shift"
- "LoRA is fine for instruction tuning but bad for continued pretraining"

Are there empirical papers with controlled comparisons? What's the current state of the literature on *when* LoRA's low-rank assumption is the right inductive bias?
