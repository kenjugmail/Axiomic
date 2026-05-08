---
title: Vision-Language Models (VLMs)
category: multimodal
---
<!-- tier:intro -->
# Vision-Language Models (VLMs)

Models that take images + text as input and produce text as output. The modern recipe: vision encoder (CLIP-style ViT) + language model + a small adapter that bridges them.

Examples: GPT-4V, Gemini, Claude 3 Vision, LLaVA, Qwen-VL, Idefics, InternVL.

<!-- tier:undergrad -->
# VLMs (Undergrad)

## The standard recipe

```
image → vision_encoder (frozen) → image_features
image_features → adapter (linear or Q-Former) → image_tokens
text → tokenize → text_tokens

[image_tokens, text_tokens] → LLM → response_tokens
```

Three components:
1. **Vision encoder**: typically frozen CLIP ViT-L/14. Outputs ~256 patch features.
2. **Adapter**: a small projection layer that maps image features to LLM token-embedding space.
3. **LLM**: a strong pretrained language model (Llama, Qwen, etc.). The adapter feeds image tokens into the same input slot as text tokens.

The LLM handles cross-modal interaction via standard self-attention. This is **early fusion** — image and text in the same token stream.

## Training stages

**Stage 1: Adapter pretraining.** Freeze vision encoder + LLM. Train only the adapter on (image, caption) pairs. Objective: predict the caption given the image. Cheap; quickly aligns image features with the LLM's token space.

**Stage 2: Visual instruction tuning.** Unfreeze (some of) the LLM. Train on (image, instruction, response) triples. The instructions are diverse — describe, count, identify, reason. This is what turns a 'caption generator' into a 'helpful visual assistant'.

**Stage 3 (optional): RLHF or DPO on multimodal preferences.** Refine helpfulness, refuse harmful queries, calibrate refusals. Cost-justified for production deployments.

## Open-source state of the art (2024-2025)

- **LLaVA-1.5 / 1.6**: the simplest viable VLM. CLIP ViT-L/14 + linear projection + Llama. Easy to train; widely deployed.
- **Qwen-VL / Qwen2-VL**: stronger; supports multi-image and video.
- **InternVL / InternVL2**: frontier-quality among open-source.
- **Idefics2 / Idefics3**: HuggingFace's, with interleaved image-text support.
- **Pixtral**: Mistral's; includes some training-data improvements.

For most projects: LLaVA-1.6 is the right starting point. Qwen2-VL or InternVL2 for more demanding tasks.

<!-- tier:grad -->
# VLMs (Grad)

## Architectural trade-offs

**Adapter design**:
- **Linear projection** (LLaVA): one-layer linear map. Simplest; works.
- **MLP adapter** (LLaVA-1.5): two-layer MLP with GELU. Marginal improvement.
- **Q-Former** (BLIP-2, Qwen-VL): a small transformer that compresses many image patches to a fixed number of query tokens. More capable; more parameters; harder to train.

For most cases, MLP adapter is the sweet spot. Q-Former pays off at scale but adds complexity.

**Token count**:
- Standard: 256 image tokens (one per patch in 16×16 patchified 224×224 image).
- Higher resolution: 576 (24×24 patches) or more. Improves OCR + fine detail; costs context.
- Multi-resolution (LLaVA-Next, Qwen2-VL): tile the image, encode each tile, concatenate. Better for high-res images at the cost of context length.

## Failure modes

- **Hallucination**: VLMs describe objects not in the image. POPE benchmark measures this. Mitigation: better training data, RLHF, smaller models (sometimes).
- **Spatial reasoning**: 'left of' / 'above' confuses many VLMs. Improved by training-data diversity.
- **Counting**: '3 cats vs 4 cats'. Still weak in most VLMs.
- **OCR**: depends on vision encoder. CLIP-L/14 is mediocre at OCR; specialized encoders (Donut, TrOCR) win on document tasks.
- **Long context**: VLMs have limited image-token context (256-1024). For multi-image / video, this is the binding constraint.

## Frontier-scale VLMs

GPT-4V, Gemini 2, Claude 3.5 Vision are closed but architecturally similar to open-source. The closed models pull ahead via:
- Larger training data (proprietary curated sets).
- Higher-resolution image processing (multi-resolution + tiling).
- More aggressive RLHF / instruction tuning.
- Larger LLMs (~175B+ params).

The architectural pattern is the same; the gap is execution + scale, not algorithmic.
