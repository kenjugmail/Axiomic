---
title: BPE Tokenization
category: fundamentals
---
<!-- tier:intro -->

# BPE Tokenization

How does a language model go from raw text to the [tokens](/wiki/tokens) it actually processes? The most popular method is called **Byte Pair Encoding (BPE)**, and it's surprisingly simple.

## The Core Idea

BPE starts with the smallest possible pieces (individual characters or bytes) and repeatedly merges the most common pair of adjacent pieces into a new token. It's a bottom-up process of building a vocabulary from scratch.

## A Walkthrough

Suppose our training text contains the words: "low" (5 times), "lower" (2 times), "newest" (6 times), "widest" (3 times).

**Step 1**: Start with characters as tokens:
```
l o w      (frequency: 5)
l o w e r  (frequency: 2)
n e w e s t (frequency: 6)
w i d e s t (frequency: 3)
```

**Step 2**: Count pairs. The most frequent adjacent pair is "e s" (appears 9 times: 6 from "newest" + 3 from "widest"). Merge it into a new token "es":
```
l o w      (5)
l o w e r  (2)
n e w es t (6)
w i d es t (3)
```

**Step 3**: Now the most frequent pair is "es t" (9 times). Merge into "est":
```
l o w      (5)
l o w e r  (2)
n e w est  (6)
w i d est  (3)
```

**Step 4**: Continue merging. "l o" appears 7 times, merge to "lo":
```
lo w       (5)
lo w e r   (2)
n e w est  (6)
w i d est  (3)
```

And so on, until we reach our desired vocabulary size (typically 32K-100K tokens).

## Why BPE Works

BPE naturally learns a vocabulary that balances common words (which become single tokens) and rare words (which get split into known subword pieces). The word "unbelievably" might become ["un", "believ", "ably"] -- each piece is meaningful and reusable.

## Variants

- **WordPiece** (used in BERT): Similar to BPE but selects merges based on which pair maximizes the likelihood of the training data, not just frequency. Subword pieces are prefixed with "##" when they continue a word (e.g., "play ##ing").

- **SentencePiece** (used in T5, LLaMA): Treats the input as a raw stream of characters (including spaces) rather than pre-tokenized words. Spaces are replaced with a special character (usually "\_"). This makes it language-agnostic and handles any language without needing word boundary rules.

- **Byte-level BPE** (used in GPT-2, GPT-4): Instead of starting from characters, starts from raw bytes (256 base tokens). This means any text in any encoding can be tokenized -- nothing is ever "unknown."

## Related Topics

- [Tokens](/wiki/tokens) -- what tokens are and why we need them
- [Embeddings](/wiki/embeddings) -- how tokens become vectors
- [Training Objectives](/wiki/training-objectives) -- how the model learns from tokenized text

<!-- tier:undergrad -->

# BPE Tokenization

Byte Pair Encoding is a data compression algorithm (Gage, 1994) adapted for NLP by Sennrich et al. (2016). It builds a subword vocabulary by iteratively merging the most frequent adjacent pairs.

## Algorithm

**Training (vocabulary construction):**

1. Initialize vocabulary $\mathcal{V}$ with all individual characters (or bytes) in the training corpus
2. Represent each word as a sequence of characters plus a special end-of-word token
3. Count the frequency of all adjacent symbol pairs in the corpus
4. Merge the most frequent pair $(a, b) \to ab$, add $ab$ to $\mathcal{V}$
5. Repeat steps 3-4 for $K$ merges (where $K = |\mathcal{V}_{\text{final}}| - |\mathcal{V}_{\text{initial}}|$)

**Encoding (tokenization of new text):**

Apply the learned merges in the same order they were learned. For each word, start with characters and greedily apply merges.

## Complexity Analysis

- **Training**: $O(K \times N)$ where $K$ is number of merges and $N$ is corpus size. In practice, efficient implementations use priority queues and update counts incrementally.
- **Encoding**: $O(n \times K)$ per word of length $n$, but in practice $O(n \log n)$ with efficient data structures. The regex-based pre-tokenization in GPT-2 makes encoding fast.

## WordPiece Algorithm

WordPiece (Schuster & Nakajima, 2012) differs from BPE in the merge criterion:

**BPE**: Merge the pair $(a, b)$ with the highest frequency $\text{count}(a, b)$.

**WordPiece**: Merge the pair that maximizes the likelihood of the training data:

