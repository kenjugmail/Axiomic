---
title: Beam Search
category: decoding
---
<!-- tier:intro -->

# Beam Search

When a language model generates text, it picks one token at a time. But the best first word doesn't always lead to the best sentence. **Beam search** is a strategy that explores multiple possible sequences simultaneously, keeping the best ones as it goes.

## The Greedy Problem

Imagine the model is translating a sentence. At each step, it picks the most likely next word. But sometimes the globally best translation requires choosing a word that isn't the absolute best at step 1 — it only becomes clearly better after a few more words.

Greedy decoding (always picking the top choice) can get stuck in locally optimal but globally suboptimal sequences.

## How Beam Search Works

Instead of tracking just one sequence, beam search tracks the **top B sequences** at every step (B is called the "beam width"):

1. **Start** with B copies of the empty sequence
2. **Expand** each sequence by considering all possible next tokens
3. **Score** all the resulting sequences by their total probability
4. **Keep** only the top B sequences
5. **Repeat** until all sequences have produced an end token

With a beam width of 1, you get greedy decoding. With B=5, you're exploring 5 paths simultaneously.

## An Example

Suppose B=2 and we're generating a 3-word sentence:

- Step 1: Try all words. Keep "The dog" (prob 0.3) and "A cat" (prob 0.25)
- Step 2: Expand both. Keep "The dog sat" (0.18) and "A cat slept" (0.15)
- Step 3: Expand both. Return the highest-scoring complete sequence

## Length Penalty

Beam search has a bias toward shorter sequences because probabilities multiply (and get smaller) with each token. A 5-word sentence will almost always have a lower probability than a 3-word sentence. **Length penalty** corrects this by dividing the score by a function of the sequence length:

$$\text{score} = \frac{\log P(\text{sequence})}{\text{length}^\alpha}$$

where $\alpha$ controls the penalty. Setting $\alpha = 0.6$–$1.0$ is common.

## When Is Beam Search Used?

- **Machine translation** — the classic use case; beam search with B=4–6 is standard
- **Summarization** — finding the most likely summary
- **Speech recognition** — decoding audio into text

Beam search is less common for open-ended generation (chatbots, creative writing) where diversity matters more than finding the "best" sequence. For those tasks, [sampling methods](/wiki/top-k-top-p) are preferred.

## Related Topics

- [Temperature](/wiki/temperature) — controlling randomness in sampling-based decoding
- [Top-k and Top-p Sampling](/wiki/top-k-top-p) — sampling alternatives to beam search
- [KV Cache](/wiki/kv-cache) — making autoregressive generation efficient

<!-- tier:undergrad -->

# Beam Search

Beam search is an approximate search algorithm for finding high-probability sequences in autoregressive models. It bridges the gap between greedy decoding ($B=1$) and exhaustive search ($B=|\mathcal{V}|^T$, intractable).

## Algorithm

Given an autoregressive model $p(x_t \mid x_{<t})$, beam search maintains a set $\mathcal{B}_t$ of $B$ partial hypotheses at each time step:

**Initialize:** $\mathcal{B}_0 = \{(\langle\text{bos}\rangle, 0)\}$ — one hypothesis with log-probability 0.

**At each step $t$:**
1. For each hypothesis $(y_{1:t-1}, s) \in \mathcal{B}_{t-1}$, compute scores for all extensions:
$$s'(y_{1:t-1}, v) = s + \log p(v \mid y_{1:t-1}) \quad \forall v \in \mathcal{V}$$

