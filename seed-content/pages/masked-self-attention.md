---
title: Masked Self-Attention
category: attention
---
<!-- tier:intro -->

# Masked Self-Attention

When you're reading a book, you can glance back and forth across the entire page. But when you're *writing* a story, you can only build on what you've already written -- you don't know what comes next. **Masked self-attention** (also called causal attention) enforces exactly this constraint in a language model.

## The Problem

In a standard [attention](/wiki/attention) mechanism, every token can look at every other token in the sequence. That's great for understanding text (like in BERT), but it's a problem for *generating* text.

If you're training a model to predict the next word and it can already see the future words, it's cheating. It would just copy the answer instead of learning to predict. Masked self-attention prevents this cheating.

## How It Works

The idea is simple: block each token from seeing any token that comes *after* it. Token 1 can only see itself. Token 2 can see tokens 1 and 2. Token 3 can see tokens 1, 2, and 3. And so on.

This is implemented using a triangular **mask** -- a grid where future positions are blocked:

```
         Token 1  Token 2  Token 3  Token 4
Token 1    YES      no       no       no
Token 2    YES     YES       no       no
Token 3    YES     YES      YES       no
Token 4    YES     YES      YES      YES
```

"YES" means "can attend to" and "no" means "blocked." Notice the triangular pattern -- this is why it's sometimes called a "causal mask" (because information only flows from past causes to future effects).

## Why "Causal"?

The name "causal" comes from the idea of causality: the past affects the future, but the future cannot affect the past. In a causal model, the prediction for position $t$ depends only on positions $1, 2, \ldots, t$, never on positions $t+1, t+2, \ldots$

This is what makes **autoregressive generation** possible. When generating text, the model:

1. Starts with a prompt
2. Predicts the next token (using attention over only the tokens so far)
3. Adds that token to the sequence
4. Repeats from step 2

Each step can reuse all the attention computations from previous steps (called [KV caching](/wiki/kv-cache)), making generation efficient.

## Masked Attention in GPT and Friends

Every decoder-only model (GPT, LLaMA, Claude, Gemini) uses masked self-attention in every layer. It's the key architectural choice that enables these models to generate text one token at a time while training efficiently on entire sequences in parallel.

During **training**, the mask lets the model process an entire document at once while computing a valid next-token prediction loss at every position. This is much faster than generating one token at a time.

During **inference** (generation), the model attends only to previous tokens naturally, since future tokens don't exist yet. But the mask is still applied to any prefix tokens that are processed together.

## Related Topics

- [Attention](/wiki/attention) -- the base mechanism that masking modifies
- [Encoder-Decoder](/wiki/encoder-decoder) -- where masked attention is used in the decoder
- [Sampling Strategies](/wiki/sampling-strategies) -- how tokens are chosen during autoregressive generation

<!-- tier:undergrad -->

# Masked Self-Attention

Masked (causal) self-attention restricts the attention mechanism so that each position can only attend to itself and earlier positions. This is the foundation of autoregressive language modeling.

## Mathematical Formulation

Standard self-attention computes:

$$\text{Attention}(\mathbf{Q}, \mathbf{K}, \mathbf{V}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^T}{\sqrt{d_k}}\right)\mathbf{V}$$

Causal masking adds a mask $\mathbf{M} \in \{0, -\infty\}^{n \times n}$ before the softmax:

$$\text{CausalAttn}(\mathbf{Q}, \mathbf{K}, \mathbf{V}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}^T}{\sqrt{d_k}} + \mathbf{M}\right)\mathbf{V}$$

where:

$$M_{ij} = \begin{cases} 0 & \text{if } j \leq i \\ -\infty & \text{if } j > i \end{cases}$$

Adding $-\infty$ before softmax ensures those positions get zero attention weight after exponentiation: $e^{-\infty} = 0$.

## Why Masking Enables Parallel Training

Without masking, autoregressive training would require sequential computation -- generating each token conditioned on all previous tokens. The causal mask allows **teacher forcing**: feed the entire ground-truth sequence, apply the mask, and compute all next-token predictions in parallel.

For a sequence $[x_1, x_2, \ldots, x_n]$, the loss is:

$$\mathcal{L} = -\sum_{t=1}^{n} \log P(x_t \mid x_1, \ldots, x_{t-1})$$

