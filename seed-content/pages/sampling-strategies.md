---
title: Sampling Strategies
category: decoding
---
<!-- tier:intro -->

# Sampling Strategies

After a language model has been trained, how does it actually *generate* text? At each step, the model produces a probability distribution over all possible next tokens. The **sampling strategy** determines how we pick from that distribution. This choice dramatically affects the quality, creativity, and reliability of the output.

## Greedy Decoding -- Always Pick the Best

The simplest approach: always choose the token with the highest probability.

```
Model predicts: "the" (40%), "a" (25%), "my" (15%), ...
Greedy picks:   "the"
```

**Pros**: Deterministic, fast, often produces grammatically correct text.
**Cons**: Boring and repetitive. Greedy decoding tends to get stuck in loops ("I think that I think that I think that...") because high-probability tokens keep reinforcing each other.

## Random (Pure) Sampling -- Roll the Dice

Pick the next token randomly according to the full probability distribution. A token with 40% probability gets chosen 40% of the time.

**Pros**: High diversity, creative outputs.
**Cons**: Too random. Low-probability tokens (like obscure words or nonsense) get picked sometimes, producing incoherent text.

## Temperature -- Tuning the Randomness

**Temperature** is a dial that controls how "sharp" or "flat" the probability distribution is:

- **Temperature = 1.0**: Use the original probabilities (standard sampling)
- **Temperature < 1.0**: Make the distribution sharper (high-probability tokens become even more likely). At temperature 0, this becomes greedy decoding.
- **Temperature > 1.0**: Make the distribution flatter (more uniform, more random)

Think of it like adjusting confidence: low temperature means the model is very confident in its top choice; high temperature means it's more open to alternatives.

## Top-k Sampling -- Keep the Top Candidates

Only consider the top $k$ most probable tokens, then sample from just those. If $k = 50$, the model picks from the 50 most likely next tokens (with probabilities renormalized to sum to 1).

**The problem**: A fixed $k$ doesn't adapt. Sometimes only 2-3 tokens make sense (and $k=50$ includes nonsense). Other times, 200 tokens could all be reasonable (and $k=50$ is too restrictive).

## Nucleus (Top-p) Sampling -- The Smart Cutoff

Instead of a fixed number of tokens, keep the smallest set of tokens whose cumulative probability exceeds a threshold $p$. For example, with $p = 0.9$:

1. Sort tokens by probability (highest first)
2. Add tokens until their cumulative probability reaches 90%
3. Sample from just those tokens

This adapts naturally. When the model is confident (one token has 95% probability), the nucleus is just that one token. When the model is uncertain (many tokens around 5%), the nucleus includes many options.

**Nucleus sampling (top-p)** is the default in most applications, typically with $p$ between 0.9 and 0.95.

## Beam Search -- Exploring Multiple Paths

Instead of committing to one token at a time, beam search maintains the top $b$ partial sequences (beams) at each step. It explores multiple possibilities in parallel and returns the highest-scoring complete sequence.

**Used for**: Translation, summarization -- tasks where finding the single best output matters.
**Not ideal for**: Creative writing, chatbots -- where diversity matters.

## What Most Systems Use

In practice, modern LLMs (ChatGPT, Claude, etc.) typically combine several strategies:
- **Nucleus sampling** (top-p = 0.9-0.95) as the primary method
- **Temperature** adjustment based on the task (lower for code, higher for creative writing)
- Sometimes a **top-k** filter as well

## Related Topics

- [Masked Self-Attention](/wiki/masked-self-attention) -- the causal mechanism that enables autoregressive generation
- [Training Objectives](/wiki/training-objectives) -- how models learn the distributions they sample from
- [Tokens](/wiki/tokens) -- the units being sampled

<!-- tier:undergrad -->

# Sampling Strategies

Given a trained autoregressive model that produces $P(x_t \mid x_{<t})$ at each step, the decoding strategy determines how sequences are constructed. This section formalizes the main approaches.

## The Decoding Problem

