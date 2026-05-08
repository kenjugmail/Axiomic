---
title: Pipeline Parallelism
category: systems
---
<!-- tier:intro -->
# Pipeline Parallelism

Pipeline parallelism (PP) splits the layers of a model across GPUs. With 32 transformer blocks and 4 GPUs, GPU 0 holds blocks 1-8, GPU 1 holds 9-16, etc. Activations flow forward through the pipeline; gradients flow backward.

Compared to tensor parallelism, PP needs much less bandwidth: only point-to-point activation transfer between adjacent stages, no all-reduce. This makes PP the natural fit for **inter-host** parallelism on slow networks (InfiniBand, Ethernet) where TP would bottleneck.

The catch: **pipeline bubbles**. If GPU 0 finishes its forward pass and waits for GPU 1, GPU 0 is idle. Without micro-batching, naive PP wastes most of the compute.

<!-- tier:undergrad -->
# Pipeline Parallelism (Undergrad)

## The bubble problem

Naive PP with 4 stages and one batch:

```
Time → 
GPU 0: F . . . . . . B
GPU 1: . F . . . . B .
GPU 2: . . F . . B . .
GPU 3: . . . F B . . .
```

Forward (F) and backward (B) execute one stage at a time. The "." cells are idle GPU time. With P stages, only 1/P of the compute is actually doing work.

## Micro-batching to the rescue

Split each batch into K micro-batches. As soon as GPU 0 finishes micro-batch 1, it starts micro-batch 2 — and GPU 1 is now busy on micro-batch 1.

GPipe schedule (Huang et al. 2019): all forwards across all micro-batches, then all backwards.

```
GPU 0: F1 F2 F3 F4 . . . . B4 B3 B2 B1
GPU 1: . F1 F2 F3 F4 . . B4 B3 B2 B1 .
GPU 2: . . F1 F2 F3 F4 B4 B3 B2 B1 . .
GPU 3: . . . F1 F2 F3 F4 B4 B3 B2 B1 . . .
```

Bubble fraction: `(P - 1) / (M + P - 1)`. With P=4, M=16: ~16% bubble. M=4: ~43% bubble. Use enough micro-batches to amortize the bubble.

## 1F1B (one-forward-one-backward)

Modern PP schedulers (PipeDream, Megatron 1F1B) interleave forward and backward more aggressively:

```
GPU 0: F1 F2 B1 F3 B2 F4 B3 B4
```

Reduces peak activation memory (activations are released sooner) and steady-state bubble. The mainstream choice for PP-heavy training.

## When PP works

- Across hosts. Point-to-point activation transfer is much cheaper than all-reduce; tolerable on InfiniBand or even Ethernet.
- Models with many similar layers (transformers map cleanly).
- Combined with TP within stages: TP intra-host on NVLink, PP inter-host on the slower fabric.

## When PP breaks

- Tiny micro-batches → bubble dominates.
- Variable layer cost (e.g., MoE) → load imbalance across pipeline stages; some GPUs sit idle.
- Recurrent or stateful architectures that don't decompose into pipelined stages cleanly.

<!-- tier:grad -->
# Pipeline Parallelism (Grad)

Frontier engineering tricks:

- **Interleaved 1F1B** (Megatron-LM): each pipeline stage owns multiple non-contiguous chunks of layers (e.g., GPU 0 has layers 1-2, 9-10, 17-18, 25-26). Reduces bubble at cost of more activation transfers. Standard at 530B+ scale.
- **Activation checkpointing per stage**: each stage recomputes activations during backward to reduce memory. Costs extra compute but enables longer pipelines.
- **Asynchronous PP**: relax the strict synchronous schedule. Runs steps with stale gradients but can hide the bubble entirely. Convergence is harder to reason about; less common in production.

3D parallelism: TP intra-host + PP inter-host + DP/FSDP across pipeline replicas. The Megatron-DeepSpeed recipe used to train 530B+ models. Each parallelism degree maps to a layer of the interconnect hierarchy with matching bandwidth requirements.

For most teams below 70B parameters, PP isn't necessary — FSDP scales cleanly without it. PP becomes load-bearing past ~100B params or when inter-host bandwidth is genuinely slow (cloud cluster on commodity Ethernet, not InfiniBand).
