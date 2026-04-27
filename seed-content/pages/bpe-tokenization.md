---
title: Byte Pair Encoding (BPE) Tokenization
category: fundamentals
---
<!-- tier:intro -->
# Byte Pair Encoding (BPE) Tokenization

Before a language model can read your text, it needs to chop it up into pieces it can understand. These pieces are called **tokens**, and the process of creating them is called **tokenization**. Byte Pair Encoding, or BPE, is the most widely used tokenization method in modern language models.

## Why Not Just Use Words or Letters?

Using whole words seems natural, but it has a fatal flaw: what happens when the model encounters a word it has never seen before? Names, slang, technical jargon, typos -- the real world is full of words that would not be in any fixed dictionary. You would need an impossibly large vocabulary.

Using individual letters solves the unknown-word problem, but creates a different one. The sentence "The cat sat" becomes 11 tokens (including spaces). Transformers need to relate every token to every other token, and that cost grows with the square of the sequence length. Longer sequences mean much slower processing.

BPE finds a sweet spot: it breaks text into **subword** pieces. Common words like "the" stay as single tokens, while rarer words get split into recognizable chunks. The word "tokenization" might become ["token", "ization"]. The word "unhappiness" might become ["un", "happiness"]. This keeps vocabularies manageable (typically 32,000 to 100,000 tokens) while still being able to represent any text.

## How BPE Works

The idea is surprisingly simple. Start with every individual character as its own token. Then, repeatedly find the most common pair of adjacent tokens in your training text and merge them into a new single token.

1. Start: every character is a token. Your vocabulary is just the alphabet plus punctuation.
2. Scan the training text and count every pair of adjacent tokens.
3. The most frequent pair -- say "t" and "h" -- gets merged into a new token "th".
4. Replace all occurrences of that pair in the text with the new merged token.
5. Repeat from step 2, thousands of times, until you reach your target vocabulary size.

Early merges capture very common combinations ("th", "he", "in"). Later merges capture full words ("the", "and") or common subwords ("tion", "ing"). The result is a vocabulary that efficiently represents the statistical structure of the language.

## Why BPE Matters

BPE is used by GPT-2, GPT-3, GPT-4, LLaMA, and most other major language models. The exact tokenization affects everything from how much text fits in the model's context window to how well the model handles different languages. English text typically averages about 1.3 tokens per word, but languages with different scripts or morphology can require significantly more tokens per word -- a real source of inequity in multilingual AI.

When you hear that a model has a "128K context window," that means 128,000 tokens, not characters or words. Understanding tokenization is essential to understanding what these numbers actually mean.

<!-- tier:undergrad -->
# Byte Pair Encoding (BPE) Tokenization

## Algorithm

BPE (Sennrich et al., 2016) is a subword segmentation algorithm adapted from a data compression technique (Gage, 1994). Given a training corpus and a target vocabulary size $V$, BPE proceeds as follows:

1. **Initialize** the vocabulary with all individual characters (or bytes) present in the corpus.
2. **Represent** each word as a sequence of characters plus a special end-of-word symbol.
3. **Iterate**: count all adjacent symbol pairs across the corpus, find the most frequent pair $(a, b)$, create a new symbol $ab$, and replace every occurrence of the pair. Record the merge rule $a, b \to ab$.
4. **Terminate** when $|V|$ reaches the target size.

At inference time, tokenization applies the learned merge rules greedily in the order they were learned.

## Formal Description

Let $\mathcal{C}$ be the corpus represented as a multiset of words, each word $w$ being a sequence of symbols $w = (s_1, s_2, \ldots, s_n)$. At each step, we compute:

$$
(a^*, b^*) = \arg\max_{(a,b)} \sum_{w \in \mathcal{C}} \text{count}(w) \cdot \text{pairs}(w, a, b)
$$

where $\text{pairs}(w, a, b)$ counts the number of times $(a, b)$ appears as adjacent symbols in $w$, and $\text{count}(w)$ is the word frequency.

## Implementation

Here is a minimal BPE training implementation in Python:

```python
import re
from collections import Counter, defaultdict

def get_stats(vocab):
    """Count frequency of adjacent symbol pairs."""
    pairs = defaultdict(int)
    for word, freq in vocab.items():
        symbols = word.split()
        for i in range(len(symbols) - 1):
            pairs[(symbols[i], symbols[i + 1])] += freq
    return pairs

def merge_vocab(pair, vocab):
    """Merge all occurrences of a symbol pair."""
    bigram = re.escape(' '.join(pair))
    pattern = re.compile(r'(?<!\S)' + bigram + r'(?!\S)')
    new_vocab = {}
    for word, freq in vocab.items():
        new_word = pattern.sub(''.join(pair), word)
        new_vocab[new_word] = freq
    return new_vocab

def train_bpe(corpus_words, num_merges):
    """Train BPE on a word frequency dictionary."""
    # Initialize: split each word into characters + end-of-word marker
    vocab = {}
    for word, freq in corpus_words.items():
        symbols = ' '.join(list(word)) + ' </w>'
        vocab[symbols] = freq

    merges = []
    for i in range(num_merges):
        pairs = get_stats(vocab)
        if not pairs:
            break
        best = max(pairs, key=pairs.get)
        vocab = merge_vocab(best, vocab)
        merges.append(best)

    return merges, vocab
```