$$\text{score}(a, b) = \frac{\text{count}(ab)}{\text{count}(a) \times \text{count}(b)}$$

This is equivalent to choosing the pair whose merge maximizes the mutual information. In practice, WordPiece tends to produce slightly different vocabularies (favoring merges of rare pieces that co-occur frequently over merges of common pieces).

WordPiece uses "##" prefixes for continuation tokens:
```
"tokenization" -> ["token", "##ization"]
```

## SentencePiece

SentencePiece (Kudo & Richardson, 2018) makes two key changes:

1. **No pre-tokenization**: Treats input as a raw byte stream, replacing spaces with "\_" (U+2581). This eliminates language-specific preprocessing.
2. **Unigram model option**: Besides BPE, SentencePiece supports a **unigram language model** tokenizer.

**Unigram algorithm**: Start with a large vocabulary and iteratively *remove* tokens that least reduce the corpus likelihood:

$$\mathcal{L} = \sum_{s=1}^{|\mathcal{D}|} \log P(\mathbf{x}^{(s)}) = \sum_{s=1}^{|\mathcal{D}|} \log \sum_{\mathbf{t} \in \mathcal{S}(\mathbf{x}^{(s)})} \prod_{i=1}^{|\mathbf{t}|} P(t_i)$$

where $\mathcal{S}(\mathbf{x})$ is the set of all valid tokenizations of $\mathbf{x}$. This is solved via the Viterbi algorithm to find the highest-probability tokenization.

## Byte-Level BPE

GPT-2 introduced byte-level BPE:

- Base vocabulary: 256 byte values (UTF-8)
- Every text is representable (no `[UNK]` tokens)
- Merges operate on byte sequences, not characters

```python
# Simplified BPE training
from collections import Counter

def get_pair_counts(vocab):
    pairs = Counter()
    for word, freq in vocab.items():
        symbols = word.split()
        for i in range(len(symbols) - 1):
            pairs[(symbols[i], symbols[i + 1])] += freq
    return pairs

def merge_pair(pair, vocab):
    merged = {}
    bigram = ' '.join(pair)
    replacement = ''.join(pair)
    for word, freq in vocab.items():
        new_word = word.replace(bigram, replacement)
        merged[new_word] = freq
    return merged

# Example
vocab = {'l o w </w>': 5, 'l o w e r </w>': 2,
         'n e w e s t </w>': 6, 'w i d e s t </w>': 3}

num_merges = 10
for i in range(num_merges):
    pairs = get_pair_counts(vocab)
    if not pairs:
        break
    best = max(pairs, key=pairs.get)
    print(f"Merge {i+1}: {best} (count: {pairs[best]})")
    vocab = merge_pair(best, vocab)
```

## Tokenizer Configuration in Practice

| Model | Tokenizer | Vocab Size | Base Unit |
|---|---|---|---|
| BERT | WordPiece | 30,522 | Characters |
| GPT-2 | Byte-level BPE | 50,257 | Bytes |
| T5 | SentencePiece (Unigram) | 32,000 | Characters |
| LLaMA | SentencePiece (BPE) | 32,000 | Bytes |
| GPT-4 | Byte-level BPE | ~100,000 | Bytes |

## Related Topics

- [Tokens](/wiki/tokens) -- the concept of tokens and vocabulary
- [Embeddings](/wiki/embeddings) -- how token IDs map to vectors
- [Training Objectives](/wiki/training-objectives) -- how models learn from tokenized sequences

<!-- tier:grad -->

# BPE Tokenization

Tokenization is increasingly recognized not just as preprocessing but as a modeling decision with deep impacts on model behavior, multilinguality, and efficiency.

## Optimal Tokenization Theory

Zouhar et al. (2023, "Tokenization and the Noiseless Channel") formalized the connection between tokenization and compression. The key result: the R\'enyi efficiency of a tokenizer (how close it is to optimal compression) correlates with downstream model performance.

Define the **R\'enyi efficiency** of order $\alpha$ for tokenizer $T$ on corpus $\mathcal{D}$:

$$\eta_\alpha(T) = \frac{H_\alpha(T(\mathcal{D}))}{\log |\mathcal{V}|}$$

where $H_\alpha$ is the R\'enyi entropy of the token distribution. Optimal tokenizers maximize R\'enyi efficiency, producing near-uniform token distributions. BPE approximates this but is not optimal -- it uses a greedy algorithm that can get stuck in local optima.

