---
title: Top-k and Top-p Sampling
category: decoding
---
<!-- tier:intro -->

# Top-k and Top-p Sampling

When a language model generates text, it produces a probability distribution over its entire vocabulary — often 50,000 to 100,000+ tokens. Most of those tokens are terrible choices for the next word. **Top-k** and **Top-p** are two strategies for throwing out the bad options before sampling.

## The Problem

Suppose the model is completing: "The capital of France is ___." Even with a reasonable [temperature](/wiki/temperature), there's a small but nonzero probability assigned to absurd tokens like "banana" or "!!!". If you sample from the full distribution thousands of times during a long generation, you'll eventually hit one of these bad tokens — and one wrong word can derail the whole text.

## Top-k Sampling

The simplest fix: only keep the **k most probable** tokens and redistribute the probability among them.

For example, with k=5, if the top 5 tokens are "Paris" (60%), "Lyon" (10%), "Marseille" (8%), "Bordeaux" (5%), "Strasbourg" (4%), you'd throw away everything else and sample only from these five (renormalized to sum to 100%).

- **Small k** (e.g., 5–10) → Very focused, safe choices
- **Large k** (e.g., 100–500) → More diversity
- **k=1** → Greedy decoding (always pick the best)

**The problem with top-k:** A fixed k doesn't adapt to context. Sometimes the model is very confident (only 2–3 good options), and k=50 keeps too many bad ones. Other times the model is genuinely uncertain (50+ reasonable options), and k=50 cuts off good choices.

## Top-p (Nucleus) Sampling

Top-p is smarter: instead of keeping a fixed number of tokens, keep the **smallest set of tokens whose cumulative probability exceeds p**.

For p=0.9, you'd sort tokens by probability and keep adding them until you've accumulated 90% of the total probability mass. If the model is confident, this might be just 2–3 tokens. If it's uncertain, it could be hundreds.

This adapts to the "shape" of the distribution automatically:
- Confident predictions → few tokens kept → focused output
- Uncertain predictions → many tokens kept → diverse output

## Common Settings

Most modern APIs combine both methods:
- **p=0.9 to 0.95** is a popular default for general-purpose generation
- **k=50** with **p=0.95** is a common combination
- Temperature is usually applied first, then top-k/top-p filtering

## Related Topics

- [Temperature](/wiki/temperature) — scaling probabilities before filtering
- [Beam Search](/wiki/beam-search) — a deterministic alternative to sampling
- [Tokens](/wiki/tokens) — the units being sampled

<!-- tier:undergrad -->

# Top-k and Top-p Sampling

Top-k and top-p (nucleus) sampling are **truncation methods** that restrict the sampling pool to a subset of the vocabulary before drawing a token. They address the long-tail problem inherent in sampling from large discrete distributions.

## Top-k Sampling

Given a probability distribution $p(x_i)$ over vocabulary $\mathcal{V}$, top-k sampling:

1. Sort tokens by probability: $p(x_{(1)}) \geq p(x_{(2)}) \geq \ldots$
2. Keep only the top $k$ tokens: $\mathcal{V}_k = \{x_{(1)}, \ldots, x_{(k)}\}$
3. Renormalize: $p'(x_i) = \frac{p(x_i)}{\sum_{x_j \in \mathcal{V}_k} p(x_j)}$ for $x_i \in \mathcal{V}_k$, and $0$ otherwise

Fan et al. (2018, "Hierarchical Neural Story Generation") introduced top-k sampling for open-ended text generation, showing it significantly outperformed pure sampling.

## Top-p (Nucleus) Sampling

Holtzman et al. (2020, "The Curious Case of Neural Text Degeneration") proposed nucleus sampling, which adapts the truncation size to the distribution shape:

1. Sort tokens by probability: $p(x_{(1)}) \geq p(x_{(2)}) \geq \ldots$
2. Find the smallest $k^*$ such that $\sum_{i=1}^{k^*} p(x_{(i)}) \geq p_{\text{threshold}}$
3. Keep $\mathcal{V}_p = \{x_{(1)}, \ldots, x_{(k^*)}\}$ and renormalize

The nucleus is the minimal set of tokens capturing probability mass $\geq p$.

## Combined Pipeline

In practice, temperature scaling, top-k, and top-p are applied sequentially:

$$\mathbf{z} \xrightarrow{\div \tau} \mathbf{z}' \xrightarrow{\text{softmax}} \mathbf{p} \xrightarrow{\text{top-}k} \mathbf{p}' \xrightarrow{\text{top-}p} \mathbf{p}'' \xrightarrow{\text{sample}} x_t$$

## Code Example

```python
import torch
import torch.nn.functional as F

def top_k_top_p_filtering(
    logits: torch.Tensor,
    top_k: int = 0,
    top_p: float = 1.0,
    temperature: float = 1.0,
) -> torch.Tensor:
    """Filter logits using top-k and/or top-p (nucleus) filtering."""
    if temperature != 1.0:
        logits = logits / temperature
    
    # Top-k filtering
    if top_k > 0:
        top_k = min(top_k, logits.size(-1))
        indices_to_remove = logits < torch.topk(logits, top_k)[0][..., -1, None]
        logits[indices_to_remove] = float('-inf')
    
    # Top-p (nucleus) filtering
    if top_p < 1.0:
        sorted_logits, sorted_indices = torch.sort(logits, descending=True)
        cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)
        
        # Remove tokens with cumulative probability above the threshold
        sorted_indices_to_remove = cumulative_probs > top_p
        # Keep at least one token
        sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
        sorted_indices_to_remove[..., 0] = False
        
        indices_to_remove = sorted_indices_to_remove.scatter(
            dim=-1, index=sorted_indices, src=sorted_indices_to_remove
        )
        logits[indices_to_remove] = float('-inf')
    
    return logits

# Example usage
logits = torch.randn(1, 50257)  # GPT-2 vocabulary size
filtered = top_k_top_p_filtering(logits[0], top_k=50, top_p=0.95, temperature=0.8)
probs = F.softmax(filtered, dim=-1)
token = torch.multinomial(probs, num_samples=1)
```

