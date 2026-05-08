---
title: Contrastive Loss
category: multimodal
---
<!-- tier:intro -->
# Contrastive Loss

The objective that powers modern self-supervised learning: pull positive pairs together, push negatives apart in representation space.

Two views of the same item (image augmentations, paired image+caption, etc.) should have similar embeddings. Two views of different items should have different embeddings.

The dominant instance: [[infonce|InfoNCE]] — softmax classification across one positive and many negatives.

<!-- tier:undergrad -->
# Contrastive Loss (Undergrad)

## Triplet loss (the predecessor)

Given anchor `a`, positive `p`, negative `n`:

```
L = max(0, d(a, p) - d(a, n) + margin)
```

Pull `a` and `p` within `margin` of each other; push `n` further. Used in face recognition (FaceNet) before InfoNCE became standard.

Triplet loss has practical issues: hard negative mining is critical (random negatives are too easy), training is unstable.

## InfoNCE — the modern default

Given query `q`, positive `k+`, negatives `{k_1, ..., k_N}`:

```
L = -log[ exp(q·k+/τ) / Σ_i exp(q·k_i/τ) ]
```

Softmax classification: out of all candidates, pick the positive. Temperature `τ` (typically 0.07) sharpens the distribution.

InfoNCE upper-bounds the mutual information between query and positive: `I(q; k+) ≥ log(N+1) - L_InfoNCE`. Larger N → tighter bound → better representations.

Why softmax wins over triplet:
- All negatives in one pass; gradient signal from many comparisons.
- No margin tuning.
- Differentiable; well-understood optimization.

## Two-tower vs one-tower

**Two-tower** (CLIP, SimCLR): separate encoders for query and key. Train jointly. The query and key spaces are aligned but not identical.

**One-tower** (BYOL): same encoder for both, possibly with a momentum-updated copy. Simpler; requires tricks (predictor network + stop gradient) to avoid collapse.

For multimodal contrastive (image + text): always two-tower (image encoder + text encoder).

<!-- tier:grad -->
# Contrastive Loss (Grad)

## Hard negatives

Random negatives are easy — too easy. The loss saturates quickly. **Hard negative mining** finds negatives the model currently confuses with positives.

- **In-batch negatives** (SimCLR): every other item in the batch is a negative. Cheap; depends on batch size.
- **Memory bank** (MoCo): maintain a queue of past keys; sample from it for negatives. Effective without huge batches.
- **Active hard mining**: explicitly select negatives close to the anchor in current embedding space. Requires extra forward passes.

Modern recipes (CLIP, SimCLR) use in-batch negatives. The 4096+ batch size provides enough hard negatives without explicit mining.

## Temperature

The temperature `τ` controls how peaked the softmax is. Empirical findings:

- **τ = 0.1**: standard for InfoNCE. Works for most tasks.
- **τ = 0.07**: CLIP's default. Slightly sharper.
- **τ = 0.5**: too soft; loss is uninformative; gradient vanishes.
- **τ = 0.01**: too sharp; gradient saturates on the hardest negative; unstable.

Some implementations make `τ` learnable — clamp it to `[0.01, 1]` and let SGD find the sweet spot. CLIP does this.

## Symmetric vs asymmetric loss

For multimodal contrastive with two modalities:

```
L_image_to_text = -log[exp(e_i · e_t+ / τ) / Σ exp(e_i · e_t / τ)]
L_text_to_image = -log[exp(e_t · e_i+ / τ) / Σ exp(e_t · e_i / τ)]
L = (L_image_to_text + L_text_to_image) / 2
```

Both directions matter. CLIP uses this symmetric formulation. Asymmetric (only one direction) is less stable.

## Beyond contrastive

More recent self-supervised methods drop negatives entirely (BYOL, DINO) or use stop-gradient tricks. The contrastive frame is now one of several; non-contrastive methods often match or beat it. But for **multimodal alignment** (CLIP-style), contrastive remains the dominant approach because the pairs are already meaningful (an image and its caption are by-construction positives).
