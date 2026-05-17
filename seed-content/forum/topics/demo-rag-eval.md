---
title: How are you actually evaluating RAG systems beyond "looks right"?
postType: question
domainSlug: ml
author: dave
replies:
  - author: alice
    body: |
      Separate retrieval from generation. For retrieval I track recall@k and nDCG against a labeled query→passage set; for generation I use a faithfulness check (is every claim supported by a retrieved chunk?) plus answer correctness. Conflating the two hides which half is failing.
  - author: bob
    body: |
      The faithfulness metric is the one people skip and it's the one that matters in production. A held-out set of question/answer/source triples scored by an LLM judge with a strict rubric correlates well enough with human ratings for regression testing, as long as you spot-check the judge.
  - author: carol
    body: |
      Add an ablation where you feed the gold passages directly. If answer quality barely moves with perfect retrieval, your bottleneck is the generator, not the index — and a lot of "RAG" effort is then misdirected.
  - author: dave
    body: |
      The gold-passage ablation is a great call, thanks — that single experiment would have saved me a week.
---

I keep seeing RAG pipelines shipped with no eval beyond eyeballing a few outputs. For those of you running retrieval-augmented systems in production:

- What metrics actually correlate with user-perceived quality?
- How do you separate a retrieval failure from a generation failure?
- Is anyone doing automated regression testing on the pipeline, and if so against what reference set?
