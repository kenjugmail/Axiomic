---
title: Quantization (INT8, INT4, FP8)
category: inference
---
<!-- tier:intro -->
# Quantization

LLMs in fp32 (32-bit floats) are big. A 70B-parameter model in fp32 takes 280 GB just for the weights. Most production deployments use lower precision — fp16 or bfloat16 cut that to 140 GB, and aggressive quantization to int8 or int4 cuts it further.

**Quantization** is the family of techniques for representing model weights and activations with fewer bits than fp32 while preserving model quality. The basic tradeoff: fewer bits = smaller memory + faster compute on supported hardware, but more numerical error → potentially worse model quality.

For LLM serving in 2024+, quantization is essentially mandatory. Most production deployments are int8 weights (sometimes int4) at minimal quality loss vs fp16. This page covers the main methods, their tradeoffs, and how to evaluate them.

<!-- tier:undergrad -->
# Quantization (Undergrad)

## Precisions

The common precisions in LLM serving:

- **fp32**: 32-bit float. Default in pytorch. ~4 bytes per parameter.
- **fp16**: 16-bit float (5 exponent bits, 10 mantissa bits). 2 bytes per parameter. Most LLMs train in fp16 or bfloat16.
- **bfloat16**: 16-bit float with 8 exponent bits, 7 mantissa bits. Same dynamic range as fp32 but less precision. Easier to train with than fp16 (no loss-scaling tricks). Used by Google TPUs and newer NVIDIA hardware.
- **fp8**: 8-bit float. Two variants — E4M3 (more precision) and E5M2 (more range). Used in H100 hardware. ~1 byte per parameter.
- **int8**: 8-bit integer. ~1 byte per parameter. The most common production quantization for LLM weights.
- **int4**: 4-bit integer. 0.5 bytes per parameter. Aggressive but works for many LLMs at modest quality cost.

A 7B-parameter model takes:
- fp32: 28 GB
- fp16/bf16: 14 GB
- int8: 7 GB
- int4: 3.5 GB

The memory savings is the easy story. The harder question: at what quality cost?

## Weight-only vs activation quantization

Two things to quantize: model weights and activations (intermediate tensors during forward pass).

**Weight-only quantization** (most common): quantize weights to int8 or int4 at load time. Activations stay in fp16. The matmul kernel reads int8 weights, dequantizes on the fly, multiplies in fp16. Modest savings on memory bandwidth; quality is usually preserved well.

**Full quantization**: both weights AND activations are quantized. The matmul itself runs in int8/int4 arithmetic. Larger speedup (less compute), but harder to do without quality loss because activations have wider dynamic range than weights.

For most production deployments, weight-only int8 is the safe bet. Full int8 quantization works on some models with calibration. int4 (especially with full quantization) can break things — careful evaluation required.

## GPTQ, AWQ, QuIP

The popular weight-only quantization methods:

**GPTQ** (Frantar et al. 2022). Post-training quantization that minimizes the layer-wise reconstruction error. Run on a small calibration set; updates the quantization scheme to minimize the per-layer output difference vs fp16. Common int4 method. Quality loss typically 1-3% on benchmarks.

**AWQ** (Activation-aware Weight Quantization, Lin et al. 2023). Quantizes weights but uses information about activation magnitudes to choose scaling factors. Empirically beats GPTQ on most evaluations. Default for int4 in many open-model recipes.

**QuIP / QuIP#** (Chee et al. 2024). Adds incoherence preprocessing to make weights more amenable to quantization. Achieves int2 quality competitive with prior int4 methods. Cutting edge; not yet widely deployed.

For practical use: AWQ at int4 is the current sweet spot for memory-constrained deployment. Almost all model conversions on Hugging Face use it.

<!-- tier:grad -->
# Quantization (Graduate)

## QLoRA and quantization-aware training

For fine-tuning, quantization changes the math. **QLoRA** (Dettmers et al. 2023) is the dominant approach: load the base model in int4 (NF4 — a normal-distribution-shaped int4 with theoretically optimal binning), train a LoRA adapter on top in fp16. The frozen base never updates; the LoRA adapter is fp16 quality. Memory drops 4× from fp16 → int4 base.

**Quantization-aware training (QAT)**: train with simulated quantization in the forward pass. Allows the model to learn weights that quantize well. More expensive than post-training quantization but produces better-quality int8/int4 models. Used for hardware deployments where quality matters.

## Calibration

Most weight-only methods need a calibration set — a few hundred examples used to compute layer-wise statistics. Quality of calibration data matters. Use:

- **In-domain examples** representing your deployment traffic
- **Diverse enough** to cover the activation range of all layers
- **Not the same as your eval set** (or you're overfitting to your benchmark)

A common failure mode: calibrate on web text, deploy on code. The calibration didn't represent the actual activation distribution; quantization breaks code generation.

## How to evaluate quantization

Don't trust headline accuracy on a benchmark. The quality cost of quantization is unevenly distributed:

- **Common tasks** (general Q&A, summarization): minimal degradation
- **Long-tail tasks**: more degradation. Rare tokens, less-frequent capabilities, edge cases all suffer first.
- **Long context**: quantized KV-cache amplifies errors. Generation quality at 32K+ context can degrade more than at 4K.
- **Specific languages/scripts**: low-resource languages often degrade more than English.

Evaluation protocol: run your full evaluation suite (not just MMLU) on the quantized model. Compare to fp16 baseline. Look at *worst-case* tasks, not just average. Spot-check generation quality manually.

For high-stakes deployments (safety-critical, customer-facing), int4 weights + fp16 activations + a thorough eval is the typical recipe. For latency-sensitive deployments, push to int4 with full quantization and accept the eval cost.

## Future: lower bits

Active research is on int2, ternary (-1/0/+1), and binary quantization. **BitNet** (Microsoft 2024) trains models from scratch with 1-bit weights and competitive quality. The training-from-scratch part matters: post-training quantization to 1 bit doesn't work, but quantization-aware training does.

If 1-bit LLMs become production-ready, the deployment economics change dramatically. A 70B model at 1-bit is 8.75 GB — fits on a single consumer GPU.

## Key References

- Dettmers et al., "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers" (2022)
- Lin et al., "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration" (2023)
- Dettmers et al., "QLoRA: Efficient Finetuning of Quantized LLMs" (2023)
- Chee et al., "QuIP: 2-Bit Quantization of Large Language Models with Guarantees" (2023)
- Wang et al., "BitNet: Scaling 1-bit Transformers for Large Language Models" (2023)
- Ma et al., "The Era of 1-bit LLMs: All Large Language Models are in 1.58 Bits" (2024)
