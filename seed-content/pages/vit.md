---
title: Vision Transformer (ViT)
category: multimodal
---
<!-- tier:intro -->
# Vision Transformer (ViT)

Treat an image as a sequence of patches; run a standard transformer encoder over them. Drop convolutions entirely.

Introduced in Dosovitskiy et al. 2020. Surprised the field by matching CNNs at scale despite no built-in image inductive bias. Foundation of every modern vision-language model.

<!-- tier:undergrad -->
# ViT (Undergrad)

## Architecture

```
image (224×224×3)
  → patchify (16×16) → 196 patches × 768
  → linear embed → 196 tokens × d_model
  → add learned position embeddings
  → prepend [CLS] token → 197 tokens × d_model
  → transformer encoder (12 layers for ViT-Base)
  → take [CLS] token's output
  → MLP classifier → class logits
```

That's it. No convolutions. Transformer self-attention learns spatial relationships from data.

## Sizes

ViT-Tiny (5M), Small (22M), Base (86M), Large (307M), Huge (632M), Giant (1B+). Same recipe; just more parameters and more data.

For most applications: ViT-Base or Large pretrained with MAE on ImageNet-21K, then fine-tuned on the target task.

## What ViT taught us

- **Inductive bias matters at small scales.** ViT needs more data than CNNs to match performance. With JFT-300M (Google's 300M-image dataset), ViT-L beats ResNet. With only ImageNet (1M images), CNNs match.
- **Attention generalizes.** The same architecture used for language works for vision with patch tokenization. The bitter lesson (Sutton 2019) playing out — flexible architectures + scale beat task-specific architectures.
- **Pretraining matters.** ViT trained from scratch on ImageNet underperforms CNNs. ViT pretrained then fine-tuned wins. Most modern recipes use MAE (masked autoencoder) or DINO (self-supervised) pretraining.

<!-- tier:grad -->
# ViT (Grad)

## Practical variants

- **Swin Transformer**: hierarchical ViT with windowed attention. Linear-cost in image area; good for high-resolution + dense prediction.
- **DeiT**: ViT trained with extensive augmentation + distillation token. Matches ViT-Large on ImageNet-only data (no JFT needed).
- **MAE**: pretrain by masking 75% of patches and reconstructing. Self-supervised; the dominant pretraining method.
- **CLIP-style ViT**: pretrained jointly with text encoder via contrastive loss. The vision tower of most modern VLMs.
- **ConvNeXt**: a 'modern' CNN with ViT-style training recipes. Matches ViT performance; argues against the 'CNN is dead' narrative.

## Position embeddings

Three variants: learned 1D (original), learned 2D (separate row + col), sinusoidal 2D (deterministic; generalizes to new resolutions).

For fixed-size training: learned 1D is fine. For multi-resolution inference: sinusoidal helps.

Recent work uses **2D RoPE** (rotary position embeddings adapted for 2D) — better extrapolation to unseen resolutions, similar quality to learned at training scale. Used in some frontier VLMs.

## Inductive bias revisited

The original ViT paper's framing — 'attention is all you need for vision' — turns out to be slightly oversold. Hybrid architectures (CoAtNet, MaxViT) that combine convolutions in early layers with attention in late layers often perform best at moderate scales. The pure ViT wins primarily at very large scale where the inductive bias becomes a constraint.

For practitioners: ViT is still the right starting point for multimodal models (it's what CLIP / GPT-4V use). For pure vision tasks at moderate data scales, ConvNeXt or hybrids can outperform.
