---
title: Mixed Precision Training
category: systems
---
<!-- tier:intro -->
# Mixed Precision Training

Modern training uses **mixed precision** by default: most computation in 16-bit (bf16 or fp16) for speed, with critical state (master weights, optimizer state) kept in 32-bit for numerical stability.

Why bother:
- **Tensor cores demand it.** H100 hits ~989 TFLOPS at bf16 vs ~67 TFLOPS at fp32. Skipping reduced precision costs 15× throughput.
- **Memory.** bf16 halves weight + gradient storage. Bigger batches fit; bigger models fit.
- **Bandwidth.** Half the bytes per HBM round-trip on weight loads.

The trick: do matmul fast in low precision; keep the math that matters precise.

<!-- tier:undergrad -->
# Mixed Precision (Undergrad)

## The standard recipe

```python
model = MyModel().cuda()
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
scaler = torch.cuda.amp.GradScaler()  # only needed for fp16

for batch in dataloader:
    with torch.cuda.amp.autocast(dtype=torch.bfloat16):
        output = model(batch)
        loss = compute_loss(output, target)
    
    # bf16: skip scaler. fp16: use scaler to avoid gradient underflow.
    loss.backward()
    optimizer.step()
    optimizer.zero_grad()
```

Memory budget per parameter (Adam):
- bf16 weights: 2 bytes
- fp32 master weights: 4 bytes
- bf16 gradients: 2 bytes
- fp32 momentum + variance: 8 bytes
- **Total: 16 bytes/parameter**

A 7B model: 112 GB. Fits on one H100 with FSDP across a few GPUs, or with gradient checkpointing.

## bf16 vs fp16

bf16 keeps fp32's exponent (8 bits, full range) at the cost of mantissa precision (7 bits vs fp16's 10). The practical consequence:

- bf16 has the same **dynamic range** as fp32. Gradients don't underflow. **No loss scaling needed.**
- fp16 has narrow range (~6e-5 to ~6e4). Gradients near zero flush to zero unless you scale them up via [[loss-scaling]].

bf16 is the modern default on Ampere+ hardware. fp16 is a legacy choice for older hardware.

## fp8 (Hopper+)

fp8 doubles throughput again (~1979 TFLOPS on H100). Two formats: E4M3 forward, E5M2 backward. Per-tensor scaling required (each tensor gets its own scale factor). NVIDIA Transformer Engine handles this transparently. Frontier-scale runs use it; smaller jobs often skip it because the engineering complexity isn't worth it below billions of parameters.

<!-- tier:grad -->
# Mixed Precision (Grad)

The numerics in detail:

- **Master weights in fp32**: updates `w += lr * grad` are tiny (often 1e-7 to 1e-9). bf16's 7-bit mantissa can't represent these updates against weights of magnitude ~1. Keep an fp32 copy; apply updates in fp32; cast to bf16 for the next forward.
- **Optimizer state in fp32**: Adam's momentum and variance accumulate over thousands of updates. fp16 momentum drifts numerically. Standard recipe keeps these in fp32 (8 bytes per parameter for Adam).
- **Loss in fp32**: cast logits to fp32 before softmax + cross-entropy. Stops `exp(very_large)` overflow in the loss computation specifically. Often the loss is the only fp32-fronted op in a bf16 model.
- **Some ops still want fp32**: LayerNorm's variance computation, sometimes attention's softmax, sometimes the embedding lookup. Frameworks handle this automatically by casting inside the op.

8-bit Adam (Dettmers et al.) and AdaFactor reduce optimizer state memory but add complexity. Lion uses sign-only momentum, no variance — cuts optimizer state to 2 bytes/param. Most teams stick with vanilla mixed-precision Adam unless memory pressure forces a change.

The most common bug: forgetting to wrap the loss computation in `with torch.cuda.amp.autocast()`. The matmuls run fast but the loss is computed in whatever precision you sent it. Always wrap the full forward pass.