## Effective Vocabulary Size

A useful diagnostic is the **effective vocabulary size** at each step, measured as the number of tokens with nonzero probability after filtering. For a well-tuned configuration:

- Highly constrained contexts (code, factual recall): effective vocab ≈ 5–20
- Open-ended generation: effective vocab ≈ 50–500
- Maximum uncertainty (beginning of generation): effective vocab can reach 1000+

## Related Topics

- [Temperature](/wiki/temperature) — the scaling step before filtering
- [Beam Search](/wiki/beam-search) — deterministic decoding via search
- [Tokens](/wiki/tokens) — the vocabulary being filtered

<!-- tier:grad -->

# Top-k and Top-p Sampling

Truncation-based sampling methods balance the diversity of stochastic decoding against the coherence of maximization-based approaches. This section examines their theoretical properties and recent extensions.

## Why Truncation Works: The Unreliable Tail

Holtzman et al. (2020) provided the key insight: the tail of a language model's distribution is **unreliable**. Tokens in the tail have received minimal gradient signal during training, so their exact probabilities are poorly estimated. By truncating the tail, we avoid sampling from this unreliable region.

Empirically, human text has a consistent per-token entropy of ~3.5–4.5 bits for English. Greedy decoding ($H = 0$) and pure sampling ($H$ too high) both deviate from this range. Nucleus sampling with $p \approx 0.9$–$0.95$ tends to produce text with human-like entropy.

## Typical Sampling

Meister et al. (2023, "Locally Typical Sampling") proposed an information-theoretic alternative to nucleus sampling. Instead of keeping the highest-probability tokens, typical sampling keeps tokens whose information content $-\log p(x_i)$ is close to the expected information content (entropy):

$$\mathcal{V}_{\text{typical}} = \{x_i : |{-\log p(x_i) - H(p)}| < \epsilon\}$$

This discards both the "boring" high-probability tokens and the "surprising" low-probability tokens, keeping the "typical set" from information theory. In practice, typical sampling produces text with more consistent quality than nucleus sampling, though the improvement is modest.

## $\eta$-Sampling and Min-p

**$\eta$-sampling** (Hewitt et al., 2022) sets the truncation threshold as a multiple of the entropy: tokens with probability below $\eta \cdot e^{-H(p)}$ are removed. This provides a principled link between the truncation and the distribution's uncertainty.

**Min-p sampling** (community-developed, widely adopted in 2024) keeps all tokens with probability $\geq p_{\min} \cdot p_{\max}$, where $p_{\max}$ is the highest token probability. This is simpler than top-p and naturally adapts: when the model is confident ($p_{\max}$ high), fewer tokens survive; when uncertain, more pass the threshold. Min-p with values around 0.05–0.1 has become popular in open-source model serving.

## Theoretical Analysis of Truncation

Consider the KL divergence between the truncated distribution $q$ and the original model distribution $p$. For top-p with threshold $p_{\text{nuc}}$:

$$D_{\text{KL}}[q \| p] = -\log\left(\sum_{x_i \in \mathcal{V}_p} p(x_i)\right) = -\log(p_{\text{nuc}})$$

when the truncation boundary exactly hits $p_{\text{nuc}}$. This means top-p at $p = 0.9$ incurs a bounded KL cost of $-\log(0.9) \approx 0.105$ nats per token, regardless of the distribution shape — a useful property for bounding generation quality.

## Interaction with Speculative Decoding

Truncation methods complicate **speculative decoding** ([KV Cache](/wiki/kv-cache)). In speculative decoding, a small draft model proposes tokens that the large model verifies. The acceptance probability depends on the ratio $p_{\text{large}}(x) / p_{\text{draft}}(x)$. When top-k or top-p is applied, the truncated distributions may disagree on which tokens are in the nucleus, reducing acceptance rates. Leviathan et al. (2023) showed that careful handling of the truncation step is necessary to maintain the theoretical guarantees of speculative decoding.

## Repetition Penalties and Frequency Penalties

In practice, truncation is often combined with **repetition penalties** that downweight tokens that have already appeared:

$$z_i' = z_i / \alpha^{\mathbb{1}[x_i \in \text{context}]}$$

where $\alpha > 1$ penalizes repetition. OpenAI's API provides both `frequency_penalty` (proportional to count) and `presence_penalty` (binary). These interact with top-k/top-p in complex ways — aggressive repetition penalties can push tokens outside the nucleus, causing unexpected vocabulary choices.

## Related Topics

- [Temperature](/wiki/temperature) — controlling entropy before truncation
- [Beam Search](/wiki/beam-search) — search-based decoding as an alternative
- [Scaling Laws](/wiki/scaling-laws) — how model scale affects distribution sharpness