At each step $t$, the model outputs logits $\mathbf{z}_t \in \mathbb{R}^{|\mathcal{V}|}$. The probability distribution is:

$$P(x_t = v \mid x_{<t}) = \frac{\exp(z_v / \tau)}{\sum_{v'} \exp(z_{v'} / \tau)}$$

where $\tau$ is the temperature. Different decoding strategies apply transformations to this distribution before sampling.

## Temperature Scaling

Temperature $\tau$ rescales the logits before softmax:

$$P_\tau(v) = \frac{\exp(z_v / \tau)}{\sum_{v'} \exp(z_{v'} / \tau)}$$

- As $\tau \to 0^+$: $P_\tau$ approaches a one-hot distribution (greedy)
- $\tau = 1$: Original distribution
- As $\tau \to \infty$: $P_\tau$ approaches uniform distribution

The entropy of the distribution is a monotonically increasing function of $\tau$:

$$H(P_\tau) = -\sum_v P_\tau(v) \log P_\tau(v)$$

## Top-k Sampling

Define the set of top-$k$ tokens:

$$\mathcal{V}^{(k)} = \{v : v \text{ is among the } k \text{ highest-probability tokens}\}$$

Sample from the truncated and renormalized distribution:

$$P_{\text{top-}k}(v) = \begin{cases} P(v) / \sum_{v' \in \mathcal{V}^{(k)}} P(v') & \text{if } v \in \mathcal{V}^{(k)} \\ 0 & \text{otherwise} \end{cases}$$

## Nucleus (Top-p) Sampling

Holtzman et al. (2020) proposed top-p sampling. Define the nucleus as the smallest set $\mathcal{V}^{(p)}$ such that:

$$\sum_{v \in \mathcal{V}^{(p)}} P(v) \geq p$$

where tokens are added in decreasing probability order. Sample from the renormalized distribution over $\mathcal{V}^{(p)}$.

The key advantage over top-k: the size of $\mathcal{V}^{(p)}$ adapts to the model's confidence. When the distribution is peaked, few tokens are included. When flat, many are included.

## Beam Search

Beam search maintains $b$ partial hypotheses. At each step:

1. For each beam, compute scores for all vocabulary tokens
2. From all $b \times |\mathcal{V}|$ candidates, keep the top $b$
3. Continue until all beams produce an end-of-sequence token

The score of a sequence $\mathbf{y}$ of length $T$ is typically length-normalized:

$$\text{score}(\mathbf{y}) = \frac{1}{T^\alpha} \sum_{t=1}^{T} \log P(y_t \mid y_{<t})$$

where $\alpha \in [0, 1]$ is a length penalty (often $\alpha = 0.6$). Without length normalization, beam search strongly prefers short sequences.

## Repetition Penalty

To combat the tendency toward repetitive text, a penalty is applied to tokens that have already appeared:

$$z'_v = \begin{cases} z_v / \theta & \text{if } v \in \{x_1, \ldots, x_{t-1}\} \text{ and } z_v > 0 \\ z_v \times \theta & \text{if } v \in \{x_1, \ldots, x_{t-1}\} \text{ and } z_v < 0 \end{cases}$$

where $\theta > 1$ is the penalty factor. This penalizes positive logits (making already-seen tokens less likely) and amplifies negative logits.

**Frequency penalty** and **presence penalty** (used by OpenAI API) are additive variants:
- Presence penalty: $z'_v = z_v - \alpha \cdot \mathbb{1}[v \in \{x_{<t}\}]$
- Frequency penalty: $z'_v = z_v - \alpha \cdot \text{count}(v, x_{<t})$

## Implementation

