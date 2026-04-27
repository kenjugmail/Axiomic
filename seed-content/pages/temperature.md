---
title: Temperature
category: decoding
---
<!-- tier:intro -->

# Temperature

When a language model generates text, it doesn't just pick the single "best" next word. Instead, it calculates a probability for every possible next token. **Temperature** is the knob that controls how spread out those probabilities are — and it dramatically changes the character of the text the model produces.

## The Basic Idea

Imagine the model is choosing the next word in the sentence "The cat sat on the ___." It might assign:

- "mat" → 40%
- "floor" → 25%
- "chair" → 15%
- "roof" → 10%
- "moon" → 1%
- everything else → 9%

Temperature adjusts how "peaked" or "flat" this distribution is:

- **Low temperature (e.g., 0.2):** The model becomes more confident and conservative. "Mat" might jump to 85%, and unusual choices like "moon" become nearly impossible. The output is predictable and repetitive.
- **Temperature = 1.0:** The default. Probabilities stay as the model originally computed them.
- **High temperature (e.g., 2.0):** The distribution flattens out. "Mat" might drop to 20%, and weird choices like "moon" rise to 8%. The output becomes more creative but also more chaotic and potentially nonsensical.

## Why Does It Matter?

Different tasks call for different temperatures:

- **Code generation or factual Q&A** → Low temperature (0.0–0.3). You want the most likely, correct answer.
- **Creative writing or brainstorming** → Higher temperature (0.7–1.2). You want variety and surprise.
- **Temperature = 0** → Greedy decoding. The model always picks the single most probable token. Completely deterministic.

## The Goldilocks Problem

Setting temperature is more art than science. Too low and you get boring, repetitive text. Too high and you get gibberish. Most practitioners find a sweet spot between 0.5 and 1.0 for general-purpose generation.

Temperature is often combined with other sampling strategies like [Top-k and Top-p](/wiki/top-k-top-p) to get even more control over generation quality.

## Related Topics

- [Top-k and Top-p Sampling](/wiki/top-k-top-p) — other ways to control randomness
- [Beam Search](/wiki/beam-search) — a deterministic alternative to sampling
- [Softmax](/wiki/softmax) — the function temperature modifies

<!-- tier:undergrad -->

# Temperature

Temperature scaling is applied to the logit vector before the softmax function during text generation. It provides a simple but effective mechanism for controlling the entropy of the output distribution.

## Mathematical Formulation

Given a logit vector $\mathbf{z} \in \mathbb{R}^{|\mathcal{V}|}$ produced by the model's final linear layer, the standard softmax computes:

$$p(x_i) = \frac{\exp(z_i)}{\sum_{j=1}^{|\mathcal{V}|} \exp(z_j)}$$

Temperature-scaled softmax divides the logits by a scalar $\tau > 0$:

$$p(x_i \mid \tau) = \frac{\exp(z_i / \tau)}{\sum_{j=1}^{|\mathcal{V}|} \exp(z_j / \tau)}$$

## Analyzing the Extremes

**As $\tau \to 0^+$:** The distribution converges to a one-hot vector placing all mass on $\arg\max_i z_i$. This is equivalent to greedy decoding.

**As $\tau \to \infty$:** The distribution converges to the uniform distribution $p(x_i) = \frac{1}{|\mathcal{V}|}$, where every token is equally likely.

**At $\tau = 1$:** The original model distribution is recovered.

## Entropy Perspective

The Shannon entropy of the temperature-scaled distribution:

$$H(\tau) = -\sum_{i} p(x_i \mid \tau) \log p(x_i \mid \tau)$$

is a monotonically increasing function of $\tau$. Lower temperatures reduce entropy (more deterministic), higher temperatures increase it (more random).

## Connection to Energy-Based Models

Temperature scaling has a direct analogy to statistical mechanics. The logits $z_i$ play the role of negative energies, and $\tau$ is the thermodynamic temperature. The softmax is the Boltzmann distribution:

$$p(x_i \mid \tau) = \frac{\exp(-E_i / \tau)}{Z(\tau)}$$

where $E_i = -z_i$ and $Z(\tau)$ is the partition function.

## Code Example

```python
import torch
import torch.nn.functional as F

def sample_with_temperature(logits: torch.Tensor, temperature: float = 1.0) -> int:
    """Sample a token from logits with temperature scaling."""
    if temperature == 0.0:
        return logits.argmax(dim=-1).item()
    
    scaled_logits = logits / temperature
    probs = F.softmax(scaled_logits, dim=-1)
    return torch.multinomial(probs, num_samples=1).item()

# Example: compare distributions at different temperatures
logits = torch.tensor([2.0, 1.0, 0.5, -1.0, -2.0])
for temp in [0.1, 0.5, 1.0, 2.0]:
    probs = F.softmax(logits / temp, dim=-1)
    entropy = -(probs * probs.log()).sum()
    print(f"τ={temp:.1f} → probs={probs.numpy().round(3)}, H={entropy:.3f}")
```

