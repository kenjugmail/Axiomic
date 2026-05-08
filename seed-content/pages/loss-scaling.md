---
title: Loss Scaling
category: systems
---
<!-- tier:intro -->
# Loss Scaling

Loss scaling is a numerical trick that makes fp16 training stable. Multiply the loss by a large constant (typically 65536) before backward. Gradients become 65536× larger, lifting tiny values out of fp16's underflow zone. After backward, divide gradients by the scale before the optimizer step.

bf16 doesn't need this — its exponent matches fp32, so gradients don't underflow.

<!-- tier:undergrad -->
# Loss Scaling (Undergrad)

## Why fp16 needs it

fp16's smallest representable positive number is ~6e-5. Gradients smaller than this flush to zero — the network can't learn. In a deep network, small gradients are common (especially in early layers); naive fp16 silently kills the training run.

## The recipe

```python
scaler = torch.cuda.amp.GradScaler()

with torch.cuda.amp.autocast(dtype=torch.float16):
    loss = compute_loss(...)

scaler.scale(loss).backward()       # gradients computed at scale * loss
scaler.unscale_(optimizer)           # divide gradients by scale, in fp32
torch.nn.utils.clip_grad_norm_(...)  # safe to clip after unscaling
scaler.step(optimizer)               # apply update if no inf/nan
scaler.update()                       # adjust scale dynamically
```

## Dynamic scaling

PyTorch's `GradScaler` adapts the scale based on observed overflow:
- Start at scale = 65536.
- If any gradient is inf/nan, skip the optimizer step and halve the scale.
- After 2000 steps with no overflow, double the scale.

This converges to a scale that's as large as possible without overflowing — maximizing the dynamic range exploited.

## bf16: just don't

bf16 has the same exponent as fp32, so the underflow problem doesn't exist. PyTorch's autocast(bf16) skips loss scaling entirely. This is one of the main reasons modern recipes prefer bf16 — one less moving part.

<!-- tier:grad -->
# Loss Scaling (Grad)

Edge cases:

- **Per-parameter scaling** (sometimes called "block-wise scaling"): fp8 training extends the same idea to per-tensor or per-block scale factors, exploiting the limited 8-bit range tensor-by-tensor. Implemented in NVIDIA Transformer Engine.
- **Initial scale tuning**: starting too high → many overflows in the first few steps until the scaler halves down. Starting too low → tiny gradients underflow before the scaler doubles up. Default 65536 works for most networks.
- **Gradient clipping interaction**: clip *after* unscaling, in the unscaled fp32 gradient space. Clipping the scaled gradient gives wrong threshold semantics.

The historical context: loss scaling was introduced (Micikevicius et al. 2018) as the workaround that made fp16 mixed-precision viable. bf16 (Google's BFloat16, then NVIDIA's Ampere support) made the workaround unnecessary. Most modern recipes use bf16 + skip loss scaling, but the technique is still relevant for fp8 (where per-tensor scaling is mandatory) and for older hardware that lacks bf16.