```python
import torch
import torch.nn.functional as F

def sample_next_token(logits: torch.Tensor, temperature: float = 1.0,
                      top_k: int = 0, top_p: float = 1.0) -> int:
    """Sample a token from logits with temperature, top-k, and top-p."""
    # Temperature scaling
    if temperature != 1.0:
        logits = logits / temperature

    # Top-k filtering
    if top_k > 0:
        top_k_values, _ = torch.topk(logits, top_k)
        threshold = top_k_values[-1]
        logits[logits < threshold] = float('-inf')

    # Top-p (nucleus) filtering
    if top_p < 1.0:
        sorted_logits, sorted_indices = torch.sort(logits, descending=True)
        cumulative_probs = torch.cumsum(F.softmax(sorted_logits, dim=-1), dim=-1)

        # Remove tokens with cumulative probability above the threshold
        sorted_indices_to_remove = cumulative_probs > top_p
        # Keep at least one token
        sorted_indices_to_remove[0] = False
        # Shift right to keep the first token above threshold
        sorted_indices_to_remove[1:] = sorted_indices_to_remove[:-1].clone()
        sorted_indices_to_remove[0] = False

        indices_to_remove = sorted_indices[sorted_indices_to_remove]
        logits[indices_to_remove] = float('-inf')

    # Sample
    probs = F.softmax(logits, dim=-1)
    return torch.multinomial(probs, num_samples=1).item()
```

## Comparing Strategies

| Strategy | Deterministic? | Diversity | Quality | Speed |
|---|---|---|---|---|
| Greedy | Yes | Very low | Medium | Fast |
| Beam search ($b$=5) | ~Yes | Low | High (for specific tasks) | 5x slower |
| Top-k ($k$=50) | No | Medium | Medium-High | Fast |
| Top-p ($p$=0.9) | No | Adaptive | High | Fast |
| Temperature ($\tau$=0.7) + top-p | No | Tunable | High | Fast |

## Related Topics

- [Masked Self-Attention](/wiki/masked-self-attention) -- the causal attention enabling autoregressive decoding
- [Training Objectives](/wiki/training-objectives) -- how the model learned the distribution it samples from
- [BPE Tokenization](/wiki/bpe-tokenization) -- the token vocabulary being sampled from

<!-- tier:grad -->

# Sampling Strategies

Decoding from autoregressive models remains an active research area with connections to information theory, search algorithms, and cognitive science.

## The Decoding Gap

A fundamental observation: the highest-probability sequence under the model is often *not* the best output. Holtzman et al. (2020, "The Curious Case of Neural Text Degeneration") showed that:

1. **Exact most-likely sequences are degenerate**: The global MAP (maximum a posteriori) sequence tends to be short, repetitive, and dull.
2. **Human text is not maximum-probability text**: The probability that humans assign to their own text (measured by model perplexity) is much lower than the maximum achievable probability. Humans operate in a "sweet spot" of the probability distribution -- not too likely (boring) and not too unlikely (incoherent).

This "likelihood trap" suggests that good decoding requires staying in a high-probability region without maximizing probability. Top-p sampling achieves this by truncating the low-probability tail.

## Typical Sampling

Meister et al. (2023) proposed **typical sampling** based on information theory. Instead of selecting high-probability tokens, select tokens whose information content (surprisal) is close to the expected information content (entropy):

$$\mathcal{V}_\epsilon = \{v : |{-\log P(v \mid x_{<t})} - H(P(\cdot \mid x_{<t}))| < \epsilon\}$$

Intuitively: sample tokens that are neither too surprising nor too predictable. Typical sampling is grounded in the **Asymptotic Equipartition Property (AEP)**: for long sequences, typical sequences all have roughly the same probability, and this set contains almost all the probability mass.

Empirical results show typical sampling produces text with statistical properties closer to human text than top-p sampling, particularly in terms of token-level entropy and burstiness.

## Speculative Decoding

Leviathan et al. (2023) and Chen et al. (2023) independently proposed **speculative decoding** to accelerate generation without changing the output distribution.

**Algorithm**:
1. A small draft model $M_q$ generates $K$ candidate tokens: $\tilde{x}_1, \ldots, \tilde{x}_K$
2. The large target model $M_p$ scores all $K$ tokens in a single forward pass
3. Accept $\tilde{x}_i$ with probability $\min(1, P_p(\tilde{x}_i) / P_q(\tilde{x}_i))$
4. On first rejection at position $i$, resample from $\max(0, P_p - P_q)$ and discard $\tilde{x}_{i+1}, \ldots, \tilde{x}_K$