## BPE Determinism and Tokenization Ambiguity

Standard BPE applies merges in a fixed order, producing a unique tokenization. However, the same string can be segmented in multiple valid ways using the same vocabulary. The **unigram model** explicitly models this:

$$P(\mathbf{x}) = \sum_{\mathbf{t} \in \mathcal{S}(\mathbf{x})} \prod_i P(t_i)$$

Kudo (2018) showed that sampling from this distribution during training (subword regularization) improves robustness. **BPE-dropout** (Provilkov et al., 2020) achieves a similar effect by randomly dropping merges during tokenization with probability $p$:

- At each step, with probability $p$, skip the merge
- This produces varied tokenizations of the same text
- Acts as a data augmentation technique

BPE-dropout with $p=0.1$ consistently improves translation quality by 0.5-1.0 BLEU across language pairs.

## Vocabulary Construction Pitfalls

**Tokenizer fertility across languages**: Petrov et al. (2023) measured the "tokenizer tax" -- how many more tokens languages require compared to English:

| Language | GPT-4 fertility ratio (vs English) |
|---|---|
| English | 1.0x |
| German | 1.3x |
| Chinese | 1.6x |
| Japanese | 1.8x |
| Hindi | 3.2x |
| Burmese | 8.5x |

This means non-English users pay more (literally, for API-priced models) and get less context. Solutions include:

- **Balanced training corpora**: Train the tokenizer on a language-balanced corpus (not the model training corpus, which may be English-heavy)
- **Language-specific vocabularies**: Use separate or extended vocabularies for specific languages
- **Byte-level fallback**: Byte-level BPE ensures coverage but doesn't solve the efficiency problem

**Digit tokenization**: Standard BPE produces inconsistent tokenizations of numbers ("1234" might become ["12", "34"] or ["1", "234"]), making arithmetic difficult. Approaches:

- Force individual digit tokenization (each digit is its own token)
- Use special number tokenization schemes (Nogueira et al., 2021)
- Train on formatted numbers with consistent digit boundaries

## Fast BPE: Algorithm Improvements

The naive BPE training algorithm is $O(K \times N)$ where $K$ is the number of merges and $N$ is corpus size. Several improvements:

**Byte-level BPE with regex pre-tokenization** (GPT-2): Pre-split text using regex patterns (e.g., separate letters, digits, and punctuation). BPE merges only happen within pre-tokenized chunks. This dramatically speeds training and prevents cross-word merges like "the\_" becoming a single token.

**MinBPE** (Karpathy, 2024): Clean reference implementation showing the algorithm can be implemented in ~100 lines of Python. The key insight is that most of the complexity in production tokenizers is engineering optimization, not algorithmic.

**Parallel BPE**: Distribute pair counting across shards of the corpus, merge counts, and apply the top merge globally. Near-linear speedup with the number of shards.

## Post-BPE: Learned and Adaptive Tokenization

**CHARFORMER** (Tay et al., 2022): Replaces the discrete tokenization step with a differentiable soft tokenization layer. Characters are grouped using learned soft boundaries, and the groupings are trained end-to-end with the model.

**MegaByte** (Yu et al., 2023): A hierarchical architecture that processes raw bytes using a large model for byte-group-level predictions and a small model for within-group predictions. Achieves competitive performance with subword models while eliminating the tokenizer.

**Dynamic tokenization**: Godey et al. (2024) proposed adapting the tokenization based on the input domain, using different merge tables for code, natural language, and structured data within the same model. This requires the model to handle variable tokenization, typically via byte-level fallback.

## Tokenization and Scaling Laws

Hoffmann et al. (2022, Chinchilla) derived scaling laws in terms of tokens. But "token" is tokenizer-dependent -- a model with a 100K vocabulary tokenizes more efficiently (fewer tokens per document) than one with a 32K vocabulary. This means:

- Scaling law comparisons across models with different tokenizers require normalization (e.g., by bytes rather than tokens)
- Increasing vocabulary size can be a form of "free" compute scaling: the same text takes fewer tokens, so the effective context is longer and training is more efficient per byte
- The optimal vocabulary size likely scales with model size, though the exact relationship is not well-characterized

## Related Topics

- [Tokens](/wiki/tokens) -- the concept of tokenization
- [Embeddings](/wiki/embeddings) -- how the vocabulary maps to continuous representations
- [Scaling Laws](/wiki/scaling-laws) -- how vocabulary size interacts with compute-optimal training
