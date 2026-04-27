---
title: Induction Heads
category: interpretability
---
<!-- tier:intro -->

# Induction Heads

If you type "The cat sat on the mat. The cat sat on the..." a language model will confidently predict "mat." How does it do this? One answer involves a specific circuit inside transformers called an **induction head** — one of the most important and best-understood building blocks of how these models learn from context.

## The Pattern Completion Trick

An induction head implements a simple but powerful rule: **"If I've seen this pattern before in the current text, predict what came next last time."**

More concretely, suppose the model has seen the sequence "A B" earlier in the text, and now it encounters "A" again. An induction head will look back, find the previous "A," notice that "B" followed it, and boost the prediction of "B."

This isn't something the model was explicitly programmed to do — it *emerges* from training. The model discovers that pattern-matching is an incredibly useful strategy for predicting text.

## Why "Induction"?

The name comes from inductive reasoning — drawing general rules from specific examples. When the model sees "A B ... A" and predicts "B," it's performing a kind of induction: "A was followed by B before, so A is probably followed by B again."

## A Two-Head Circuit

What makes induction heads fascinating is that they require *cooperation* between two attention heads across two different layers:

1. **Head 1 (the "previous token head"):** This head, in an earlier layer, looks at each token and copies information about what token *preceded* it. So at position where "B" appeared, it stores information that "A" came before.

2. **Head 2 (the induction head proper):** This head, in a later layer, looks at the current token "A," searches back through the text for other positions where "A" appeared, and reads off what followed — which is "B," thanks to Head 1's bookkeeping.

The two heads work together like a team: one records "what came before me" at each position, and the other uses that information to make predictions.

## Why It Matters

Induction heads are important for several reasons:

- They explain a large chunk of what's called **in-context learning** — the ability of transformers to pick up patterns from examples you provide in the prompt.
- They show that transformers develop **modular, interpretable algorithms** during training, not just opaque statistical associations.
- They appear in virtually every transformer model that researchers have examined, suggesting they're a fundamental computational motif.

## Related Topics

- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — the field that discovered induction heads
- [Attention](/wiki/attention) — the mechanism that induction heads use to look back through text
- [Superposition](/wiki/superposition) — why finding circuits like this is often difficult

<!-- tier:undergrad -->

# Induction Heads

Induction heads, identified by Olsson et al. (2022), are a two-layer attention circuit that implements a form of approximate copying from context. They are the primary mechanism behind in-context learning in transformers.

## The Induction Head Mechanism

An induction head completes the pattern $[A][B] \ldots [A] \to [B]$. It does this through a composition of two attention heads:

**Layer $l$: Previous Token Head.** This head attends from position $i$ to position $i-1$ using a simple positional attention pattern. Its OV (output-value) circuit copies information about the identity of token $i-1$ into the residual stream at position $i$. After this head, position $i$ contains information about $\text{token}_{i-1}$.

**Layer $l' > l$: Induction Head.** This head's QK (query-key) circuit is set up so that the query at position $j$ (where $\text{token}_j = A$) matches keys at positions where the *previous token* was also $A$. Thanks to the previous token head, those positions now carry information about $A$ in their keys. The OV circuit then copies the token at the matched position to the output.

## Formal QK/OV Analysis

Each attention head has four matrices: $\mathbf{W}_Q, \mathbf{W}_K, \mathbf{W}_V, \mathbf{W}_O \in \mathbb{R}^{d \times d_h}$ (or transposed). The two key compositions are:

**QK circuit** (what to attend to):
$$\text{Attention Score}_{i,j} = \mathbf{x}_i^\top \mathbf{W}_Q \mathbf{W}_K^\top \mathbf{x}_j$$

**OV circuit** (what to copy):
$$\text{Output}_i = \sum_j \alpha_{i,j} \, \mathbf{W}_V \mathbf{W}_O \, \mathbf{x}_j$$

For the induction head, the QK circuit composes with the previous token head's OV circuit. If we denote the previous token head's contribution to the residual stream as $\Delta \mathbf{x}$, the induction head's attention pattern effectively computes:

$$\text{Score}(q_\text{current}, k_\text{candidate}) \propto \mathbf{x}_\text{current}^\top \mathbf{W}_Q^{(l')} \mathbf{W}_K^{(l')^\top} \left(\mathbf{x}_\text{candidate} + \underbrace{\mathbf{W}_{OV}^{(l)} \mathbf{x}_{\text{candidate}-1}}_{\text{prev token info}}\right)$$

This is a case of **K-composition**: head in layer $l'$ reads from the output of head in layer $l$ via the key input.

## Detecting Induction Heads