**Key theorem**: The output distribution of speculative decoding is identical to sampling from $M_p$. The speedup comes from generating $K$ tokens with one large-model forward pass instead of $K$ forward passes.

Expected acceptance length: $\mathbb{E}[\text{accepted}] = \sum_{i=1}^{K} \prod_{j=1}^{i} (1 - D_{\text{TV}}(P_p^{(j)}, P_q^{(j)}))$, where $D_{\text{TV}}$ is the total variation distance. Speedup is higher when the draft model closely approximates the target model.

## Contrastive Decoding

Li et al. (2023) proposed **contrastive decoding**: use the difference between a large (expert) model and a small (amateur) model to identify tokens that reflect the expert's unique capabilities:

$$\text{score}(v) = \log P_{\text{expert}}(v) - \log P_{\text{amateur}}(v)$$

Subject to the constraint that $v$ must be in the expert's top-$p$ nucleus. This amplifies tokens that the large model prefers but the small model doesn't, which tend to be more factual, coherent, and sophisticated.

The information-theoretic interpretation: contrastive decoding approximates the **pointwise mutual information** between the token and the model's additional capacity:

$$\text{PMI}(v; \text{expert vs amateur}) \approx \log \frac{P_{\text{expert}}(v)}{P_{\text{amateur}}(v)}$$

## Minimum Bayes Risk (MBR) Decoding

MBR decoding selects the output that minimizes the expected loss under the model's distribution:

$$\hat{\mathbf{y}} = \arg\min_{\mathbf{y} \in \mathcal{C}} \mathbb{E}_{\mathbf{y}' \sim P(\cdot | \mathbf{x})} [\mathcal{L}(\mathbf{y}, \mathbf{y}')]$$

In practice, approximate MBR:
1. Sample $N$ candidates from the model
2. Score each candidate against all others using a utility function (e.g., BLEURT, COMET for translation)
3. Select the candidate with the highest average utility

MBR decoding is the standard in machine translation competitions and consistently outperforms beam search. The key insight: beam search maximizes model probability, but MBR maximizes expected quality under the model's uncertainty.

## Guided and Constrained Decoding

**Classifier-free guidance** (adapted from diffusion models): Interpolate between conditional and unconditional generations:

$$\tilde{z}_v = z_v^{\text{cond}} + \gamma (z_v^{\text{cond}} - z_v^{\text{uncond}})$$

where $\gamma > 1$ amplifies the effect of the conditioning. This can be applied to LLMs by treating the system prompt as the conditioning signal.

**Grammar-constrained decoding**: Restrict outputs to valid strings in a formal grammar (e.g., JSON, SQL, Python). At each step, mask logits for tokens that would make the partial output inconsistent with the grammar. This is implemented via finite-state automata or pushdown automata tracking the parser state.

**LMQL** (Beurer-Kellner et al., 2023): A query language for constrained LLM decoding that combines natural language generation with constraints (type checking, regex matching, length limits) applied at decode time.

## Parallel and Non-Autoregressive Decoding

The sequential nature of autoregressive decoding is a fundamental bottleneck. Alternatives:

**Jacobi decoding** (Santilli et al., 2023): Initialize all positions randomly, then iteratively apply the model in parallel. Converges to the same fixed point as autoregressive decoding for deterministic (greedy) decoding.

**Medusa** (Cai et al., 2024): Add multiple prediction heads to predict tokens 1, 2, ..., $k$ steps ahead. Verify candidate continuations using tree attention. Achieves 2-3x speedup.

**Lookahead decoding** (Fu et al., 2024): Maintain a pool of n-gram candidates generated by the model's own drafts. Verify multiple n-grams in parallel using tree-structured attention masks.

## Related Topics

- [Masked Self-Attention](/wiki/masked-self-attention) -- the attention pattern enabling autoregressive generation
- [Training Objectives](/wiki/training-objectives) -- the objectives that shape the distribution being decoded
- [Efficiency](/wiki/efficiency) -- hardware considerations for decoding optimization
