---
title: Where does p99 latency actually go in an LLM serving stack?
postType: question
domainSlug: systems
author: dave
replies:
  - author: alice
    body: |
      Almost never the matmuls. In the stacks I've profiled the p99 tail is queueing + scheduling: a long request holding a slot, batch formation waiting on stragglers, and KV-cache eviction churn under memory pressure. Profile the scheduler before you touch the kernels.
  - author: bob
    body: |
      Decode is memory-bandwidth bound, so the lever is usually batching policy and KV-cache layout, not raw FLOPs. Continuous batching plus a cap on max generated tokens flattens the tail more than any kernel tweak I've tried.
  - author: dave
    body: |
      That matches what I'm seeing — the tail moves with the admission/batching policy, and the GPU is half-idle during the worst spikes. Going to instrument queue time end-to-end before optimizing anything else.
---

Trying to bring down p99 on an inference service and I want to attack the right layer. For people running this in production:

- What's actually dominating your tail latency — prefill, decode, batching/scheduling, or host-side overhead?
- Which single change bought you the biggest tail reduction?
- What did you instrument to find it (vs. guessing)?
