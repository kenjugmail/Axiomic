---
title: CLIP
category: multimodal
---
<!-- tier:intro -->
# CLIP (Contrastive Language-Image Pretraining)

Train a vision encoder and a text encoder so that matched (image, caption) pairs are close in a shared embedding space. Trained on 400M (image, caption) pairs scraped from the web (Radford et al. 2021).

The result: an image-text embedding model that enables zero-shot classification, image-text retrieval, and grounding for modern VLMs.

<!-- tier:undergrad -->
# CLIP (Undergrad)

## Architecture

```
image → ViT or ResNet → image_emb (L2-normalized, d=512 or 768)
text → transformer → text_emb (L2-normalized, same d)
```

Both embeddings are projected to the same dimension and L2-normalized. Cosine similarity = dot product.

Training: contrastive loss across batches.

```
For batch of N (image, text) pairs:
    Compute N×N similarity matrix S_ij = e_i · e_j / τ
    L = (CrossEntropy_rows + CrossEntropy_cols) / 2
    where the 'class' is i==j (diagonal positives)
```

Each image is positive for its caption, negative for everyone else's. Symmetric: text-to-image and image-to-text losses combined.

## Zero-shot classification

```python
image_emb = clip_image_encoder(image)
text_embs = [clip_text_encoder(f"a photo of a {label}") for label in labels]
similarity = [image_emb · t for t in text_embs]
prediction = labels[argmax(similarity)]
```

The text prompts function as the classifier. Replace them to classify into new categories.

CLIP ViT-L/14 hits 76% on ImageNet zero-shot — beats supervised ResNet-50. With zero ImageNet training data.

## Prompt engineering

'a photo of a {label}' beats just '{label}' by 2-3 ImageNet points because CLIP was trained on natural-language captions, and 'a photo of' matches that distribution. Ensembling multiple prompts ('a photo', 'a sketch', 'a painting') further helps.

For domain-specific tasks: tune prompts to match the target domain. Medical imaging: 'a chest X-ray showing {label}'. Satellite: 'a satellite image of {label}'.

<!-- tier:grad -->
# CLIP (Grad)

## OpenCLIP and the open-source ecosystem

OpenAI's original CLIP model is open-weights but the training data (WIT, 400M pairs) is closed. The community recreated it: **OpenCLIP** (LAION), trained on LAION-400M and LAION-5B, achieving comparable or better quality.

Variants:
- ViT-B/32, ViT-B/16, ViT-L/14 (matching OpenAI sizes).
- ViT-H/14 (larger; LAION-2B).
- ViT-bigG/14 (largest; ~2B params).
- DataComp variants tuned on curated data subsets.

Most modern open-source VLMs (LLaVA, Qwen-VL) use OpenCLIP's ViT-L/14 as their vision tower. OpenAI's CLIP is still common but less frequently updated.

## Failure modes

- **Fine-grained distinctions**: dog breeds, bird species — CLIP often confuses similar classes. Domain-specific fine-tuning helps.
- **Counting**: 'three dogs' is hard. CLIP captures presence but not quantity well.
- **Spatial relations**: 'cat on top of the box' — CLIP knows there's a cat and a box but is shaky on relative position.
- **OCR-heavy images**: CLIP doesn't read text well. Documents, charts, screenshots are weak. Specialized vision encoders (TrOCR, LayoutLM, modern document models) outperform.

These are addressed by either bigger CLIP models, fine-tuning on relevant data, or downstream VLMs that can reason over CLIP's features.

## Beyond CLIP

- **SigLIP** (Zhai 2023): replaces InfoNCE with a sigmoid loss. Better at small batches; comparable at large.
- **EVA-CLIP, BiomedCLIP, FashionCLIP**: domain-specific or improved-recipe variants.
- **Long-context CLIP**: extends the text encoder context length (CLIP's default is 77 tokens — quite short).

For most current applications: OpenCLIP ViT-L/14 or ViT-bigG/14 are the sensible defaults. SigLIP is a strong alternative when batch size is constrained.
