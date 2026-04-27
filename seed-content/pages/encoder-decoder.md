---
title: Encoder-Decoder Architecture
category: architecture
---
<!-- tier:intro -->

# Encoder-Decoder Architecture

When the transformer was first invented, it had two halves: an **encoder** and a **decoder**. Since then, researchers have discovered you can also build powerful models using just one half. Let's understand all three variants and when each one shines.

## The Original: Encoder-Decoder

The original transformer (from the 2017 "Attention Is All You Need" paper) was designed for translation. It has two separate stacks of [transformer blocks](/wiki/transformer-block):

- **Encoder**: Reads the entire input (e.g., a French sentence) and builds a rich understanding of it. Every token can see every other token -- there's no restriction on what attends to what.
- **Decoder**: Generates the output one token at a time (e.g., the English translation). It can look at everything the encoder produced, but it can only see the output tokens generated *so far* (not future ones).

The decoder uses [cross-attention](/wiki/cross-attention) to peek at the encoder's output. This lets each generated word "consult" the full input sentence.

**Examples**: T5, BART, the original transformer, mBART

**Best for**: Tasks where you have a clear input and need to produce a different output -- translation, summarization, question answering.

## Encoder-Only

What if you just want to *understand* text, not generate it? Then you only need the encoder.

An encoder-only model reads the entire input at once, with every token attending to every other token (bidirectional attention). It produces a rich representation of the input that can be used for classification, named entity recognition, similarity matching, and other understanding tasks.

**Examples**: BERT, RoBERTa, ALBERT, DeBERTa

**Best for**: Classification, sentiment analysis, search/retrieval, named entity recognition -- tasks where you need to understand the input but don't need to generate new text.

## Decoder-Only

This is the architecture behind ChatGPT and most modern large language models. A decoder-only model generates text left-to-right, one token at a time. Each token can only see the tokens before it (causal/[masked attention](/wiki/masked-self-attention)).

Despite only looking backward, decoder-only models turn out to be extremely powerful. They can handle almost any task by framing it as "complete this text." Want translation? Start with "Translate this to English:" followed by the French text. Want classification? Ask the model and let it generate the answer.

**Examples**: GPT series, LLaMA, Claude, Gemini, Mistral

**Best for**: Text generation, chatbots, general-purpose AI, reasoning -- essentially anything, especially at scale.

## Why Did Decoder-Only Win?

Decoder-only models dominate today for several reasons:

1. **Simplicity**: One architecture, one [training objective](/wiki/training-objectives) (predict the next token).
2. **Scaling**: Decoder-only models scale more predictably. One architecture means one set of hyperparameters to tune.
3. **Versatility**: Any task can be framed as text completion through prompting.
4. **Efficiency**: No need for a separate encoder pass -- the model processes everything in one forward pass.

## Related Topics

- [Transformer Block](/wiki/transformer-block) -- the building block used in all three architectures
- [Cross-Attention](/wiki/cross-attention) -- how the decoder attends to the encoder
- [Masked Self-Attention](/wiki/masked-self-attention) -- the causal masking used in decoders

<!-- tier:undergrad -->

# Encoder-Decoder Architecture

The three transformer architectural paradigms -- encoder-only, decoder-only, and encoder-decoder -- differ in their attention masking patterns and how they process input/output sequences.

## Attention Masking Patterns

The fundamental distinction between architectures is which tokens can attend to which:

**Encoder (Bidirectional)**: Full attention -- every token attends to every other token.

$$M_{ij} = 0 \quad \forall \, i, j \in \{1, \ldots, n\}$$

**Decoder (Causal)**: Each token can only attend to itself and previous tokens.

$$M_{ij} = \begin{cases} 0 & \text{if } j \leq i \\ -\infty & \text{if } j > i \end{cases}$$

**Cross-attention**: Decoder tokens attend to all encoder tokens (no masking on the encoder side).

## Encoder-Only Architecture (BERT-style)

The encoder processes input $\mathbf{X} = [x_1, \ldots, x_n]$ with bidirectional self-attention:

$$\mathbf{H}^{(l)} = \text{TransformerBlock}(\mathbf{H}^{(l-1)}) \quad \text{for } l = 1, \ldots, L$$

where $\mathbf{H}^{(0)} = \text{Embed}(\mathbf{X})$. The output $\mathbf{H}^{(L)} \in \mathbb{R}^{n \times d}$ provides contextualized representations.

Training typically uses [masked language modeling (MLM)](/wiki/training-objectives): randomly mask 15% of tokens and predict them from context.