2. From all $B \times |\mathcal{V}|$ candidates, keep the top $B$:
$$\mathcal{B}_t = \text{top-}B\{(y_{1:t-1} \circ v, \; s'(y_{1:t-1}, v))\}$$

3. Move completed hypotheses (ending with $\langle\text{eos}\rangle$) to a finished set $\mathcal{F}$.

**Terminate** when all beams are finished or a maximum length is reached.

## Length Normalization

Raw log-probability scores favor shorter sequences since:
$$\log p(y_{1:T}) = \sum_{t=1}^{T} \log p(y_t \mid y_{<t})$$

is a sum of negative terms. Common normalizations:

**Simple length normalization:**
$$\text{score}(y) = \frac{1}{T} \log p(y_{1:T})$$

**Google NMT length penalty** (Wu et al., 2016):
$$\text{lp}(y) = \frac{(5 + T)^\alpha}{(5 + 1)^\alpha}$$
$$\text{score}(y) = \frac{\log p(y_{1:T})}{\text{lp}(y)}$$

where $\alpha \in [0, 1]$ controls the strength. At $\alpha = 0$, no length normalization; at $\alpha = 1$, full normalization by length.

## Diverse Beam Search

Standard beam search often produces near-duplicate sequences. Vijayakumar et al. (2018) proposed **diverse beam search**, which partitions beams into groups and adds a diversity penalty:

$$s'_g(y_{1:t-1}, v) = s + \log p(v \mid y_{1:t-1}) - \lambda \sum_{g' < g} \Delta(v, \mathcal{B}_t^{g'})$$

where $\Delta$ penalizes selecting tokens already chosen by earlier groups.

## Code Example

```python
import torch
import torch.nn.functional as F
from dataclasses import dataclass

@dataclass
class BeamHypothesis:
    tokens: list[int]
    log_prob: float

def beam_search(
    model,
    start_token: int,
    beam_width: int = 5,
    max_length: int = 50,
    length_penalty: float = 0.6,
    eos_token: int = 2,
) -> list[int]:
    """Simple beam search implementation."""
    beams = [BeamHypothesis(tokens=[start_token], log_prob=0.0)]
    finished = []
    
    for step in range(max_length):
        all_candidates = []
        for beam in beams:
            if beam.tokens[-1] == eos_token:
                finished.append(beam)
                continue
            
            input_ids = torch.tensor([beam.tokens])
            with torch.no_grad():
                logits = model(input_ids).logits[0, -1]  # last token logits
            log_probs = F.log_softmax(logits, dim=-1)
            
            # Get top-k extensions
            top_log_probs, top_indices = log_probs.topk(beam_width)
            for lp, idx in zip(top_log_probs.tolist(), top_indices.tolist()):
                all_candidates.append(BeamHypothesis(
                    tokens=beam.tokens + [idx],
                    log_prob=beam.log_prob + lp,
                ))
        
        if not all_candidates:
            break
        
        # Score with length penalty and keep top beams
        all_candidates.sort(
            key=lambda h: h.log_prob / (len(h.tokens) ** length_penalty),
            reverse=True,
        )
        beams = all_candidates[:beam_width]
    
    finished.extend(beams)
    best = max(finished, key=lambda h: h.log_prob / (len(h.tokens) ** length_penalty))
    return best.tokens

```

## Computational Cost

Beam search with width $B$ requires $B$ forward passes per step (or a single batched forward pass). The [KV cache](/wiki/kv-cache) must be maintained for each beam independently, so memory usage scales as $O(B \times L \times d)$ where $L$ is the sequence length and $d$ is the model dimension.

## Related Topics

- [Temperature](/wiki/temperature) — stochastic decoding as an alternative
- [Top-k and Top-p Sampling](/wiki/top-k-top-p) — truncated sampling methods
- [KV Cache](/wiki/kv-cache) — efficient inference for autoregressive generation

<!-- tier:grad -->

# Beam Search

Despite its simplicity, beam search remains the dominant decoding method for constrained generation tasks. Recent work has both challenged and refined our understanding of when and why beam search works.

## The Beam Search Curse

Stahlberg & Byrne (2019, "On NMT Search Errors and Model Errors") demonstrated a surprising result: **exact search (infinite beam width) often produces worse translations than beam search with moderate width**. The model assigns highest probability to degenerate sequences (empty strings, repetitive text), meaning beam search's limited search acts as an implicit regularizer.

This "beam search curse" has been further analyzed by Meister et al. (2020), who showed that beam search implicitly applies a **uniform information density** bias — it prefers sequences where information is spread evenly across tokens rather than concentrated in bursts. This matches the linguistic theory of uniform information density (UID), potentially explaining beam search's effectiveness.

## Minimum Bayes Risk Decoding

An alternative to MAP decoding (which beam search approximates) is **Minimum Bayes Risk (MBR) decoding**:

$$\hat{y} = \arg\min_{y \in \mathcal{Y}} \sum_{y' \in \mathcal{Y}} \mathcal{L}(y, y') \cdot p(y' \mid x)$$

where $\mathcal{L}$ is a loss function (e.g., negative BLEU/COMET score). MBR selects the hypothesis that is most similar to all other likely hypotheses, rather than the single most probable one. Eikema & Aziz (2020) showed MBR with sampled hypotheses outperforms beam search for machine translation, especially when the loss function matches the evaluation metric.

In practice, MBR is implemented by:
1. Sampling $N$ hypotheses from the model (using ancestral or nucleus sampling)
2. Scoring each hypothesis against all others using a utility function
3. Returning the hypothesis with the highest average utility

## Speculative Beam Search

Standard beam search requires $B$ sequential forward passes per step (or one batched pass). **Speculative beam search** (Stern et al., 2018; Sun et al., 2024) accelerates this by using a smaller draft model to propose beam expansions that the large model then verifies in parallel. This can reduce latency by 2–3x while producing identical results to standard beam search.

## Beam Search in the Era of LLMs

Modern large language models (GPT-4, Claude, Llama) rarely use beam search for their primary generation mode. Several factors drive this shift:

1. **Scale reduces the need for search**: Larger models make fewer "errors" that beam search would correct.
2. **RLHF changes the objective**: After RLHF, the model's distribution is shaped by human preferences, not just likelihood. MAP decoding of an RLHF model is not obviously the right objective.
3. **Sampling enables diversity**: For conversational AI, the stochasticity of sampling is a feature, not a bug.

However, beam search remains critical for:
- **Machine translation** (especially production systems like Google Translate)
- **Speech recognition** (CTC-based and attention-based ASR systems)
- **Constrained generation** (when output must satisfy hard constraints)

## Beam Search with Constraints

Hokamp & Liu (2017) introduced **lexically constrained beam search**, where certain tokens or phrases must appear in the output. The algorithm maintains separate beams for different numbers of satisfied constraints, with transitions between "constraint states." This is useful for:
- Terminology-constrained translation
- Keyword-to-text generation
- Infilling tasks

Anderson et al. (2017) extended this to **constrained beam search** (CBS) with arbitrary finite-state constraints, enabling applications like image captioning with required object mentions.

## Connections to Best-First Search

Meister et al. (2021) reframed beam search as **best-first search** in a directed acyclic graph, where nodes are partial hypotheses and edges are token extensions. This perspective unifies beam search with A* search and enables pruning strategies based on admissible heuristics:

$$f(y_{1:t}) = g(y_{1:t}) + h(y_{1:t})$$

where $g$ is the accumulated log-probability and $h$ is a heuristic estimating the future cost-to-go.

## Related Topics

- [Temperature](/wiki/temperature) — stochastic decoding with temperature scaling
- [Top-k and Top-p Sampling](/wiki/top-k-top-p) — truncation methods for sampling
- [KV Cache](/wiki/kv-cache) — memory optimization for autoregressive generation
- [Scaling Laws](/wiki/scaling-laws) — how model scale reduces search errors
