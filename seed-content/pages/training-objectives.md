---
title: Training Objectives
category: training
---
<!-- tier:intro -->

# Training Objectives

A training objective (or loss function) is the question we're asking the model to answer during training. Different objectives teach models different skills, and the choice of objective is one of the most important decisions in building a language model.

## Causal Language Modeling (CLM) -- "Predict the Next Word"

This is the objective behind GPT, LLaMA, and most modern LLMs. The idea is dead simple: given all the words so far, predict the next one.

```
Input:  "The cat sat on the"
Target: "mat"
```

The model reads text left-to-right and is trained to predict each token given everything before it. This is done using [masked self-attention](/wiki/masked-self-attention) so the model can't peek ahead.

**Why it works so well**: Predicting the next word forces the model to understand grammar, facts, reasoning, and common sense. If you can accurately predict what comes next in any text, you must deeply understand language.

**Used by**: GPT-2, GPT-3, GPT-4, LLaMA, Claude, Mistral

## Masked Language Modeling (MLM) -- "Fill in the Blank"

This is BERT's training objective. Randomly hide (mask) some words in a sentence, and ask the model to figure out what they were.

```
Input:  "The [MASK] sat on the [MASK]"
Target: "cat" and "mat"
```

About 15% of tokens are masked during training. The model uses bidirectional attention (it can see both left and right context), which gives it a richer understanding of each word's context.

**Trade-off**: MLM produces excellent representations for understanding text, but the model doesn't naturally generate text because it was never trained to produce sequences left-to-right.

**Used by**: BERT, RoBERTa, DeBERTa

## Sequence-to-Sequence (Seq2Seq) -- "Transform Input to Output"

Used in [encoder-decoder](/wiki/encoder-decoder) models. The encoder reads an input sequence, and the decoder generates an output sequence. The training objective is to maximize the probability of the correct output given the input.

A popular variant is **span corruption** (used by T5): replace random spans of text with sentinel tokens, and train the model to generate the missing spans.

```
Input:  "The <X> sat <Y> the mat"
Target: "<X> cat <Y> on"
```

**Used by**: T5, BART, mBART, UL2

## Contrastive Learning -- "Match the Pair"

Instead of predicting specific tokens, contrastive objectives train the model to produce similar representations for related inputs and different representations for unrelated inputs.

For example, given a question and its correct passage, the model should produce embeddings that are close together. A random unrelated passage should produce a distant embedding.

**Used by**: CLIP (image-text matching), SimCSE (sentence similarity), DPR (passage retrieval), E5

## Which Objective Should You Use?

| Objective | Best For |
|---|---|
| CLM | Text generation, chatbots, general-purpose AI |
| MLM | Text understanding, classification, NER |
| Seq2Seq | Translation, summarization, structured generation |
| Contrastive | Search, retrieval, similarity matching |

## Related Topics

- [Masked Self-Attention](/wiki/masked-self-attention) -- the mechanism enabling CLM
- [Encoder-Decoder](/wiki/encoder-decoder) -- the architecture for seq2seq objectives
- [BPE Tokenization](/wiki/bpe-tokenization) -- how text is split into the tokens that objectives operate on

<!-- tier:undergrad -->

# Training Objectives

The training objective defines the loss function that drives parameter updates. Each objective imposes different inductive biases and leads to models with different capabilities.

## Causal Language Modeling (CLM)

Given a sequence $\mathbf{x} = (x_1, x_2, \ldots, x_T)$, CLM maximizes the log-likelihood:

$$\mathcal{L}_{\text{CLM}} = -\sum_{t=1}^{T} \log P_\theta(x_t \mid x_1, \ldots, x_{t-1})$$

Each conditional is computed by the model's forward pass with [causal masking](/wiki/masked-self-attention). The final hidden state at position $t-1$ is projected to a distribution over the vocabulary:

$$P_\theta(x_t \mid x_{<t}) = \text{softmax}(\mathbf{h}_t W_{\text{vocab}} + \mathbf{b})_{x_t}$$

where $W_{\text{vocab}} \in \mathbb{R}^{d \times |\mathcal{V}|}$.

**Key property**: Every token in the sequence provides a training signal, making CLM highly data-efficient.

## Masked Language Modeling (MLM)

Given input $\mathbf{x}$, randomly select ~15% of positions to form the mask set $\mathcal{M}$. Replace masked tokens with:
- `[MASK]` token (80% of the time)
- Random token (10%)
- Original token (10%)

The loss is computed only at masked positions:

$$\mathcal{L}_{\text{MLM}} = -\sum_{t \in \mathcal{M}} \log P_\theta(x_t \mid \mathbf{x}_{\backslash \mathcal{M}})$$

The 80/10/10 split addresses a train-test mismatch: at inference time, inputs don't contain `[MASK]` tokens.

