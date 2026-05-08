---
title: HBM Memory
category: systems
---
<!-- tier:intro -->
# HBM (High-Bandwidth Memory)

HBM is the GPU's main memory pool. Unlike a CPU that uses DDR memory on the motherboard, a GPU stacks HBM dies vertically directly on the same package as the compute. The result: extremely high bandwidth (multi-TB/s) but limited capacity (40-192 GB on current accelerators).

Bandwidth and capacity by generation:
- A100 80GB (HBM2e): 2 TB/s, 80 GB
- H100 80GB (HBM3): 3.35 TB/s, 80 GB
- H200 (HBM3e): 4.8 TB/s, 141 GB
- B200 (HBM3e): 8 TB/s, 192 GB

For ML training and serving, HBM bandwidth often matters more than raw compute. A typical transformer inference step is memory-bound (loading weights and KV cache from HBM dominates), not compute-bound.

<!-- tier:undergrad -->
# HBM (Undergrad)

## Why ML cares about HBM bandwidth

Inference workflow per generated token:
1. Load model weights from HBM to compute units (~70 GB for a 7B model in bf16+fp32 master).
2. Run forward pass.
3. Store updated KV cache.

Step 1 dominates on most decoder-only LLMs because the model weights are loaded *every* generated token. With H100's 3.35 TB/s, loading 14 GB of weights takes ~4 ms — that's the floor on per-token latency, regardless of how fast the matmul is.

This is why batched inference is so much more efficient than single-stream: the weight-load cost is shared across all batched requests. Doubling the batch size approximately doubles throughput up until compute becomes the bottleneck.

## Memory hierarchy summary

| Tier | Latency | Bandwidth | Capacity |
|---|---|---|---|
| Registers | 1 cycle | TB/s | KB per thread |
| Shared memory / L1 | ~30 cycles | TB/s | ~100 KB per SM |
| L2 cache | ~200 cycles | TB/s | ~50 MB per GPU |
| HBM | ~500 cycles | 3-8 TB/s | 80-192 GB |

Shared memory and L1 are the fastest; HBM is two orders of magnitude slower per access. Algorithms that maximize L1/shared-memory reuse (FlashAttention is the canonical example) get massive speedups.

<!-- tier:grad -->
# HBM (Grad)

Optimizing HBM bandwidth utilization:

- **Coalesced access**: threads in the same warp should read contiguous memory addresses. Strided access patterns cut effective bandwidth.
- **Vectorized loads** (`float4`, `int4`): load 16 bytes per instruction instead of 4. cuDNN and cuBLAS already use these.
- **Kernel fusion**: merge adjacent ops (e.g., GELU + dropout + residual) into a single kernel. Reduces HBM round-trips that no longer need to materialize intermediate tensors. Tools: `torch.compile`, Triton, custom CUDA kernels.
- **L2 cache management**: H100 has 50 MB of L2; persistent kernels can pin frequently-accessed data in L2 (e.g., a small expert in MoE) to avoid HBM trips.

The arithmetic intensity (FLOPS per byte loaded) determines whether a kernel is memory- or compute-bound. Increasing arithmetic intensity (e.g., by tiling a matmul to maximize register reuse) shifts a kernel toward compute-bound, where peak FLOPS becomes the limit.

Memory-bandwidth-aware design is the most underrated optimization axis in modern ML systems. A naive softmax over a long sequence runs at 30% of peak bandwidth; a well-tuned fused kernel hits 90%+. The same arithmetic, very different runtime.
