---
title: Image Tensors
category: multimodal
---
<!-- tier:intro -->
# Image Tensors

An image is a tensor. Standard PyTorch shape: `(B, C, H, W)` — batch × channels × height × width. TensorFlow: `(B, H, W, C)` — channel last.

For a 224×224 RGB image: `(3, 224, 224)` for one item or `(B, 3, 224, 224)` for a batch. Each entry is a number in `[0, 255]` (raw) or `[0, 1]` / `[-1, 1]` (normalized).

<!-- tier:undergrad -->
# Image Tensors (Undergrad)

## Channels

- **Grayscale**: 1 channel.
- **RGB**: 3 channels (red, green, blue).
- **RGBA**: 4 channels (with alpha for transparency).
- **Multispectral / hyperspectral**: 10+ channels (e.g., satellite imagery).
- **Medical (CT, MRI)**: depends on modality; sometimes 3D volumes `(C, D, H, W)`.

ViTs and CNNs both expect a fixed number of input channels. Adapt with a 1×1 conv or learnable projection if your data has unusual channels.

## Resolution

Standard: 224×224 (ImageNet). Larger: 384×384, 512×512, 1024×1024 for higher-detail tasks. Smaller: 32×32 (CIFAR), 28×28 (MNIST).

Higher resolution → more compute. ViT compute scales with `(H·W / patch_size²)²` due to attention's quadratic cost. CNNs scale linearly with `H·W`.

## Normalization

Subtract per-channel mean, divide by per-channel std. ImageNet stats:

```
mean = [0.485, 0.456, 0.406]
std  = [0.229, 0.224, 0.225]
```

Roughly centers the data around 0; helps optimization. Models pretrained on ImageNet expect this normalization at inference time.

For other datasets: compute your own per-channel stats. CLIP uses a slightly different normalization than ImageNet; HuggingFace's transformers library handles this per-model.

## Data loading

Standard PyTorch pipeline:

```python
transforms.Compose([
    transforms.Resize(256),
    transforms.CenterCrop(224),
    transforms.ToTensor(),                         # uint8 → float32 / 255
    transforms.Normalize(mean, std),
])
```

For training: add `RandomCrop`, `RandomHorizontalFlip`, `ColorJitter` for data augmentation. Tools like `albumentations` and `torchvision.v2` are the modern recommendations.

<!-- tier:grad -->
# Image Tensors (Grad)

## Format gotchas

- **NCHW vs NHWC**: PyTorch native is NCHW. Some operations (especially fused ops on TPUs) prefer NHWC. `torch.compile` handles conversion when beneficial.
- **uint8 vs float32**: storing images as uint8 saves 4× memory but requires conversion + normalization at every batch. For big datasets, prefer uint8 storage; convert in the dataloader.
- **JPEG vs PNG**: JPEG decode is faster (libjpeg-turbo) but lossy; PNG is exact. NVIDIA's DALI accelerates JPEG decoding on GPU.

## Data augmentation

Augmentations enlarge the effective dataset. Standard for vision:

- **Spatial**: random crop, flip, rotation, scale.
- **Color**: brightness, contrast, saturation, hue.
- **Mixup / CutMix**: linearly combine two images + labels.
- **AutoAugment / RandAugment**: learned or random augmentation policies.
- **AugMix**: mix multiple augmentations for robustness.

For self-supervised learning (SimCLR, MoCo), strong augmentations are critical. Two augmented views of the same image become positive pairs; the augmentations define what the model considers 'the same'.

## Pixel statistics across domains

Different image domains have different distributions. ImageNet is natural images (variety + photographic conditions). Medical imaging is much more structured. Satellite is multispectral. Each requires its own normalization stats. Using ImageNet stats on medical scans degrades performance noticeably; always recompute on your data.