A special `[CLS]` token is prepended, and its final representation $\mathbf{h}_{\text{CLS}}^{(L)}$ serves as a sequence-level representation for classification tasks.

## Decoder-Only Architecture (GPT-style)

The decoder processes the sequence autoregressively with [causal masking](/wiki/masked-self-attention):

$$P(x_1, \ldots, x_n) = \prod_{t=1}^{n} P(x_t \mid x_1, \ldots, x_{t-1})$$

Each $P(x_t \mid x_{<t})$ is computed by applying transformer blocks with causal attention masks, then projecting the final hidden state through a linear layer + softmax:

$$P(x_t = v \mid x_{<t}) = \text{softmax}(\mathbf{h}_t^{(L)} W_{\text{vocab}})_v$$

Training uses [causal language modeling (CLM)](/wiki/training-objectives): maximize $\sum_t \log P(x_t \mid x_{<t})$.

## Encoder-Decoder Architecture (T5-style)

The full encoder-decoder has three types of attention:

1. **Encoder self-attention** (bidirectional) -- processes the input
2. **Decoder self-attention** (causal) -- processes generated tokens so far
3. **[Cross-attention](/wiki/cross-attention)** -- decoder attends to encoder outputs

Each decoder block has three sub-layers:

$$\mathbf{Y}' = \text{LayerNorm}(\mathbf{Y} + \text{CausalSelfAttn}(\mathbf{Y}))$$
$$\mathbf{Y}'' = \text{LayerNorm}(\mathbf{Y}' + \text{CrossAttn}(\mathbf{Y}', \mathbf{H}_{\text{enc}}))$$
$$\mathbf{Y}''' = \text{LayerNorm}(\mathbf{Y}'' + \text{FFN}(\mathbf{Y}''))$$

The cross-attention keys and values come from the encoder output $\mathbf{H}_{\text{enc}}$, while queries come from the decoder.

## Comparison

| Feature | Encoder-only | Decoder-only | Encoder-Decoder |
|---|---|---|---|
| Attention | Bidirectional | Causal | Both |
| Training | MLM | CLM | Seq2Seq / Span corruption |
| Input/Output | Same sequence | Same sequence | Separate sequences |
| Params (for same FLOPs) | All in encoder | All in decoder | Split between two |
| Generation | Not native | Natural | Natural |
| Examples | BERT, RoBERTa | GPT, LLaMA | T5, BART |

## PyTorch Sketch

```python
import torch
import torch.nn as nn

class EncoderDecoderTransformer(nn.Module):
    def __init__(self, d_model, n_heads, n_enc_layers, n_dec_layers, d_ff, vocab_size):
        super().__init__()
        self.embed = nn.Embedding(vocab_size, d_model)
        self.encoder = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(d_model, n_heads, d_ff, batch_first=True),
            num_layers=n_enc_layers
        )
        self.decoder = nn.TransformerDecoder(
            nn.TransformerDecoderLayer(d_model, n_heads, d_ff, batch_first=True),
            num_layers=n_dec_layers
        )
        self.output_proj = nn.Linear(d_model, vocab_size)

    def forward(self, src_ids, tgt_ids, tgt_mask):
        # Encode
        enc_out = self.encoder(self.embed(src_ids))
        # Decode with cross-attention to encoder
        dec_out = self.decoder(self.embed(tgt_ids), enc_out, tgt_mask=tgt_mask)
        return self.output_proj(dec_out)
```

## Related Topics

- [Cross-Attention](/wiki/cross-attention) -- the mechanism linking encoder and decoder
- [Masked Self-Attention](/wiki/masked-self-attention) -- causal masking in decoder blocks
- [Training Objectives](/wiki/training-objectives) -- MLM, CLM, and seq2seq objectives

<!-- tier:grad -->

# Encoder-Decoder Architecture

The choice between encoder-only, decoder-only, and encoder-decoder architectures has profound implications for capabilities, scaling behavior, and inductive biases.

## Theoretical Equivalence and Practical Differences

Theoretically, any transformer variant can approximate any function given sufficient capacity. In practice, the architectural choice imposes inductive biases:

**Bidirectional vs. causal attention**: Wang et al. (2022, "What Language Model Architecture and Pretraining Objective Work Best for Zero-Shot Generalization?") systematically compared architectures. Key finding: for a fixed compute budget, causal decoder-only models excel at zero-shot generalization, while encoder-decoder models are better for fine-tuned performance (they get roughly 2x the "reasoning tokens" for a given input).

**Effective compute allocation**: An encoder-decoder model with $L$ layers each splits into $L/2$ encoder + $L/2$ decoder layers. The encoder processes the input once, and those representations are reused across all decoder time steps. For tasks with long inputs and short outputs, this is more compute-efficient than a decoder-only model that must reprocess the input representation at each step (though KV caching mitigates this).

## The Prefix LM Compromise

**Prefix LMs** (UniLM, U-PaLM) use a decoder-only architecture but with a twist: the input prefix uses bidirectional attention (like an encoder), and the generation portion uses causal attention. This is implemented by modifying the attention mask:

$$M_{ij} = \begin{cases} 0 & \text{if } j \leq |\text{prefix}| \text{ (bidirectional over prefix)} \\ 0 & \text{if } j \leq i \text{ and } i > |\text{prefix}| \text{ (causal for generation)} \\ -\infty & \text{otherwise} \end{cases}$$

Tay et al. (2022, "UL2") showed that mixing causal LM, prefix LM, and span corruption objectives during pretraining yields a single model competitive with specialized architectures on all task types.

## Why Decoder-Only Dominates at Scale

Several factors explain the convergence toward decoder-only architectures:

1. **Scaling simplicity**: One architecture with one objective (next-token prediction) means one set of scaling laws. Hoffmann et al. (2022, Chinchilla) derived compute-optimal training recipes for decoder-only models; equivalent analysis for encoder-decoder models is more complex (separate depth/width for encoder and decoder).

2. **In-context learning**: Brown et al. (2020, GPT-3) showed that large decoder-only models can perform tasks via prompting without any fine-tuning. This emergent capability is less naturally exploited by encoder-decoder models, which assume a structured input-output split.

3. **KV cache efficiency**: During generation, decoder-only models cache key-value pairs from all previous tokens. Encoder-decoder models must cache both the encoder representations and the decoder KV cache, complicating the inference system.

4. **Training data utilization**: CLM provides a training signal from every token in the sequence. MLM (used for encoders) only provides signal from the ~15% of masked tokens. For a fixed number of training tokens, CLM extracts more gradient updates.

## Encoder-Decoder Renaissance

Despite decoder-only dominance, encoder-decoder models retain advantages in specific settings:

**Efficient long-input processing**: Encoder-decoder models process the input once, and decoder cross-attention reuses encoder outputs. For tasks like summarization of long documents, this is more efficient than re-attending to the entire input at each decoder step. This advantage grows with input length.

**Structured generation**: Tasks with clear input-output separation (translation, ASR, code from specification) naturally map to the encoder-decoder framework. Whisper (Radford et al., 2023) uses an encoder-decoder for speech recognition with strong results.

**Multi-turn efficiency**: Gemini 1.5 uses an encoder-decoder-like architecture internally for processing long contexts efficiently, though the external interface is that of a single-stream model.

## Hybrid and Novel Architectures

**RETRO** (Borgeaud et al., 2022): Augments a decoder-only model with an encoder that processes retrieved passages. Cross-attention layers are interleaved every $k$ decoder layers, creating a hybrid that uses encoder-decoder principles for retrieval augmentation.

**Perceiver** (Jaegle et al., 2021): Uses cross-attention between a small set of learned latent tokens and a large input, then processes latents with self-attention. This decouples compute cost from input length.

**Block-recurrent Transformer** (Hutchins et al., 2022): Uses cross-attention to pass state between fixed-length blocks, effectively creating a recurrent encoder-decoder at the block level for processing arbitrarily long sequences.

## Architectural Ablation Results

Raffel et al. (2020, T5 paper) conducted the most comprehensive architectural comparison:

| Architecture | GLUE | SQuAD | Translation | Summarization |
|---|---|---|---|---|
| Encoder-Decoder | **Best** | **Best** | **Best** | **Best** |
| Decoder-only (causal) | Worst | Competitive | Competitive | Worst |
| Prefix LM | Middle | Competitive | Competitive | Middle |

However, these results are at T5 scale (11B parameters). At larger scales (175B+), decoder-only models close the gap through in-context learning, and the simplicity of training a single-objective model outweighs the architectural advantage.

## Related Topics

- [Cross-Attention](/wiki/cross-attention) -- the mechanism connecting encoder and decoder
- [Training Objectives](/wiki/training-objectives) -- how different architectures are trained
- [Scaling Laws](/wiki/scaling-laws) -- how architecture interacts with scaling behavior