## Practical Guidelines

| Task | Recommended $\tau$ |
|---|---|
| Code generation | 0.0–0.2 |
| Factual Q&A | 0.0–0.3 |
| General chat | 0.7–0.9 |
| Creative writing | 0.9–1.2 |
| Brainstorming | 1.0–1.5 |

Temperature is almost always combined with [Top-k and Top-p](/wiki/top-k-top-p) filtering for practical generation.

## Related Topics

- [Top-k and Top-p Sampling](/wiki/top-k-top-p) — truncating the distribution before sampling
- [Beam Search](/wiki/beam-search) — deterministic decoding without sampling
- [Softmax](/wiki/softmax) — the underlying probability function

<!-- tier:grad -->

# Temperature

Temperature scaling is one of the simplest interventions in the decoding pipeline, yet its theoretical properties and practical interactions with other decoding strategies reveal subtleties worth examining.

## Calibration and Temperature

Temperature is widely used outside generation for **calibration**. Guo et al. (2017, "On Calibration of Modern Neural Networks") showed that modern neural networks are systematically overconfident, and a single learned temperature parameter (Platt scaling) can significantly improve calibration. For language models, this means the "natural" $\tau = 1$ distribution is not necessarily well-calibrated — the model may benefit from a temperature $\tau \neq 1$ even for tasks where you want the "true" model distribution.

## Temperature and Repetition

A well-known pathology of low-temperature sampling is **degenerate repetition**. Holtzman et al. (2020, "The Curious Case of Neural Text Degeneration") demonstrated that maximization-based decoding (equivalent to $\tau \to 0$) leads to loops and repetitive text even from high-quality models. The explanation: the highest-probability sequence is often not representative of the distribution — it lies in a low-entropy region that doesn't match human text. Human language has a "sweet spot" of per-token entropy (~3.5–4.5 bits for English), and good generation should target that range.

## Adaptive Temperature

Several works propose adapting temperature per-token rather than using a fixed value:

- **Entropy-based adaptation**: Measure the entropy of the current logit distribution and adjust $\tau$ to target a fixed entropy. High-confidence predictions (low entropy) get $\tau = 1$ or lower; uncertain predictions get boosted.
- **Contrastive decoding** (Li et al., 2023): Uses the difference between a large model's and small model's log-probabilities as logits, implicitly adjusting the "effective temperature" per token.
- **Mirostat** (Basu et al., 2021): Directly targets a fixed perplexity for the generated text by dynamically adjusting a truncation parameter, achieving more consistent output quality than fixed temperature.

## Temperature in RLHF and Alignment

Temperature interacts non-trivially with RLHF-trained models. During RLHF, the KL penalty against the base model effectively constrains how far the policy can deviate from the pretrained distribution. At inference time, applying temperature on top of the RLHF policy can:

1. **Undo alignment at high $\tau$**: Flattening the distribution can resurface behaviors the RLHF training suppressed.
2. **Over-constrain at low $\tau$**: Very low temperatures on RLHF models can produce overly cautious, hedge-filled responses because the model's probability mass concentrates on "safe" tokens.

Anthropic's research on Constitutional AI and other alignment approaches notes that the interaction between training-time and inference-time distribution shaping is an active area of study.

## Temperature Scaling in Distillation

Hinton et al. (2015, "Distilling the Knowledge in a Neural Network") introduced temperature as a key hyperparameter in knowledge distillation. The teacher's softmax is computed at high temperature ($\tau = 2$–$20$), producing "soft targets" that preserve the teacher's relative ranking of non-top classes. The distillation loss is:

$$\mathcal{L}_{\text{distill}} = \tau^2 \cdot \text{KL}\!\left[\sigma(\mathbf{z}_T / \tau) \| \sigma(\mathbf{z}_S / \tau)\right]$$

The $\tau^2$ prefactor compensates for the gradient magnitude reduction from the flatter softmax. This use of temperature is distinct from, but conceptually related to, its role in generation.

## Theoretical Limits of Temperature

For a model with vocabulary size $|\mathcal{V}|$ and logit vector $\mathbf{z}$:

- The KL divergence between the tempered distribution and the original: $D_{\text{KL}}[p_\tau \| p_1]$ is convex in $\tau$ with minimum at $\tau = 1$.
- The temperature-scaled distribution belongs to the exponential family with natural parameter $1/\tau$, meaning standard exponential family theory (sufficiency, conjugate priors) applies.

## Related Topics

- [Top-k and Top-p Sampling](/wiki/top-k-top-p) — complementary distribution truncation methods
- [Beam Search](/wiki/beam-search) — search-based decoding as an alternative to sampling
- [Scaling Laws](/wiki/scaling-laws) — how model scale affects the entropy of output distributions