Each term in this sum is computed simultaneously thanks to the mask, which ensures position $t$'s representation depends only on positions $\leq t$.

## The Attention Matrix Structure

For a 4-token sequence, the raw attention logits $\mathbf{S} = \frac{\mathbf{Q}\mathbf{K}^T}{\sqrt{d_k}}$ are:

$$\mathbf{S} + \mathbf{M} = \begin{bmatrix} s_{11} & -\infty & -\infty & -\infty \\ s_{21} & s_{22} & -\infty & -\infty \\ s_{31} & s_{32} & s_{33} & -\infty \\ s_{41} & s_{42} & s_{43} & s_{44} \end{bmatrix}$$

After softmax (applied row-wise), each row sums to 1 and has zeros in the masked positions.

## KV Caching for Efficient Generation

During autoregressive generation, the causal structure means that when generating token $t+1$, the key and value vectors for tokens $1, \ldots, t$ are unchanged. The **KV cache** stores these, so each generation step only computes:

1. The query, key, and value for the new token $t+1$
2. Attention between the new query and all cached keys
3. The weighted sum of all cached values

This reduces per-step complexity from $O(t \cdot d)$ (recomputing all K, V) to $O(d)$ for the new token plus $O(t \cdot d)$ for the attention computation.

```python
# KV cache during generation
cached_k = []  # list of key tensors
cached_v = []  # list of value tensors

for step in range(max_tokens):
    # Only compute Q, K, V for the new token
    q_new = x_new @ W_Q  # (1, d_k)
    k_new = x_new @ W_K  # (1, d_k)
    v_new = x_new @ W_V  # (1, d_v)

    cached_k.append(k_new)
    cached_v.append(v_new)

    K = torch.cat(cached_k, dim=0)  # (t+1, d_k)
    V = torch.cat(cached_v, dim=0)  # (t+1, d_v)

    # Attend to all past tokens (no mask needed -- future doesn't exist)
    attn_weights = softmax(q_new @ K.T / sqrt(d_k))
    output = attn_weights @ V
```

## PyTorch Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

def causal_self_attention(x: torch.Tensor, W_Q: nn.Linear, W_K: nn.Linear,
                          W_V: nn.Linear, n_heads: int) -> torch.Tensor:
    B, T, d = x.shape
    d_k = d // n_heads

    Q = W_Q(x).view(B, T, n_heads, d_k).transpose(1, 2)  # (B, h, T, d_k)
    K = W_K(x).view(B, T, n_heads, d_k).transpose(1, 2)
    V = W_V(x).view(B, T, n_heads, d_k).transpose(1, 2)

    # Compute attention scores
    scores = Q @ K.transpose(-2, -1) / (d_k ** 0.5)  # (B, h, T, T)

    # Apply causal mask
    causal_mask = torch.triu(torch.ones(T, T, device=x.device), diagonal=1).bool()
    scores = scores.masked_fill(causal_mask, float('-inf'))

    attn = F.softmax(scores, dim=-1)
    out = attn @ V  # (B, h, T, d_k)

    return out.transpose(1, 2).contiguous().view(B, T, d)
