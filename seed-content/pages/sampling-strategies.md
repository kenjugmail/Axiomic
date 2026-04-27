---
title: Sampling Strategies
category: decoding
---
<!-- tier:intro -->
# Sampling Strategies

When a language model generates text, it does not just pick one "correct" next word. Instead, it produces a probability distribution over its entire vocabulary -- maybe 50,000 or more possible next tokens. **Sampling strategies** are the methods used to choose which token to actually pick from that distribution.

## The Simplest Approaches

**Greedy decoding** always picks the single most probable token. It is fast and deterministic, but it produces bland, repetitive text. Imagine always ordering the most popular dish at every restaurant -- you would miss a lot of great food.

**Pure random sampling** picks tokens according to their exact probabilities. If "the" has a 15% chance and "a" has a 10% chance, you would pick "the" 15% of the time and "a" 10% of the time. This produces diverse text, but it can also pick bizarre low-probability tokens that derail the output into nonsense.

## Temperature

[Temperature](/wiki/temperature) is like a dial that controls how "sharp" or "flat" the probability distribution is. Before sampling, each probability is adjusted by dividing the raw scores (logits) by a temperature value $T$.

- **Low temperature** (e.g., 0.2): The distribution becomes very peaked. The model almost always picks the most likely tokens. Output is focused but potentially boring.
- **High temperature** (e.g., 1.5): The distribution flattens out. Less likely tokens get a bigger share. Output is creative but potentially incoherent.
- **Temperature = 1.0**: The original distribution, unchanged.

## Top-k Sampling

[Top-k](/wiki/top-k-top-p) sampling restricts the choice to only the $k$ most probable tokens. If $k = 50$, the model considers only the top 50 candidates, redistributes their probabilities to sum to 1, and samples from that reduced set.

The problem: a fixed $k$ does not adapt to the situation. Sometimes the model is very confident and only 3 tokens make sense. Other times, 500 tokens could reasonably come next. Using $k = 50$ in both cases either allows too many bad options or cuts off good ones.

## Top-p (Nucleus) Sampling

Top-p sampling (Holtzman et al., 2020) solves this by dynamically adjusting the candidate set. Instead of a fixed count, you set a probability threshold $p$ (e.g., 0.9). The model sorts tokens by probability and includes tokens from the top until their cumulative probability reaches $p$. If the model is confident, this might include only 5 tokens. If uncertain, it might include 500.

## Min-p Sampling

Min-p is a newer strategy that sets a floor relative to the top token's probability. If the top token has probability 0.6 and you set min-p to 0.1, then any token with probability below $0.6 \times 0.1 = 0.06$ is excluded. This naturally adapts: when the model is confident, the floor is high and few tokens qualify; when uncertain, the floor is low and many tokens pass.

## Why This Matters

The choice of sampling strategy profoundly affects output quality. Too aggressive and you get repetitive, generic text. Too loose and you get incoherent ramblings. Modern systems typically combine temperature with either top-p or min-p, tuning these parameters for the application: lower temperature for code generation, higher for creative writing.

<!-- tier:undergrad -->
# Sampling Strategies

## Framework

Given a language model with vocabulary $\mathcal{V}$, at each decoding step the model produces logits $z_i$ for each token $i \in \mathcal{V}$. A sampling strategy defines a procedure to select the next token $x_t$ from these logits.

The base probability distribution is:

$$
P(x_t = i \mid x_{<t}) = \text{softmax}(z)_i = \frac{e^{z_i}}{\sum_{j \in \mathcal{V}} e^{z_j}}
$$

## Temperature Scaling

Temperature $T > 0$ rescales the logits before softmax:

$$
P_T(x_t = i) = \frac{e^{z_i / T}}{\sum_{j} e^{z_j / T}}
$$

As $T \to 0$, the distribution converges to a point mass on $\arg\max_i z_i$ (greedy). As $T \to \infty$, it approaches uniform. Temperature does not change the ranking of tokens, only the sharpness of the distribution.

