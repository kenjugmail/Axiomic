---
title: Tensor Cores
category: systems
---
<!-- tier:intro -->
# Tensor Cores

Tensor cores are matrix-multiply units inside modern NVIDIA GPUs (Volta and newer). Each tensor core does a small block matmul (e.g., 4×4 × 4×4) in a single cycle. Stacked across thousands of tensor cores per GPU, they deliver order-of-magnitude higher throughput than CUDA cores for matmul.

H100 throughput at peak:
- bf16 / fp16 matmul: ~989 TFLOPS
- fp8 matmul: ~1979 TFLOPS
- fp32 (CUDA cores, no tensor cores): ~67 TFLOPS

The 15× gap between bf16 and fp32 is why mixed precision is mandatory for any modern training or inference stack.

<!-- tier:undergrad -->
# Tensor Cores (Undergrad)

## How they work

A tensor core computes `D = A · B + C` where A, B, C, D are small matrices (typically 16×16 or 16×8 elements). The hardware fuses the multiply and accumulate, so a matmul over a 1024×1024 region is decomposed into thousands of these small fused-multiply-add ops.

The crucial detail: the FMA inputs are reduced precision (bf16 / fp16 / fp8) but the accumulator C is fp32. This preserves precision in the running sum, even though each multiplication is lossy.

## Shape constraints

Tensor cores demand specific dimension multiples:
- bf16 / fp16: M, N, K must be multiples of 8 (Hopper) or 16 (recommended for full throughput).
- fp8: M, N, K multiples of 16 or 32.
- int8: similar.

A model with `d_model = 1000` does NOT hit the fast path on bf16 tensor cores. It silently runs on slower fallback kernels. This is a common performance bug — the model trains, just at 30% the expected throughput.

Always pick `d_model` that is a multiple of 64 or 128. Same for `d_ffn` and `n_heads × head_dim`.

## Practical use

- PyTorch `torch.cuda.amp.autocast(dtype=torch.bfloat16)` automatically routes matmuls to tensor cores.
- cuDNN and cuBLAS pick tensor-core kernels when shapes match.
- `torch.set_float32_matmul_precision('high')` enables TF32 (a tensor-core mode using fp32 inputs but reduced-precision accumulator). Free 5-10× speedup on fp32 workflows you can't easily convert.

<!-- tier:grad -->
# Tensor Cores (Grad)

Hopper's fp8 tensor cores introduce two formats:
- **E4M3** (4 exponent bits, 3 mantissa): higher precision, narrower range. Used for forward activations.
- **E5M2** (5 exponent, 2 mantissa): wider range, lower precision. Used for backward gradients.

Per-tensor scaling is critical for fp8: each tensor gets a dynamic scale factor (computed on the fly) that exploits the limited fp8 range. NVIDIA Transformer Engine handles this transparently.

Sparsity: Hopper tensor cores support 2:4 structured sparsity — every 4 consecutive elements have at most 2 non-zero. Pruning a model to 2:4 sparsity gives ~2× throughput on supported kernels. Used in some LLM serving paths.

The performance hierarchy you should target:
1. fp8 tensor cores (Hopper+ inference): 1979 TFLOPS
2. bf16 tensor cores (training default): 989 TFLOPS
3. TF32 (legacy fp32 workflows): 495 TFLOPS
4. fp32 CUDA cores: 67 TFLOPS

Anything in the bottom tier should be migrated up, except for numerically sensitive ops (loss computation, master weight updates, softmax accumulation in some attention variants).