```

## Related Topics

- [Attention](/wiki/attention) -- the general attention mechanism
- [Cross-Attention](/wiki/cross-attention) -- attention between encoder and decoder (no causal mask)
- [KV Cache](/wiki/kv-cache) -- exploiting causal structure for efficient generation

<!-- tier:grad -->

# Masked Self-Attention

Causal masking is more than a training trick -- it defines the information flow structure that determines what a transformer can compute, how efficiently it generates, and what theoretical limitations it faces.

## Causal Attention and Autoregressive Models as Directed Graphical Models

A transformer with causal masking implements a specific factorization of the joint distribution:

$$P(\mathbf{x}) = \prod_{t=1}^{T} P(x_t \mid x_{<t})$$

This is the **autoregressive factorization**, which is always valid by the chain rule of probability -- no independence assumptions are made. The causal mask ensures the architecture respects this factorization: the hidden state at position $t$ in every layer is a deterministic function of $x_1, \ldots, x_t$ only.

This contrasts with masked language models (BERT), which model $P(x_t \mid x_{\backslash t})$ -- the conditional distribution given all *other* tokens. Yang et al. (2019, XLNet) showed that permutation-based training can combine the benefits of both, though this approach did not scale as well in practice.

## Attention Sinks and Causal Masking Artifacts

Xiao et al. (2024, "Efficient Streaming Language Models with Attention Sinks") discovered a phenomenon called **attention sinks**: in causal attention, the first token in the sequence receives disproportionately high attention weight regardless of its semantic content.

The explanation: softmax attention must allocate 100% of its probability mass. With causal masking, the first token is always in every token's attention window. When a head has "nothing to attend to," it dumps weight on the first token as a default. This leads to:

- The first token's representation becoming corrupted (overwritten by this artifact)
- Removing the first token from the KV cache causing catastrophic performance collapse
- Models implicitly "reserving" the first token position as a no-op attention target

The StreamingLLM solution: keep a small number of "sink tokens" in the KV cache even when doing sliding-window attention, enabling infinite-length generation.

## Efficient Causal Attention: FlashAttention

The causal mask's triangular structure enables optimized GPU implementations. FlashAttention (Dao et al., 2022) and FlashAttention-2 (Dao, 2023) exploit this structure:

Standard attention materializes the full $n \times n$ attention matrix, which requires $O(n^2)$ memory. FlashAttention computes attention in blocks, never materializing the full matrix. For causal attention specifically:

1. **Block-level skipping**: Upper-triangular blocks (entirely masked) are skipped entirely
2. **Partial blocks**: Blocks on the diagonal apply the mask within the block
3. **Full blocks**: Lower-triangular blocks need no mask

This yields ~2x speedup for causal attention over bidirectional attention in FlashAttention-2, because roughly half the blocks are skipped.

## Sliding Window and Dilated Causal Attention

Standard causal attention has $O(n^2)$ complexity. Several approaches restrict the attention window while maintaining causality:

**Sliding window attention** (Mistral, Longformer): Each token attends to only the previous $w$ tokens:

$$M_{ij} = \begin{cases} 0 & \text{if } i - w < j \leq i \\ -\infty & \text{otherwise} \end{cases}$$

With $L$ layers of window size $w$, the effective receptive field is $L \times w$ tokens. Mistral 7B uses $w = 4096$ with 32 layers, giving a theoretical receptive field of 131,072 tokens.

**Dilated attention** (LongNet): Uses dilated (strided) attention patterns that grow exponentially across layers, achieving $O(n \log n)$ effective coverage.

**Grouped sliding window**: Alternate layers of local (sliding window) and global (full causal) attention. This achieves near-full-attention quality with reduced compute.

## Causal Masking and Parallel Decoding

The strict autoregressive constraint of causal masking is a bottleneck for generation speed (one token per forward pass). Recent work explores relaxing this:

**Speculative decoding** (Leviathan et al., 2023; Chen et al., 2023): A small "draft" model generates $k$ candidate tokens, and the large model verifies all $k$ in parallel using causal attention. Tokens are accepted from left to right until a rejection, achieving 2-3x speedup without changing the output distribution.

**Medusa** (Cai et al., 2024): Adds multiple prediction heads at the last layer, each predicting a different future token. Verification uses a tree-structured causal mask where each candidate token attends to its hypothesized prefix. This achieves ~2.5x speedup.

**Jacobi decoding** (Santilli et al., 2023): Treats autoregressive generation as a fixed-point iteration problem. Initialize all positions randomly, then iteratively update all positions in parallel using the causal model. Converges to the same output as sequential decoding but can converge faster when tokens are predictable.

## Bidirectional Attention in "Decoder-Only" Models

Some modern techniques break the pure causal constraint:

**Prefix caching / prefix LM**: The prompt portion uses bidirectional attention, and only the generation portion is causal. This gives the model full bidirectional context over the input.

**Infilling / FIM** (Bavarian et al., 2022): Training with Fill-in-the-Middle transforms allows the model to condition on both prefix and suffix, generating the middle. This requires a modified attention mask where suffix tokens are visible but middle tokens are generated causally.

## Related Topics

- [Attention](/wiki/attention) -- the general attention mechanism
- [Sampling Strategies](/wiki/sampling-strategies) -- how tokens are selected during causal generation
- [Efficiency](/wiki/efficiency) -- hardware-aware optimizations for causal attention
