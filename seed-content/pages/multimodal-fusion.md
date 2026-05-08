---
title: Multimodal Fusion
category: multimodal
---
<!-- tier:intro -->
# Multimodal Fusion

The architectural choice for combining modalities (image + text, audio + text, etc.). Three patterns:

1. **Late fusion**: separate encoders; combine only at the output (CLIP-style).
2. **Early fusion**: project both modalities into a shared token space; one transformer (LLaVA-style).
3. **Cross-attention fusion**: text stream + dedicated cross-attention to image features (Flamingo-style).

Each suits different tasks. Match the architecture to what you're building.

<!-- tier:undergrad -->
# Multimodal Fusion (Undergrad)

## Late fusion (CLIP)

Independent encoders, combined only at the embedding level via dot product:

```
image_emb = image_encoder(image)
text_emb = text_encoder(text)
similarity = image_emb · text_emb
```

**Strengths**:
- Embeddings can be precomputed and indexed → fast retrieval at scale.
- Each encoder can be replaced independently.
- Cheap inference (one forward pass per modality, then a multiply).

**Weaknesses**:
- No fine-grained alignment between modalities.
- Limited compositional reasoning ('how many cats' is hard).
- Can't generate one modality from the other.

**Best for**: retrieval, similarity, zero-shot classification.

## Early fusion (LLaVA-style)

Project image features into the LLM's token-embedding space; concatenate with text tokens; feed both into one transformer:

```
image_features = vision_encoder(image)
image_tokens = adapter(image_features)
all_tokens = [image_tokens, text_tokens]
output = LLM(all_tokens)
```

The LLM's self-attention handles cross-modal interaction.

**Strengths**:
- Compositional reasoning works.
- Reuses pretrained LLM capabilities.
- Generative — can produce text grounded in images.

**Weaknesses**:
- Image tokens consume context length.
- Expensive inference; reprocess everything per query.
- No retrieval support.

**Best for**: VQA, instruction-following, multimodal chat. The dominant pattern for modern VLMs (LLaVA, Qwen-VL, GPT-4V).

## Cross-attention fusion (Flamingo)

Text stays in its own stream; dedicated cross-attention layers attend to image features:

```
for each layer:
    x = self_attention(text_tokens)
    x = cross_attention(x, image_features)   # text attends to image
    x = FFN(x)
```

**Strengths**:
- Pretrained LLM can stay frozen.
- Image features computed once; accessed by all cross-attention layers.
- Natural fit for long context with many images.

**Weaknesses**:
- More parameters.
- More complex to implement.

**Best for**: long-context multimodal with multiple images interleaved with text.

<!-- tier:grad -->
# Multimodal Fusion (Grad)

## Hybrid pipelines

In production, the right answer is often **hybrid**:

- **Stage 1: late fusion (CLIP) for retrieval at scale.** Index millions of images; retrieve top-k for a query in milliseconds.
- **Stage 2: early fusion (VLM) for reasoning over the retrieved set.** Top-10 images go through the VLM for detailed analysis.

This pattern dominates real multimodal apps. Pure architectures don't scale to both retrieval + reasoning.

## When cross-attention re-emerges

Open-source VLMs largely converged on early fusion (token concat, LLaVA-style) for simplicity. But cross-attention re-emerges in:

- **Long-context multimodal** (Gemini-1.5-Pro, Sora's video understanding): processing hundreds of images would consume too much context with token concat. Cross-attention's separation of streams scales better.
- **Real-time / streaming**: image features computed once; can be reused as new text comes in. Token concat would require reprocessing.
- **Frozen-LLM scenarios**: when fine-tuning the LLM is expensive or risky, cross-attention adds capability without modifying the LLM.

Frontier-scale VLMs typically use a mix — token concat for the standard input, cross-attention for additional 'long' modalities (video frames, multiple images).

## The token-count problem

Image tokens consume LLM context. Standard:
- 224×224 image at 16×16 patches → 196 tokens.
- 1024×1024 image at multi-tile encoding → can be 1000-2500 tokens.

For an LLM with 128K context, this is fine for one or a few images. For document analysis with dozens of pages, this is the binding constraint. Solutions:

- **Q-Former / resampler**: compress many image features into a fixed (e.g., 32 or 64) number of tokens. BLIP-2, Qwen-VL.
- **Hierarchical attention**: only top-level features go to the LLM; details accessed via cross-attention.
- **Cross-attention exclusively**: features stay in their own stream; never enter the token sequence.

For most current applications: token concat with 256-1024 image tokens is fine. Q-Former when you need many images per prompt.
