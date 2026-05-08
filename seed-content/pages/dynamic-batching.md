---
title: Dynamic / Continuous Batching
category: systems
---
<!-- tier:intro -->
# Continuous Batching

Continuous batching (sometimes called dynamic batching, or batching-as-you-go) is the technique that turns LLM inference from "static batch of N requests" into "fluid pool of running sequences." Originated in Yu et al. 2022 (Orca); popularized by vLLM.

The win: 2-5× throughput on heterogeneous workloads compared to static batching, at comparable or better latency.

<!-- tier:undergrad -->
# Continuous Batching (Undergrad)

## The static-batch problem

Naive batched inference: collect K requests, run forward, return. Two problems on real workloads:

**Heterogeneous output lengths.** Request A wants 50 output tokens; B wants 500. Static batching either waits for B (wasting compute on A's already-finished tokens) or truncates B (wasting useful output).

**Variable arrival times.** Some requests arrive late and have to wait for the next batch to fill. Latency suffers.

The result: typical static-batch utilization is ~30-50% of theoretical throughput.

## Continuous batching mechanics

Treat the running batch as a fluid pool. Per step:

1. Run forward on every active sequence.
2. For each sequence: if it sampled EOS or hit max length, mark it finished; emit its tokens to the user; free its slot.
3. Admit new requests from the queue into freed slots.

```
step 1:  [r1, r2, r3, r4]  (all running)
step 2:  [r1, r2, r3, r4]
step 3:  r2 finishes → [r1, r5, r3, r4]
step 4:  [r1, r5, r3, r4]
step 5:  r3 + r1 finish → [r6, r5, r7, r4]
```

Per-step compute is identical to static batching (same matmul over same number of sequences). The throughput gain comes from never wasting compute on finished sequences and never waiting for new requests to arrive.

## Where the gain comes from

- **Heterogeneous workloads**: long-tail requests don't block the batch.
- **Tail behavior**: a single 5000-token request doesn't pause progress on the other 50 short requests.
- **Late-arriving requests**: admitted into the next step instead of waiting for batch boundary.

For most production LLM workloads (chat, copilot, RAG), the gain is 3-5× over static batching at the same hardware.

<!-- tier:grad -->
# Continuous Batching (Grad)

Implementation details:

- **Padding-free attention**: each sequence has its own length. Custom attention kernels (FlashAttention's `varlen` variants) handle ragged batches without padding. Without this, the savings get eaten by padded compute.
- **Position embedding handling**: with continuous batching, each sequence is at a different position. Per-sequence position encodings are easy with absolute embeddings; harder with rotary embeddings (need careful kernel-level position tracking).
- **Scheduling policies**: when more requests are queued than slots free, which gets admitted first? FIFO is simple; priority queues for SLA-tiered traffic; preemption for high-priority interruptions. vLLM defaults to FIFO with optional preemption.
- **Memory pressure**: more concurrent sequences → more KV cache. PagedAttention is the answer; without it, continuous batching exhausts KV cache memory before reaching compute saturation.

Frameworks that implement it:
- **vLLM** (the reference)
- **TGI** (Hugging Face)
- **TensorRT-LLM** (NVIDIA)
- **SGLang**
- **DeepSpeed-FastGen**

Roll-your-own: doable, but the engineering complexity (custom attention kernels, scheduler, KV management) is non-trivial. Use a published framework unless you have specific constraints.

Combined with PagedAttention + speculative decoding + tensor parallelism, continuous batching is the foundation of every modern LLM serving stack. The aggregate effect on throughput vs naive serving is roughly an order of magnitude.