## Top-k Sampling (Fan et al., 2018)

Let $\mathcal{V}^{(k)}$ be the set of $k$ tokens with the highest probabilities. Top-k sampling zeros out all tokens outside this set and renormalizes:

$$
P_{\text{top-}k}(x_t = i) = \begin{cases} \frac{P(x_t = i)}{\sum_{j \in \mathcal{V}^{(k)}} P(x_t = j)} & \text{if } i \in \mathcal{V}^{(k)} \\ 0 & \text{otherwise} \end{cases}
$$

## Nucleus (Top-p) Sampling (Holtzman et al., 2020)

Define the nucleus $\mathcal{V}^{(p)}$ as the smallest set such that:

$$
\sum_{i \in \mathcal{V}^{(p)}} P(x_t = i) \geq p
$$

where tokens are added in decreasing probability order. Sampling proceeds from the renormalized distribution over $\mathcal{V}^{(p)}$.

## Min-p Sampling

Given a threshold $\delta \in [0, 1]$ and the maximum probability $p_{\max} = \max_i P(x_t = i)$, the candidate set is:

$$
\mathcal{V}^{(\text{min-}p)} = \{ i \in \mathcal{V} : P(x_t = i) \geq \delta \cdot p_{\max} \}
$$

## Implementation in PyTorch

```python
import torch
import torch.nn.functional as F

def sample_with_strategies(
    logits: torch.Tensor,       # (vocab_size,)
    temperature: float = 1.0,
    top_k: int = 0,
    top_p: float = 1.0,
    min_p: float = 0.0,
) -> int:
    # Temperature scaling
    if temperature != 1.0:
        logits = logits / temperature

    probs = F.softmax(logits, dim=-1)

    # Min-p filtering
    if min_p > 0.0:
        p_max = probs.max()
        min_p_threshold = p_max * min_p
        probs[probs < min_p_threshold] = 0.0

    # Top-k filtering
    if top_k > 0:
        topk_vals, _ = torch.topk(probs, min(top_k, probs.size(-1)))
        probs[probs < topk_vals[-1]] = 0.0

    # Top-p (nucleus) filtering
    if top_p < 1.0:
        sorted_probs, sorted_indices = torch.sort(probs, descending=True)
        cumulative = torch.cumsum(sorted_probs, dim=-1)
        # Remove tokens with cumulative prob above threshold
        mask = cumulative - sorted_probs > top_p
        sorted_probs[mask] = 0.0
        # Scatter back
        probs = torch.zeros_like(probs).scatter(-1, sorted_indices, sorted_probs)

    # Renormalize and sample
    probs = probs / probs.sum()
    return torch.multinomial(probs, num_samples=1).item()
```

## Repetition Penalty

Keskar et al. (2019) introduced a multiplicative penalty applied to tokens that have already appeared in the generated text. For previously generated token $i$:

$$
z_i' = \begin{cases} z_i / \theta & \text{if } z_i > 0 \\ z_i \cdot \theta & \text{if } z_i \leq 0 \end{cases}
$$

where $\theta > 1$ is the penalty factor. This discourages repetition without forbidding it outright.

## Typical Sampling (Meister et al., 2023)

Rather than selecting the most probable tokens, typical sampling selects tokens whose information content (negative log-probability) is close to the expected information content (entropy):

$$
\mathcal{V}^{(\tau)} = \{ i : | -\log P(x_t = i) - H(X_t) | \leq \tau \}
$$

This filters out both overly predictable tokens and highly surprising ones.

<!-- tier:grad -->
# Sampling Strategies

## Information-Theoretic Analysis

Meister et al. (2023) frame decoding through the lens of information theory. A "typical set" $A_\epsilon^{(n)}$ is the set of sequences whose per-token log-probability is within $\epsilon$ of the entropy rate $h$:

$$
A_\epsilon^{(n)} = \left\{ x^n : \left| -\frac{1}{n} \log P(x^n) - h \right| < \epsilon \right\}
$$

