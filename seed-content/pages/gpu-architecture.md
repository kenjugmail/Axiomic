---
title: GPU Architecture for ML
category: systems
---
<!-- tier:intro -->
# GPU Architecture

A GPU isn't a faster CPU; it's a different shape of compute. CPUs run a few threads with massive caches and branch prediction. GPUs run thousands of threads in lockstep over flat arithmetic, with most of the silicon devoted to compute and memory bandwidth.

For ML, three things matter:

1. **Tensor cores** — special matrix-multiply units that do small block matmuls in a single cycle. Modern GPUs (A100, H100) have ~1 PFLOPS of tensor-core throughput at bf16, vs ~70 TFLOPS at fp32.
2. **Memory hierarchy** — registers (per-thread, fastest, tiny) → shared memory (per-streaming-multiprocessor, fast, ~100 KB) → HBM (global, slowest of the three, 40-192 GB).
3. **Bandwidth** — moving bytes from HBM to the SMs caps how fast memory-bound kernels can run. H100 HBM bandwidth is ~3.35 TB/s.

Why this matters: matmul is compute-bound (uses tensor cores at full throughput). Softmax, layernorm, attention scores are memory-bound (limited by bandwidth, not compute). Different optimization tactics per regime.

<!-- tier:undergrad -->
# GPU Architecture (Undergrad)

## Streaming multiprocessors

A modern GPU has 100-200 streaming multiprocessors (SMs). Each SM contains:
- Tensor cores (the matmul engines)
- CUDA cores (general-purpose elementwise + integer ops)
- A register file (~256 KB)
- Shared memory / L1 cache (~228 KB on H100)
- Warp schedulers (groups of 32 threads execute in lockstep)

A kernel launches `<<<num_blocks, threads_per_block>>>`. The blocks are distributed across SMs; each block runs on exactly one SM. Within a block, threads cooperate via shared memory.

## The roofline model

For any kernel, two things bound throughput:
- **Peak FLOPS** of the hardware (e.g., 989 TFLOPS bf16 on H100)
- **Memory bandwidth × arithmetic intensity** (FLOPS per byte loaded from HBM)

```
max_throughput = min(peak_FLOPS, bandwidth × arithmetic_intensity)
```

Plot peak_FLOPS as a horizontal ceiling and bandwidth × arithmetic_intensity as a diagonal line. The intersection (the "ridge point") separates memory-bound kernels (left of ridge, throughput limited by bandwidth) from compute-bound kernels (right of ridge, throughput limited by FLOPS).

A 4K × 4K matmul in bf16 has arithmetic intensity in the high hundreds of FLOPS/byte → solidly compute-bound, hits ~70-80% of peak FLOPS. A softmax over 4K elements has arithmetic intensity ~1 → memory-bound, hits ~50% of bandwidth.

## Why it matters

Compute-bound: optimize the matmul itself (tensor cores, batch shape, precision). Memory-bound: optimize the access pattern (fusion, tiling, FlashAttention).

Most performance bugs in ML systems come from running compute-bound kernels in a memory-bound regime — e.g., tiny matmuls that don't fill the tensor cores, or matmuls with non-multiple-of-16 dimensions that fall off the fast path.

<!-- tier:grad -->
# GPU Architecture (Grad)

Beyond the basics:

- **Tensor core shape constraints**: H100 fp8 matmuls require dimensions multiple of 32; bf16 multiple of 16. Models with `d_model = 1000` quietly leave performance on the table.
- **Persistent kernels** (e.g., FlashAttention v2/v3): keep one block resident on each SM throughout the kernel rather than launching many small blocks. Reduces launch overhead, improves cache reuse.
- **CUDA graphs**: capture the entire forward pass as a graph, replay with one launch instead of thousands. Drops kernel launch overhead from ~5 μs each to negligible.
- **HBM3 vs HBM3e**: H200 + B200 have HBM3e at ~4.8 TB/s, ~1.4× H100. The gap between compute and memory is widening, making memory-bound ops a bigger share of runtime.
- **NVLink generations**: NVLink 4 on H100 = 900 GB/s GPU-to-GPU (intra-host). Inter-host: InfiniBand HDR at 200 Gb/s = 25 GB/s. The 36× ratio is what motivates 3D parallelism (TP intra-host, PP inter-host).

The roofline + memory-hierarchy + interconnect-tier mental model is sufficient to predict performance on any modern training or serving workload to within ~30%. Profilers (Nsight Compute, `torch.profiler`) confirm or refute the prediction. Build the muscle to read a profile and most performance debugging becomes routine.