**Compute comparison**: For a sequence of length $T$, CLM provides $T$ gradient signals per sequence while MLM provides $0.15T$. This means MLM needs roughly $6.7\times$ more data to see the same number of training signals.

## Span Corruption (T5-style)

Instead of masking individual tokens, mask random spans of consecutive tokens. Replace each span with a single sentinel token $\langle X_i \rangle$:

**Input**: "The $\langle X_1 \rangle$ on the $\langle X_2 \rangle$"

**Target**: "$\langle X_1 \rangle$ cat sat $\langle X_2 \rangle$ mat"

The model is trained with a seq2seq objective:

$$\mathcal{L}_{\text{span}} = -\sum_{t=1}^{T'} \log P_\theta(y_t \mid y_{<t}, \mathbf{x})$$

where $\mathbf{x}$ is the corrupted input and $\mathbf{y}$ is the target containing the masked spans. Span lengths are sampled from a geometric distribution with mean 3.

## Contrastive Objectives

Given positive pairs $(x_i, x_i^+)$ and negative pairs $(x_i, x_j^-)$, the InfoNCE loss is:

$$\mathcal{L}_{\text{contrastive}} = -\sum_{i=1}^{N} \log \frac{\exp(\text{sim}(f(x_i), f(x_i^+)) / \tau)}{\sum_{j=1}^{N} \exp(\text{sim}(f(x_i), f(x_j)) / \tau)}$$

where $\text{sim}$ is cosine similarity, $f$ is the encoder, and $\tau$ is a temperature parameter. In-batch negatives (treating other items in the batch as negatives) is the standard approach.

**CLIP objective**: Aligns image and text encoders. Given a batch of $N$ (image, text) pairs, both the image-to-text and text-to-image contrastive losses are computed:

$$\mathcal{L}_{\text{CLIP}} = \frac{1}{2}(\mathcal{L}_{\text{img} \to \text{text}} + \mathcal{L}_{\text{text} \to \text{img}})$$

## Next Sentence Prediction (NSP) and Sentence Order Prediction (SOP)

**NSP** (BERT): Binary classification -- is sentence B the actual next sentence after A, or a random sentence? Later work (RoBERTa) showed NSP doesn't help and can hurt.

**SOP** (ALBERT): Given two consecutive sentences, predict whether they are in the correct order. More useful than NSP because it requires understanding inter-sentence coherence.

## Code Example: CLM Training

```python
import torch
import torch.nn.functional as F

def clm_loss(model, input_ids: torch.Tensor) -> torch.Tensor:
    """Compute causal language modeling loss."""
    # input_ids: (batch_size, seq_len)
    # Model outputs logits: (batch_size, seq_len, vocab_size)
    logits = model(input_ids[:, :-1])  # predict from tokens 0..T-2

    targets = input_ids[:, 1:]  # targets are tokens 1..T-1

    # Flatten for cross-entropy
    loss = F.cross_entropy(
        logits.reshape(-1, logits.size(-1)),
        targets.reshape(-1),
        ignore_index=-100  # ignore padding
    )
    return loss
```

## Related Topics

- [Masked Self-Attention](/wiki/masked-self-attention) -- enables CLM by preventing future peeking
- [Encoder-Decoder](/wiki/encoder-decoder) -- architecture for seq2seq objectives
- [Sampling Strategies](/wiki/sampling-strategies) -- generating from a CLM-trained model

<!-- tier:grad -->

# Training Objectives

The choice of pretraining objective has deep implications for model capabilities, sample efficiency, and downstream task performance. This section surveys the landscape, recent developments, and open questions.

## CLM vs. MLM: A Deeper Analysis

The debate between autoregressive (CLM) and masked (MLM) objectives connects to fundamental questions in probabilistic modeling:

**Density estimation perspective**: CLM estimates the joint distribution $P(\mathbf{x})$ via the chain rule. MLM estimates conditional distributions $P(x_t \mid \mathbf{x}_{\backslash t})$ but not the joint. This distinction matters because:

- Only CLM can generate samples from $P(\mathbf{x})$ directly
- MLM's conditional distributions are not guaranteed to be consistent (they may not correspond to any valid joint distribution). This is the **pseudo-likelihood** problem (Besag, 1975).

**Tighter bounds**: CLM directly optimizes $\log P(\mathbf{x})$, providing an exact bound on the data log-likelihood. MLM optimizes a pseudo-likelihood that is only an approximation. However, empirically, the bidirectional context in MLM leads to better representations for downstream tasks at small-to-medium scale.

**XLNet** (Yang et al., 2019) attempted to combine both advantages via **permutation language modeling**: train an autoregressive model on all possible permutations of the input sequence. This captures bidirectional context while maintaining a valid density estimator. However, the approach requires complex attention masking and did not scale as cleanly as standard CLM.

## UL2: Unifying Objectives

Tay et al. (2022) proposed **Unified Language Learner (UL2)**, which trains a single model with a mixture of objectives:

1. **R-Denoiser** (regular denoising): Short spans, like T5. Teaches local understanding.
2. **S-Denoiser** (sequential denoising): Causal prefix LM. Teaches generation.
3. **X-Denoiser** (extreme denoising): Long spans (up to 50% of input). Teaches global understanding.

Each objective is signaled by a mode token prepended to the input. The mixing ratio is a hyperparameter; UL2 uses approximately equal weights.

Key result: UL2-trained models match or exceed specialist models on both understanding and generation benchmarks. PaLM-2 (Anil et al., 2023) adopted a mixture-of-denoisers approach inspired by UL2.

## ELECTRA: Replaced Token Detection

Clark et al. (2020) introduced an alternative to MLM that provides training signal at every position:

1. A small generator model (MLM) predicts masked tokens
2. Replace masked positions with the generator's predictions
3. A discriminator model classifies each token as "original" or "replaced"

$$\mathcal{L}_{\text{ELECTRA}} = -\sum_{t=1}^{T} \left[ \mathbb{1}[x_t = x_t^{\text{orig}}] \log D_\theta(x_t) + \mathbb{1}[x_t \neq x_t^{\text{orig}}] \log(1 - D_\theta(x_t)) \right]$$

ELECTRA achieves BERT-level performance with 1/4 the compute because every token provides a training signal (not just the 15% that are masked).

## DPO and RLHF: Alignment Objectives

Beyond pretraining, modern LLMs use alignment objectives that operate on the pretrained model:

**RLHF** (Ouyang et al., 2022): Train a reward model $R(x, y)$ on human preference data, then optimize the policy $\pi_\theta$ using PPO:

$$\max_\theta \mathbb{E}_{x \sim \mathcal{D}, y \sim \pi_\theta(\cdot|x)} \left[ R(x, y) - \beta \log \frac{\pi_\theta(y|x)}{\pi_{\text{ref}}(y|x)} \right]$$

The KL penalty relative to the reference policy $\pi_{\text{ref}}$ prevents the model from deviating too far from the pretrained distribution.

**DPO** (Rafailov et al., 2023): Bypasses the reward model entirely. Given preference pairs $(y_w, y_l)$ where $y_w$ is preferred:

$$\mathcal{L}_{\text{DPO}} = -\log \sigma\left(\beta \log \frac{\pi_\theta(y_w|x)}{\pi_{\text{ref}}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_{\text{ref}}(y_l|x)}\right)$$

DPO is equivalent to RLHF under the Bradley-Terry preference model but is much simpler to implement (just supervised learning on preference pairs).

## Contrastive Learning: Recent Advances

**GritLM** (Muennighoff et al., 2024): Trains a single model with both generative (CLM) and embedding (contrastive) objectives simultaneously. The key insight: use causal attention for generation and bidirectional attention for embedding within the same model, switching based on a task prefix. This eliminates the need for separate generation and embedding models.

**Matryoshka Representation Learning** (Kusupati et al., 2022): Trains embeddings so that truncated prefixes are also valid (lower-dimensional) embeddings. The contrastive loss is computed at multiple dimensionalities simultaneously:

$$\mathcal{L}_{\text{MRL}} = \sum_{d \in \mathcal{D}} \mathcal{L}_{\text{contrastive}}(f_d(x))$$

where $f_d$ truncates the embedding to the first $d$ dimensions.

## Multi-Token Prediction

Gloeckle et al. (2024) proposed training language models to predict multiple future tokens simultaneously:

$$\mathcal{L}_{\text{multi}} = \sum_{k=1}^{K} \sum_{t=1}^{T} \log P_\theta^{(k)}(x_{t+k} \mid x_{\leq t})$$

where $K$ prediction heads share the same transformer backbone. The key finding: multi-token prediction improves sample efficiency and downstream performance, especially for coding tasks where predicting multiple tokens requires planning. This approach was adopted in Meta's code generation models.

## Open Questions

1. **Objective-capability mapping**: We lack a theory predicting which capabilities emerge from which objectives. Why does CLM at scale produce in-context learning but MLM does not?

2. **Optimal mixing**: For mixture-of-objectives approaches (UL2), optimal mixing ratios are found empirically. Can they be derived from task requirements?

3. **Post-training objectives**: The interaction between pretraining and alignment objectives (SFT, RLHF, DPO) is poorly understood. Does the pretraining objective determine which alignment methods work best?

## Related Topics

- [Masked Self-Attention](/wiki/masked-self-attention) -- the mechanism enabling causal training
- [Encoder-Decoder](/wiki/encoder-decoder) -- architectures for seq2seq objectives
- [Alignment](/wiki/alignment) -- how RLHF and DPO build on pretrained objectives