By the asymptotic equipartition property, $P(A_\epsilon^{(n)}) \to 1$ as $n \to \infty$. Greedy decoding systematically selects sequences outside the typical set (their per-token log-probability is too low, i.e., they are too "certain"). This explains why greedy outputs feel repetitive and generic: they are atypical under the model's own distribution.

Holtzman et al. (2020) demonstrated this empirically, showing that human-generated text has higher per-token surprisal than greedy-decoded text from the same model -- humans write in the typical set, greedy decoding does not.

## Speculative Decoding

Leviathan et al. (2023) and Chen et al. (2023) introduced speculative decoding, which accelerates sampling from large models without changing the output distribution. A small "draft" model $M_q$ generates $K$ candidate tokens autoregressively, and the large "target" model $M_p$ verifies them in parallel:

For each candidate token $x_t$ with draft probability $q(x_t)$ and target probability $p(x_t)$:
- Accept with probability $\min(1, p(x_t)/q(x_t))$
- On rejection, sample a correction token from the residual distribution:

$$
p'(x) = \frac{\max(0, p(x) - q(x))}{\sum_{x'} \max(0, p(x') - q(x'))}
$$

This guarantees that the final output is distributed exactly as $p$, while achieving a speedup proportional to the acceptance rate. With a well-matched draft model, acceptance rates of 70--90% are typical, yielding 2--3x wall-clock speedups.

## Structured and Constrained Decoding

For applications requiring structured output (JSON, code, SQL), sampling must respect grammatical constraints. Willard & Louf (2023) showed that context-free grammar constraints can be enforced during sampling by maintaining a parser state and masking logits for tokens that would lead to invalid parse states. At each step:

$$
P_{\text{constrained}}(x_t = i) \propto P(x_t = i) \cdot \mathbb{1}[i \in \text{Valid}(s_t)]
$$

where $s_t$ is the current parser state and $\text{Valid}(s_t)$ returns the set of tokens that can extend the current partial parse.

## Contrastive Decoding

Li et al. (2023) proposed contrastive decoding, which exploits the observation that undesirable behaviors (repetition, incoherence) are amplified in smaller models. The score for each token is:

$$
\text{CD}(x_t) = \log P_{\text{expert}}(x_t) - \log P_{\text{amateur}}(x_t)
$$

subject to a plausibility constraint $P_{\text{expert}}(x_t) \geq \alpha \cdot \max_{x} P_{\text{expert}}(x)$. This amplifies behaviors that distinguish the expert model from the amateur, which tend to be the desirable ones (coherence, factuality).

## Sampling Under Alignment

RLHF-trained models have already had their distributions shifted toward human preferences, which interacts with sampling parameters. Mudgal et al. (2024) showed that best-of-$n$ sampling -- generating $n$ candidates and selecting the one scored highest by a reward model -- can approximate the RLHF-optimal policy:

$$
\pi^*(x) \propto \pi_{\text{ref}}(x) \cdot \exp\left(\frac{r(x)}{\beta}\right)
$$

Best-of-$n$ converges to this distribution as $n \to \infty$, providing an inference-time alternative to fine-tuning.

## Key References

- Fan, A., Lewis, M., & Dauphin, Y. (2018). Hierarchical neural story generation. *ACL*.
- Holtzman, A., et al. (2020). The curious case of neural text degeneration. *ICLR*.
- Keskar, N. S., et al. (2019). CTRL: A conditional transformer language model with controllable generation. *arXiv:1909.05858*.
- Leviathan, Y., et al. (2023). Fast inference from transformers via speculative decoding. *ICML*.
- Li, X. L., et al. (2023). Contrastive decoding: Open-ended text generation as optimization. *ACL*.
- Meister, C., et al. (2023). Locally typical sampling. *TACL*.
- Willard, B. T., & Louf, R. (2023). Efficient guided generation for large language models. *arXiv:2307.09702*.