## Variants

**Byte-level BPE** (Radford et al., 2019, GPT-2) operates on raw bytes (0--255) rather than Unicode characters. This guarantees that any text can be encoded without unknown tokens, since every byte sequence is valid input. The base vocabulary is exactly 256 byte tokens.

**SentencePiece** (Kudo & Richardson, 2018) treats the input as a raw character stream (no pre-tokenization into words), which makes it language-agnostic. It supports both BPE and unigram language model tokenization.

**WordPiece** (Schuster & Nakajima, 2012), used in BERT, is similar to BPE but selects merges based on likelihood improvement under a language model rather than raw frequency.

## Tokenization in PyTorch with HuggingFace

```python
from transformers import AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("gpt2")
tokens = tokenizer.encode("Tokenization is fundamental.")
print(tokenizer.convert_ids_to_tokens(tokens))
# ['Token', 'ization', 'Ġis', 'Ġfundamental', '.']
```

<!-- tier:grad -->
# Byte Pair Encoding (BPE) Tokenization

## Theoretical Foundations

BPE can be understood as a greedy compression algorithm that approximates the minimum description length (MDL) principle. At each step, the merge that maximally reduces the total encoded length of the corpus is selected (since it replaces the most frequent pair). Formally, if we denote the corpus length in symbols as $L$ and the most frequent pair has count $c$, the new corpus length is approximately $L - c$, and the vocabulary grows by one.

The connection to information theory is instructive: a BPE vocabulary with $V$ tokens on a corpus induces a code where common substrings receive shorter codes (single tokens) and rare substrings require multiple tokens. This is analogous to Huffman coding, but over variable-length substrings rather than fixed symbols.

## Optimal Transport View

Zouhar et al. (2023) analyze tokenization through the lens of Renyi efficiency, showing that the quality of a tokenizer can be measured by how uniformly it distributes probability mass across the vocabulary. An ideal tokenizer produces tokens that are close to uniformly distributed, maximizing the information carried per token. BPE approximates this: frequent character sequences are merged into single tokens, reducing the skew of the token distribution.

## Limitations and Pathologies

**Compositionality failure.** BPE tokenization is context-free: the same substring always receives the same segmentation regardless of meaning. "unhappy" might tokenize as ["un", "happy"], correctly reflecting morphology, but "united" tokenizes as ["un", "ited"] -- a spurious morphological decomposition. Bostrom & Durrett (2020) showed that morphologically-aware tokenizers improve downstream performance on morphologically rich languages.

**Fertility disparities.** The number of tokens per word (fertility) varies dramatically across languages. Petrov et al. (2023) found that for GPT-4's tokenizer, representing the same semantic content in Burmese or Amharic requires 5--10x more tokens than English. This has direct cost and performance implications, since context length and inference cost are measured in tokens.

**Tokenization instability.** Minor input perturbations can cause different segmentations. Changing a single character can cascade into a different sequence of merge operations, altering downstream model behavior. This creates an attack surface: adversarial tokenization inputs can degrade model performance (Boucher et al., 2022).

## Recent Developments

**BPE-dropout** (Provilkov et al., 2020) introduces stochasticity during training by randomly skipping merge operations with probability $p$. This exposes the model to multiple segmentations of the same word, acting as a regularizer:

$$
P(\text{segmentation} \mid w) = \prod_{i} (1-p)^{\mathbb{1}[\text{merge}_i \text{ applied}]} \cdot p^{\mathbb{1}[\text{merge}_i \text{ skipped}]}
$$

This significantly improves performance on low-resource and morphologically rich languages.

**Unigram LM tokenization** (Kudo, 2018) takes the opposite approach to BPE: start with a large vocabulary and iteratively prune tokens whose removal causes the smallest increase in corpus log-likelihood under a unigram model:

$$
\mathcal{L} = \sum_{w \in \mathcal{C}} \log P(w) = \sum_{w \in \mathcal{C}} \sum_{t \in S^*(w)} \log p(t)
$$

where $S^*(w)$ is the Viterbi segmentation of word $w$.

**Tokenizer-free models.** ByT5 (Xue et al., 2022) and MegaByte (Yu et al., 2023) operate directly on bytes, eliminating the tokenization step entirely. These models avoid all tokenization artifacts but require handling much longer sequences. MegaByte addresses this with a hierarchical architecture: a large "global" transformer processes patches of bytes, and a smaller "local" transformer generates individual bytes within each patch.

## Key References

- Gage, P. (1994). A new algorithm for data compression. *C Users Journal*, 12(2).
- Sennrich, R., Haddow, B., & Birch, A. (2016). Neural machine translation of rare words with subword units. *ACL*.
- Kudo, T. (2018). Subword regularization: Improving neural network translation models with multiple subword candidates. *ACL*.
- Radford, A., et al. (2019). Language models are unsupervised multitask learners. *OpenAI Technical Report*.
- Provilkov, I., et al. (2020). BPE-dropout: Simple and effective subword regularization. *ACL*.
- Petrov, A., et al. (2023). Language model tokenizers introduce unfairness between languages. *NeurIPS*.
