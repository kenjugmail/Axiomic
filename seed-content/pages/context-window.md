---
title: Context Window
category: efficiency
---
<!-- tier:intro -->
# Context Window

The **context window** is the maximum amount of text a language model can "see" at once — like the model's short-term memory. When you paste a long document into ChatGPT, the context window determines how much of it the model can actually process.

## Why Is It Limited?

The [attention mechanism](/wiki/attention) in transformers compares every token to every other token. If you have $n$ tokens, that's $n^2$ comparisons. Double the context length and you quadruple the computation. This quadratic scaling is the fundamental bottleneck.

## How Big Are Context Windows?

| Model | Context Window |
|-------|---------------|
| GPT-3 (2020) | 2,048 tokens |
| GPT-4 (2023) | 8K–128K tokens |
| Claude 3 (2024) | 200K tokens |
| Gemini 1.5 (2024) | 1M tokens |

## What Happens When You Exceed It?

Most models simply can't process text beyond their context window — the input gets truncated. Some models use sliding window approaches, but they lose the ability to attend to earlier parts of the conversation.

## Related Topics

- [KV Cache](/wiki/kv-cache) — caching attention computation for efficiency
- [Attention](/wiki/attention) — the quadratic bottleneck
- [RoPE](/wiki/rope) — position encoding for long contexts

<!-- tier:undergrad -->
# Context Window

## The Quadratic Bottleneck

Standard self-attention computes an $n \times n$ attention matrix: $\text{Attn}(Q, K, V) = \text{softmax}(QK^T/\sqrt{d_k})V$. The memory requirement is $O(n^2)$ and compute is $O(n^2 d)$.

For $n = 128K$ tokens and $d = 128$, the attention matrix alone requires $128K \times 128K \times 2 = 32$ GB in fp16. This is why efficient attention methods matter.

## Efficient Attention Variants

- **Sliding window attention**: each token attends only to its $w$ nearest neighbors, giving $O(nw)$ complexity
- **Flash Attention** (Dao et al., 2022): computes exact attention in $O(n^2)$ but with far less memory by tiling and recomputation
- **Ring Attention**: distributes attention computation across devices for long sequences

## Context Length Extension

Models trained on short contexts can be extended using:
- **Position interpolation**: scale positions linearly
- **YaRN**: more sophisticated RoPE frequency scaling
- **Continued pre-training**: fine-tune on longer sequences

## Related Topics

- [KV Cache](/wiki/kv-cache) — memory management for generation
- [Grouped Query Attention](/wiki/grouped-query-attention) — reducing the memory per attention head

<!-- tier:grad -->
# Context Window

## The Architecture of Long Context

The challenge of extending context windows involves several interacting factors:

**Attention pattern sparsity.** Empirically, attention patterns in trained models are highly sparse — most tokens attend primarily to nearby tokens and a few global tokens ("attention sinks"). This motivates sparse attention architectures that exploit this structure.

**Memory vs. compute trade-off.** Flash Attention showed that the bottleneck for moderate context lengths is often memory bandwidth, not FLOPs. By tiling the attention computation to fit in SRAM, it achieves 2-4x speedup without any approximation.

**The "Lost in the Middle" problem** (Liu et al., 2023): models with long context windows often fail to use information in the middle of the context effectively. Performance on retrieval tasks follows a U-shape — strong at the beginning and end, weak in the middle.

**State-space models** (Mamba, etc.) offer $O(n)$ complexity as an alternative to attention for long-range dependencies, but may sacrifice some of the capabilities that arise from the full pairwise attention computation.

## Related Topics

- [Scaling Laws](/wiki/scaling-laws) — compute-context trade-offs
- [KV Cache](/wiki/kv-cache) — inference memory for long contexts