A simple diagnostic: on repeated random token sequences (e.g., $[r_1, r_2, \ldots, r_n, r_1, r_2, \ldots, r_n]$), an induction head at the second occurrence of $r_i$ will attend strongly to the position *after* the first occurrence of $r_i$ (i.e., to $r_{i+1}$'s first position).

```python
import torch
from transformer_lens import HookedTransformer

model = HookedTransformer.from_pretrained("gpt2-small")

# Create repeated random tokens
seq_len = 50
random_tokens = torch.randint(0, model.cfg.d_vocab, (1, seq_len))
repeated = torch.cat([random_tokens, random_tokens], dim=1)

# Run and cache attention patterns
_, cache = model.run_with_cache(repeated)

# Score each head: average attention from position i+seq_len to position i+1
# (token at i+seq_len is same as token at i; induction head should attend to i+1)
scores = torch.zeros(model.cfg.n_layers, model.cfg.n_heads)
for layer in range(model.cfg.n_layers):
    attn = cache[f"blocks.{layer}.attn.hook_pattern"][0]  # (n_heads, seq, seq)
    for pos in range(seq_len - 1):
        scores[layer] += attn[:, pos + seq_len, pos + 1]
scores /= (seq_len - 1)
# High-scoring heads are likely induction heads
```

## The Phase Change

Olsson et al. (2022) found that induction heads form during a discrete **phase change** early in training. Before the phase change, the model cannot do in-context learning; after it, in-context learning ability jumps sharply. This coincides with a sudden drop in loss on sequences that require copying from context.

## Generalized Induction

Real induction heads are more flexible than strict $[A][B] \ldots [A] \to [B]$ copying. They implement **fuzzy** or **abstract** pattern matching:

- Matching might be based on semantic similarity, not just token identity
- The "copied" output may be a distribution shift rather than a single token prediction
- Multiple induction heads can combine for multi-step pattern completion

## Related Topics

- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — the broader research program
- [Attention](/wiki/attention) — QK and OV circuits
- [Positional Encoding](/wiki/positional-encoding) — how relative position enables the previous token head

<!-- tier:grad -->

# Induction Heads

The induction head circuit (Olsson et al., 2022, "In-context Learning and Induction Heads") is arguably the most thoroughly understood nontrivial circuit in transformers. This section covers the rigorous analysis, training dynamics, and connections to broader phenomena.

## Composition Taxonomy

Elhage et al. (2021) identified three types of attention head composition in the residual stream:

1. **Q-composition**: head $H_2$ reads $H_1$'s output through its query input.
2. **K-composition**: head $H_2$ reads $H_1$'s output through its key input. **This is what induction heads use.**
3. **V-composition**: head $H_2$ reads $H_1$'s output through its value input.

For an induction head $H_2$ composing with previous token head $H_1$, the effective attention score from position $i$ to position $j$ is:

$$\text{Score}_{i \to j} = (\mathbf{x}_i + \ldots)^\top \mathbf{W}_{QK}^{(H_2)} (\mathbf{x}_j + \mathbf{W}_{OV}^{(H_1)} \mathbf{x}_{j-1} + \ldots)$$

The cross-term $\mathbf{x}_i^\top \mathbf{W}_{QK}^{(H_2)} \mathbf{W}_{OV}^{(H_1)} \mathbf{x}_{j-1}$ is the **K-composition term** responsible for the induction behavior. It computes a match between the current token $\mathbf{x}_i$ and the token preceding position $j$ (i.e., $\mathbf{x}_{j-1}$), enabling the pattern $[A][B]\ldots[A] \to \text{attend to } [B]$.

## Training Dynamics and Phase Transitions

Olsson et al. (2022) documented a striking training phenomenon:

1. **Pre-induction phase**: The model relies primarily on unigram and bigram statistics. In-context learning score (measured as loss improvement on the second half of repeated sequences) is near zero.

2. **Phase transition** (typically 1--5% through training): Induction heads form abruptly. Within a narrow training window:
   - In-context learning score jumps discontinuously
   - Per-token loss on sequences requiring copying drops sharply
   - This coincides with a "bump" in overall training loss, suggesting the model is reorganizing its circuits

3. **Post-induction phase**: The model leverages induction heads for increasingly abstract pattern matching.

This phase transition is robust across model scales and architectures, appearing in models from 2-layer attention-only transformers to full-scale GPT-style models.

## Connection to In-Context Learning

The paper's central hypothesis: **induction heads are the mechanistic basis of in-context learning.** Evidence:

- **Correlational**: the formation of induction heads coincides with the emergence of in-context learning ability.
- **Causal**: ablating induction heads significantly degrades in-context learning performance, with minimal effect on other capabilities.
- **Scaling**: the in-context learning score attributable to induction heads scales with model size.

However, this doesn't mean induction heads are the *only* mechanism for in-context learning. Larger models likely develop more sophisticated circuits that build on the basic induction pattern.

## Beyond Two-Layer Induction

Practical models implement more complex variants:

**Multi-step induction.** In deep models, chains of attention heads implement multi-hop pattern matching. For example, detecting $[A][B][C] \ldots [A][B] \to [C]$ requires either wider context windows in single heads or three-head compositions.

**Semantic induction.** Rather than matching exact tokens, heads match semantic categories. Olsson et al. found heads that implement fuzzy matching where "cat" at the query might match "dog" at the key because the OV matrices project through a space where semantically similar tokens are nearby.

**Induction via MLPs.** Recent work suggests that MLP layers can implement a form of induction-like behavior through memorized bigram/trigram associations, complementing the attention-based mechanism. The relative contribution of attention-based vs. MLP-based pattern completion varies by model scale and architecture.

## Relationship to Formal Language Theory

Induction heads implement a form of **copy** or **repeat** operation, which connects to formal language theory. A single induction head can recognize patterns in the language $\{ww \mid w \in \Sigma^*\}$, which is not context-free. This gives transformers power beyond what their finite depth would suggest from a circuit complexity perspective (Merrill & Sabharwal, 2023).

## Limitations of the Induction Head Framework

1. **Interference from other heads.** In practice, attention patterns result from many heads operating simultaneously. Isolating the "true" induction signal requires careful ablation.
2. **Positional encoding dependence.** The previous token head relies on positional information. Different positional encoding schemes (absolute, RoPE, ALiBi) may yield different implementations of the same logical circuit.
3. **Superposition of circuits.** The same attention head may participate in multiple circuits, making clean attribution difficult.

## Related Topics

- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — methodology for circuit analysis
- [Superposition](/wiki/superposition) — why heads serve multiple functions
- [Positional Encoding](/wiki/positional-encoding) — how position information enables the previous token head
- [Attention](/wiki/attention) — the QK/OV framework
