---
title: InfoNCE
category: multimodal
---
<!-- tier:intro -->
# InfoNCE

The contrastive loss function used in CLIP, SimCLR, MoCo, and most modern self-supervised representation learning.

Given query `q`, positive `k+`, and negatives `{k_1, ..., k_N}`:

$$L_{InfoNCE} = -\log \frac{\exp(q \cdot k^+ / \tau)}{\sum_i \exp(q \cdot k_i / \tau)}$$

Softmax classification across `N+1` candidates; the positive is the 'correct class'. Temperature `τ` sharpens the distribution.

<!-- tier:undergrad -->
# InfoNCE (Undergrad)

## Mutual information bound

InfoNCE is derived from a variational lower bound on mutual information `I(q; k+)`:

```
I(q; k+) ≥ log(N+1) - L_InfoNCE
```

The bound is tighter when `N` is larger. This is the theoretical justification for using many negatives. Practical: larger batches (more in-batch negatives) → tighter MI bound → better representations.

## Implementation

```python
def info_nce(query, keys, positive_idx, temperature=0.07):
    """
    query: (B, d)
    keys: (B+, d), where B+ = B + N negatives
    positive_idx: (B,) — index of positive in keys for each query
    """
    logits = query @ keys.T / temperature   # (B, B+)
    return F.cross_entropy(logits, positive_idx)
```

Most code uses in-batch negatives: every other item in the batch is a negative. Cheap and effective at large batch sizes.

## Temperature tuning

`τ` is critical. Effects:

- **Too high (e.g., 1.0)**: softmax is flat. Gradient is small; everything looks similar.
- **Too low (e.g., 0.01)**: softmax is peaked. Gradient saturates on the hardest negative; training becomes unstable.

Empirically `τ = 0.07` (CLIP) or `τ = 0.1` (SimCLR) works well. Some implementations make `τ` learnable, clamped to a reasonable range.

## What it learns

The features that minimize InfoNCE are those that:
- Match across positive pairs (augmentation invariance for SimCLR; image-caption alignment for CLIP).
- Differ across negative pairs.

For SimCLR: features become invariant to augmentation noise (color jitter, crop, blur). Useful for downstream classification.

For CLIP: features encode the semantic content shared between images and their captions. Useful for cross-modal retrieval and zero-shot classification.

<!-- tier:grad -->
# InfoNCE (Grad)

## Bias issues

The MI lower bound is not always tight. For high-dimensional features and limited negatives, the bound can be loose; the model trains on a proxy that doesn't fully capture MI.

**SwAV, BYOL, DINO**: alternative self-supervised methods that don't rely on InfoNCE directly. They use clustering, predictor networks with stop gradients, or self-distillation. Often match or exceed InfoNCE-based methods on downstream tasks.

For **multimodal alignment** (CLIP), InfoNCE remains dominant — the cross-modal pairs (image + caption) are the natural positive structure.

## Hard negative dynamics

A subtle issue: in-batch negatives may not be hard enough. Random items in the batch are likely 'easy' negatives — semantically very different from the query. The hard cases (visually similar but semantically different) are rare in random batches.

**Mitigations**:
- **Memory queue** (MoCo): keep a long FIFO of past keys; sample from it. Many more negatives without big batches.
- **Hard negative mining**: explicitly select negatives close in current embedding space.
- **Triplet sampling**: build batches with curated similar-but-different items.

For frontier-scale CLIP training (LAION-5B, etc.), random in-batch negatives at ~32k batch size are sufficient. The data scale provides enough variety that hard negatives are present in normal sampling.

## Connection to MoCo and the queue

MoCo's contribution: decouple the query encoder from the key encoder via a momentum update. The keys come from a slow-moving copy of the encoder, allowing them to be stored in a queue across batches.

```
q = encoder_q(x_query)
k = encoder_k(x_key)
encoder_k = momentum * encoder_k + (1 - momentum) * encoder_q

queue.enqueue(k)
loss = info_nce(q, queue, positive_idx=0)
```

The queue holds many keys (e.g., 65k); each batch contributes only a few. Effectively gets InfoNCE's MI-bound benefit at small batch size. Important when memory is constrained.

Modern CLIP-style training generally doesn't use MoCo's queue because batch sizes are large enough. But MoCo influenced the architectural design of all subsequent self-supervised methods.
