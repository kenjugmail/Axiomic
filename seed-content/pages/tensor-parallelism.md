---
title: Tensor Parallelism
category: systems
---
<!-- tier:intro -->
# Tensor Parallelism

Tensor parallelism (TP) splits each layer's weight matrices across GPUs. Each GPU does a slice of every matmul; collective ops glue the partial results back together. Unlike data parallelism (replicate the model, split the batch), tensor parallelism shards the model itself.

Originated in Megatron-LM (Shoeybi et al. 2019). TP is the standard intra-host parallelism for serving large models — the per-step communication needs high bandwidth, which means NVLink within a single host.

<!-- tier:undergrad -->
# Tensor Parallelism (Undergrad)

## FFN, sharded

The MLP block: `out = (gelu(x @ W1) @ W2)`.

Split `W1` along the output dimension into `N` column shards, distribute one shard per GPU. Each GPU computes its column slice of `gelu(x @ W1)`. Then split `W2` along the input dimension into corresponding row shards. Each GPU computes a partial sum of the output. An **all-reduce** across the `N` GPUs sums those partials.

Per GPU: 1/N the matmul work, 1/N the weight memory. One all-reduce per FFN block.

## Attention, sharded

For multi-head attention, the natural split is **across heads**. With 32 heads and TP=4, each GPU owns 8 heads. The Q/K/V projections shard cleanly along the head dimension. The output projection's input dimension matches.

One all-reduce per attention block (after the output projection).

## Cost analysis

Per transformer block: 2 all-reduces (one for attention, one for FFN). Per all-reduce on TP=8 with 1 GB tensors on NVLink: ~2-3 ms. For a 32-layer model: ~150-200 ms per forward pass in collective overhead alone. Significant but manageable when matmuls are large enough that compute dominates.

## When TP works

- High-bandwidth interconnect (NVLink, ~900 GB/s).
- TP degree fits within a single host (typically 8 GPUs).
- Layers are large enough that matmul compute > all-reduce overhead. Tiny layers see TP slowdown.

## When TP breaks

- Across hosts (inter-host bandwidth too low; per-layer all-reduce kills throughput).
- TP > 8 (most cluster topologies have only 8 GPUs per host on NVLink; extending across hosts reverts to slow inter-host comm).
- Small layers / batch sizes where overhead exceeds saved compute.

<!-- tier:grad -->
# Tensor Parallelism (Grad)

Variants and refinements:

- **Sequence parallelism** (Megatron-LM v3): split the residual stream along the sequence dimension on top of TP. Cuts activation memory further; adds extra all-gather + reduce-scatter ops but reduces activation memory by another ~N×.
- **Async TP**: overlap the all-reduce with the next layer's compute. Trickier to get right; substantial speedup when comm cost is non-negligible.
- **Selective activation recomputation**: TP saves weight memory; activation memory still grows linearly with sequence length. Combine with gradient checkpointing on selected layers (heavy in activations) to bound total memory.

For inference, TP gives substantial **latency** wins: split the matmul 8 ways → first token comes back ~8× faster (ignoring all-reduce overhead). vLLM, TensorRT-LLM both default to TP within a host. Throughput is roughly preserved (matmul work / N + small overhead) but TTFT (time-to-first-token) improves dramatically — the dominant constraint for chat-style serving.

Combined with PP across hosts (3D parallelism), TP within hosts is the standard recipe at frontier scale (530B+ parameter training, sub-100ms TTFT serving on big models).
