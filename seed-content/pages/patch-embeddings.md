---
title: Patch Embeddings
category: multimodal
---
<!-- tier:intro -->
# Patch Embeddings

The image-to-token bridge. ViT splits an image into non-overlapping patches (typically 16×16) and projects each patch to a vector. That vector becomes a 'token' the transformer processes.

For a 224×224 RGB image: 14×14 = 196 patches. Each patch is 16×16×3 = 768 numbers. A linear projection maps these 768 numbers to `d_model` (typically 768 for ViT-Base).

<!-- tier:undergrad -->
# Patch Embeddings (Undergrad)

## The implementation

```python
class PatchEmbed(nn.Module):
    def __init__(self, img_size=224, patch_size=16, in_channels=3, d_model=768):
        super().__init__()
        self.proj = nn.Conv2d(in_channels, d_model, 
                              kernel_size=patch_size, stride=patch_size)
    
    def forward(self, x):
        # x: (B, 3, 224, 224)
        x = self.proj(x)              # (B, d_model, 14, 14)
        x = x.flatten(2).transpose(1, 2)  # (B, 196, d_model)
        return x
```

A `Conv2d` with kernel size = stride = patch size is exactly a linear projection on each patch. The conv layer is convenient for batched implementation.

## Why patches, why 16×16

- **Smaller patches** (8×8): finer detail; more tokens; quadratic attention cost grows.
- **Larger patches** (32×32): coarser; fewer tokens; cheaper but loses fine features.

16×16 for 224×224 images is the sweet spot. For higher-resolution images (512×512+), 32×32 patches keep the sequence length manageable.

The patch size is a hyperparameter. ViT-B/16 uses 16×16; ViT-B/32 uses 32×32 (faster, slightly worse).

## Position embeddings

After patch embedding, add learned position embeddings (one per patch position). Without them, the transformer is permutation-invariant — it doesn't know top-left from bottom-right.

Position embeddings can be:
- **Learned 1D** (default): one vector per patch index 0..195.
- **Learned 2D**: separate row + column embeddings.
- **Sinusoidal 2D**: deterministic; generalizes to new resolutions.
- **2D RoPE**: rotary position embeddings adapted for 2D.

For fixed-size training, learned 1D works fine. For varying resolutions or zero-shot to new sizes, sinusoidal/RoPE-based embeddings help.

<!-- tier:grad -->
# Patch Embeddings (Grad)

## Connection to convolutional stem

A patch embedding is, mathematically, a single conv layer with kernel = stride = patch_size and no overlap. It's the simplest possible 'feature extractor' for the transformer to take.

Some hybrid architectures (CoAtNet, MaxViT) use a deeper convolutional stem before tokenization — typically several stride-2 convs that downsample to a smaller feature map, then patch-embed. This adds CNN inductive bias for the early layers; pure ViT gives it up.

## Patch overlap

Standard ViT uses non-overlapping patches. **Overlapping patches** (overlap = stride < patch_size) sometimes help — provide some translation invariance in the patch boundaries. Costs more compute (more patches per image). Not standard but used in some variants.

## Variable patch sizes

**Pyramid ViT / Swin**: hierarchical architectures with smaller patches at early stages, larger at later stages. Mimics CNN's increasing receptive field. Better for dense prediction (segmentation, detection) where multi-scale features matter.

**CrossViT, DAT**: multi-branch architectures with different patch sizes simultaneously, fused via attention. More complex; modest gains.

For most current applications: 16×16 patches + learned position embeddings + standard ViT is the right starting point. Variants help for specific tasks (dense prediction, multi-resolution) but aren't necessary for image classification or VLM-style usage.
