---
title: Tokens
category: fundamentals
---
<!-- tier:intro -->

# Tokens

Before a language model can read your text, it needs to break it into smaller pieces called **tokens**. Think of tokens as the "atoms" of language for an AI — the smallest units it works with.

## What Is a Token?

A token is a chunk of text. It might be a whole word, part of a word, or even a single character. For example:

- The word "hello" might be one token
- The word "unbelievable" might be split into "un", "believ", "able" — three tokens
- A space character is often its own token

The exact way text gets split into tokens depends on the **tokenizer** — the algorithm that does the splitting.

## Why Not Just Use Whole Words?

You might wonder: why not just treat each word as a token? There are a few problems:

1. **Vocabulary size explodes.** There are millions of possible words (including typos, names, technical terms). A model can't have a separate entry for each one.
2. **Unknown words.** What happens when the model sees a word it's never seen before? With subword tokens, it can still represent it by combining known pieces.
3. **Morphology.** Words like "running", "runs", "ran" share a root. Subword tokenization captures this naturally.

## How Many Tokens?

A rough rule of thumb for English text: **1 token ≈ 4 characters** or about **0.75 words**. So a 1,000-word essay is roughly 1,300 tokens.

Modern language models typically have vocabulary sizes between 32,000 and 100,000 tokens.

:::lab[tokenizer-playground-lab]

## Related Topics

- [BPE Tokenization](/wiki/bpe-tokenization) — the most common tokenization algorithm
- [Embeddings](/wiki/embeddings) — how tokens get converted to numbers

<!-- tier:undergrad -->

# Tokens

Tokenization is the first step in the NLP pipeline that converts raw text into a discrete sequence of symbols from a fixed vocabulary $\mathcal{V}$. This section covers the formal framework and practical considerations.

## Formal Definition

A **tokenizer** is a function $T: \Sigma^* \to \mathcal{V}^*$ that maps a string over an alphabet $\Sigma$ to a sequence of tokens from a vocabulary $\mathcal{V}$, where $|\mathcal{V}|$ is typically between $2^{15}$ and $2^{17}$ (32K–128K tokens).

The tokenizer must satisfy:
- **Completeness**: every string in $\Sigma^*$ has a tokenization
- **Determinism**: the same input always produces the same output
- **Invertibility** (usually): a detokenization function $T^{-1}$ recovers the original string

## Vocabulary Size Trade-offs

The choice of $|\mathcal{V}|$ involves a fundamental trade-off:

| Small vocabulary (e.g., character-level) | Large vocabulary (e.g., word-level) |
|---|---|
| Short vocab, long sequences | Long vocab, short sequences |
| Better generalization to rare words | More semantic meaning per token |
| Higher computational cost (longer sequences) | Larger embedding matrix |

Modern subword tokenizers sit in the middle, with $|\mathcal{V}| \approx 32\text{K}$ to $100\text{K}$.

## The Embedding Lookup

Once text is tokenized into token IDs $[t_1, t_2, \ldots, t_n]$ where $t_i \in \{0, 1, \ldots, |\mathcal{V}|-1\}$, each token ID is mapped to a dense vector via an embedding matrix:

$$\mathbf{E} \in \mathbb{R}^{|\mathcal{V}| \times d}$$

where $d$ is the embedding dimension (e.g., 768, 1024, 4096). Token $t_i$ gets mapped to row $\mathbf{E}[t_i] \in \mathbb{R}^d$.

## Token Distribution

In practice, the distribution of tokens follows a power law (Zipf's law). The most frequent tokens (common words like "the", "is") appear vastly more often than rare tokens. This has implications for:

- **Training efficiency**: common tokens get much more gradient signal
- **Embedding quality**: rare token embeddings are less well-trained
- **Tokenization algorithms**: methods like BPE are designed to handle this distribution

## Code Example

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("gpt2")
text = "The transformer architecture revolutionized NLP."
tokens = tokenizer.encode(text)
decoded = [tokenizer.decode([t]) for t in tokens]

print(f"Token IDs: {tokens}")
print(f"Tokens: {decoded}")
# Token IDs: [464, 47385, 10959, 18305, 1143, 28104, 11, 399]
# Tokens: ['The', ' transformer', ' architecture', ' revolution', 'ized', ' NLP', '.']
```

## Related Topics

- [BPE Tokenization](/wiki/bpe-tokenization) — how vocabularies are constructed
- [Embeddings](/wiki/embeddings) — converting token IDs to vectors
- [Positional Encoding](/wiki/positional-encoding) — adding position information to token embeddings

<!-- tier:grad -->

# Tokens

Tokenization sits at the interface between raw text and model computation. While often treated as a preprocessing step, recent research reveals that tokenization choices have profound effects on model behavior, efficiency, and capabilities.

## The Tokenization–Compression Connection

The information-theoretic view: a tokenizer is a **compressor**. BPE-style tokenizers approximate the optimal compression of the training corpus. The vocabulary $\mathcal{V}$ is chosen to minimize the expected number of tokens per document:

$$\mathcal{V}^* = \arg\min_{|\mathcal{V}| = K} \mathbb{E}_{x \sim \mathcal{D}} [|T_\mathcal{V}(x)|]$$

This is closely related to the minimum description length (MDL) principle. Zouhar et al. (2023) showed that tokenizers closer to optimal compression yield better downstream performance, suggesting the connection is not just theoretical.

## Tokenization Pathologies

Several known issues arise from subword tokenization:

**Arithmetic failure.** Tokenizers split numbers unpredictably. "12345" might become ["123", "45"] or ["1", "234", "5"]. This makes arithmetic operations difficult because the model must learn digit-level operations over inconsistent token boundaries. Nogueira et al. (2021) showed that formatting numbers with explicit digit separators significantly improves arithmetic performance.

**Multilingual inequity.** BPE vocabularies trained on English-heavy corpora allocate more tokens to English text. The same concept expressed in a non-Latin script may require 3–5× more tokens, increasing cost and reducing effective context length. Petrov et al. (2023) documented this "tokenizer tax" across languages.

**Glitch tokens.** Some tokens in the vocabulary correspond to strings that never appeared in the training data (artifacts of BPE merges on unusual data). These "glitch tokens" have poorly-trained embeddings and can cause erratic model behavior (Rumbelow & Watkins, 2023).

## Alternatives to Subword Tokenization

Recent work explores moving beyond fixed-vocabulary subword tokenization:

- **Byte-level models** (ByT5, MegaByte): operate directly on UTF-8 bytes, eliminating the tokenizer entirely. Trade-off: sequences are ~4× longer, but byte-level models show superior robustness to noise and typos.
- **Character-level with local attention**: Tay et al. (2022) showed that character-level models with efficient attention can match subword models with better out-of-distribution generalization.
- **Learned tokenization**: CHARFORMER (Tay et al., 2022) uses a soft tokenization layer that learns to group characters during training.

## Tokenizer Fertility and Model Capacity

**Fertility** — the average number of tokens produced per word — varies dramatically across languages and domains. For GPT-4's tokenizer:

| Language | Avg. tokens per word |
|---|---|
| English | 1.3 |
| Chinese | 2.1 |
| Thai | 4.2 |
| Amharic | 6.1 |

This fertility difference means models effectively have less "thinking capacity" per concept for high-fertility languages, since the context window is measured in tokens, not words.

## Related Topics

- [BPE Tokenization](/wiki/bpe-tokenization) — the dominant tokenization algorithm and its variants
- [Embeddings](/wiki/embeddings) — from discrete tokens to continuous representations
- [Scaling Laws](/wiki/scaling-laws) — how vocabulary size interacts with compute-optimal training
