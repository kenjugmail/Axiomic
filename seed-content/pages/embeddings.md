---
title: Word Embeddings
category: fundamentals
---
<!-- tier:intro -->
# Word Embeddings

Computers don't understand words the way we do. When you read the word "cat," your brain lights up with associations -- fur, whiskers, purring, independence. But to a computer, "cat" is just a string of three characters. Word embeddings are the trick that gives computers something closer to our rich understanding of words.

An embedding is a list of numbers (a vector) that represents a word. Instead of treating words as arbitrary labels, we place each word at a specific point in a high-dimensional space. The magic is that **words with similar meanings end up close together** in this space.

Imagine a giant room where every word in English has a location. "Dog" and "cat" are near each other because they're both pets. "King" and "queen" are near each other because they're both royalty. "Paris" and "France" are near each other because of their geographic relationship. This room is the embedding space, and each word's location is its embedding vector.

## How Do We Get These Vectors?

The key insight behind word embeddings is **you shall know a word by the company it keeps**. Words that appear in similar contexts tend to have similar meanings. "Dog" and "cat" both appear near words like "pet," "vet," and "feed." By analyzing massive amounts of text and tracking which words appear near which other words, we can learn embedding vectors that capture these patterns.

The most famous method for learning embeddings is **Word2Vec** (2013). It comes in two flavors:

- **CBOW (Continuous Bag of Words):** Given the surrounding words, predict the word in the middle.
- **Skip-gram:** Given a word, predict the surrounding words.

By training a simple neural network on one of these tasks over billions of words of text, the network learns vectors that encode meaning.

## Explore: Embedding Space

::viz[embedding-explorer]

## The Famous Example

The most celebrated property of word embeddings is that they capture analogies through vector arithmetic:

**king - man + woman = queen**

This means if you take the vector for "king," subtract the vector for "man," and add the vector for "woman," the result is closest to the vector for "queen." The embedding space has learned a "gender" direction and a "royalty" direction as separate dimensions.

## Why Embeddings Matter for Transformers

In a [transformer](/wiki/attention), the very first thing that happens to input text is that each word (technically, each [token](/wiki/tokens)) gets converted into an embedding vector. This embedding is the starting representation that all subsequent layers build upon. The transformer's [attention mechanism](/wiki/attention) works entirely with these vectors -- comparing them, combining them, and transforming them.

The embedding matrix is simply a big lookup table: one row per word in the vocabulary. If your vocabulary has 50,000 words and your embedding dimension is 768, the embedding matrix has 50,000 rows and 768 columns. To get a word's embedding, you just look up its row.

These initial embeddings are learned during training, along with all the other parameters in the model. The model discovers on its own what information to encode in each dimension.

<!-- tier:undergrad -->
# Word Embeddings

## The Embedding Matrix

An embedding layer is a learnable lookup table $\mathbf{E} \in \mathbb{R}^{V \times d}$, where $V$ is the vocabulary size and $d$ is the embedding dimension. Given a token index $i$, the embedding is simply the $i$-th row:

$$\mathbf{e}_i = \mathbf{E}[i, :] \in \mathbb{R}^d$$

This is mathematically equivalent to multiplying a one-hot vector $\mathbf{x}_i \in \mathbb{R}^V$ by the embedding matrix:

$$\mathbf{e}_i = \mathbf{x}_i^\top \mathbf{E}$$

But in practice we use integer indexing for efficiency -- no need to materialize a sparse one-hot vector.

## Word2Vec: Skip-gram with Negative Sampling

The skip-gram objective maximizes the probability of context words given a center word. For a center word $w_c$ and context word $w_o$, the probability under the basic softmax model is:

$$P(w_o \mid w_c) = \frac{\exp(\mathbf{u}_{w_o}^\top \mathbf{v}_{w_c})}{\sum_{j=1}^{V} \exp(\mathbf{u}_j^\top \mathbf{v}_{w_c})}$$

where $\mathbf{v}_{w_c}$ is the center word vector and $\mathbf{u}_{w_o}$ is the context word vector. Computing the denominator over the full vocabulary is expensive, so **negative sampling** approximates it. The objective becomes:

$$\mathcal{L} = \log \sigma(\mathbf{u}_{w_o}^\top \mathbf{v}_{w_c}) + \sum_{k=1}^{K} \mathbb{E}_{w_k \sim P_n(w)} \left[\log \sigma(-\mathbf{u}_{w_k}^\top \mathbf{v}_{w_c})\right]$$

where $\sigma$ is the sigmoid function and $K$ negative samples are drawn from a noise distribution $P_n(w) \propto f(w)^{3/4}$ (the unigram distribution raised to the 3/4 power).

## Embedding Properties

Trained embeddings exhibit linear substructures. The analogy **a : b :: c : d** is solved by:

$$\mathbf{d} = \arg\max_{w \in V} \cos(\mathbf{v}_w, \mathbf{v}_b - \mathbf{v}_a + \mathbf{v}_c)$$

where cosine similarity is:

$$\cos(\mathbf{u}, \mathbf{v}) = \frac{\mathbf{u} \cdot \mathbf{v}}{\|\mathbf{u}\| \|\mathbf{v}\|}$$

## Embeddings in Transformers

In transformers, the embedding is combined with [positional encoding](/wiki/positional-encoding):

$$\mathbf{h}_i^{(0)} = \mathbf{E}[x_i] + \mathbf{PE}[i]$$

A common practice (used in GPT-2 and others) is **weight tying**: the output projection matrix that maps hidden states back to vocabulary logits shares weights with the embedding matrix. If $\mathbf{h}$ is the final hidden state, the logits are:

$$\text{logits} = \mathbf{h} \mathbf{E}^\top$$

This reduces parameters and acts as a regularizer.

## PyTorch Implementation

```python
import torch
import torch.nn as nn

# Basic embedding layer
vocab_size = 50_000
embed_dim = 768
embedding = nn.Embedding(vocab_size, embed_dim)

# Forward pass: token indices -> vectors
token_ids = torch.tensor([101, 2003, 1037, 4937])  # "this is a cat"
vectors = embedding(token_ids)  # shape: (4, 768)

# Embedding with weight tying for a language model head
class LMHead(nn.Module):
    def __init__(self, embed_dim, vocab_size):
        super().__init__()
        self.embedding = nn.Embedding(vocab_size, embed_dim)
        # Tie weights: output projection shares embedding weights
        self.output_proj = lambda h: h @ self.embedding.weight.T

    def forward(self, token_ids):
        h = self.embedding(token_ids)  # (batch, seq, embed_dim)
        # ... transformer layers would go here ...
        logits = self.output_proj(h)    # (batch, seq, vocab_size)
        return logits

# Cosine similarity for analogy tasks
from torch.nn.functional import cosine_similarity

def analogy(embed, word_a, word_b, word_c, vocab):
    """Solve: a is to b as c is to ?"""
    target = embed.weight[word_b] - embed.weight[word_a] + embed.weight[word_c]
    sims = cosine_similarity(target.unsqueeze(0), embed.weight, dim=1)
    sims[[word_a, word_b, word_c]] = -1  # exclude input words
    return sims.argmax().item()
```

## Scaling: Embedding Dimension and Vocabulary

Typical configurations in well-known models:

| Model     | Vocab Size | Embedding Dim |
|-----------|-----------|---------------|
| GPT-2     | 50,257    | 768           |
| BERT-base | 30,522    | 768           |
| GPT-3     | 50,257    | 12,288        |
| LLaMA-2   | 32,000    | 4,096         |

The embedding matrix can be a significant fraction of total parameters. For GPT-2 Small, $50{,}257 \times 768 \approx 38.6M$ parameters out of 124M total (about 31%).

<!-- tier:grad -->
# Word Embeddings

## Theoretical Foundations

Levy and Goldberg (2014) showed that the skip-gram with negative sampling objective implicitly factorizes a shifted PMI (Pointwise Mutual Information) matrix:

$$\mathbf{v}_w \cdot \mathbf{u}_c = \text{PMI}(w, c) - \log k$$

where $k$ is the number of negative samples. This connects neural embeddings to classical distributional semantics and explains why simple matrix factorization methods (GloVe, Pennington et al., 2014) achieve comparable performance. GloVe explicitly factorizes a log co-occurrence matrix:

$$J = \sum_{i,j=1}^{V} f(X_{ij}) \left(\mathbf{w}_i^\top \tilde{\mathbf{w}}_j + b_i + \tilde{b}_j - \log X_{ij}\right)^2$$

where $f$ is a weighting function that caps frequent co-occurrences.

## Contextual vs. Static Embeddings

Static embeddings (Word2Vec, GloVe) assign one vector per word type. This fails for polysemy: "bank" (financial) and "bank" (river) share a vector. Transformers solve this through **contextual embeddings** -- the output of each layer is a context-dependent representation. Peters et al. (2018, ELMo) first demonstrated the value of contextual representations using bidirectional LSTMs.

In transformers, the initial embedding $\mathbf{E}[x_i]$ is static, but after passing through [self-attention](/wiki/self-attention) and [feed-forward layers](/wiki/feed-forward-networks), the representation at each position becomes deeply contextual. Ethayarajh (2019) measured this, showing that upper-layer BERT representations are highly anisotropic -- they occupy a narrow cone in embedding space, with contextual similarity between random words being surprisingly high.

## Anisotropy and Representation Degeneration

A known issue in transformer embeddings is **anisotropy**: learned representations tend to cluster in a narrow cone rather than utilizing the full hypersphere. Gao et al. (2019) termed this the "representation degeneration problem." The token frequency contributes: high-frequency tokens dominate the embedding space geometry.

Approaches to address this include:

- **Whitening/isotropy calibration** (Su et al., 2021): post-hoc transformation to make representations isotropic
- **Contrastive learning** (Gao et al., 2021, SimCSE): training objectives that spread representations more uniformly
- **Spectral normalization** of the embedding matrix during training

## Rotary Position Embeddings and the Embedding Space

Modern architectures like LLaMA (Touvron et al., 2023) use [Rotary Position Embeddings (RoPE)](/wiki/positional-encoding) that apply rotation matrices in the embedding space rather than adding position vectors. This changes the geometry: relative position information is encoded as the angle between rotated query/key vectors, preserving the dot-product structure:

$$\langle f_q(\mathbf{x}_m, m), f_k(\mathbf{x}_n, n) \rangle = g(\mathbf{x}_m, \mathbf{x}_n, m - n)$$

## Embedding Initialization and Training Dynamics

Embedding initialization matters more than often appreciated. The default PyTorch initialization ($\mathcal{N}(0, 1)$) leads to embeddings with norm $\approx \sqrt{d}$, which can cause training instability. Common practices:

- Initialize with $\mathcal{N}(0, 0.02)$ (GPT-2 convention)
- Scale by $1/\sqrt{d}$ for compatibility with downstream [layer normalization](/wiki/layer-normalization)
- Initialize from pretrained static embeddings (less common now but was standard in the ELMo/early BERT era)

Press et al. (2020) studied weight tying in depth, showing it improves perplexity by 0.5-1.0 points and significantly reduces parameters. They also showed that the embedding matrix learns to encode both semantic and syntactic information, with different singular vectors capturing different linguistic properties.

## Tokenization and Subword Embeddings

Modern models use subword tokenization (BPE, SentencePiece, Unigram) rather than word-level vocabularies. This means embeddings operate at the subword level. Compositional meaning of full words must be constructed through the transformer layers. Empirically, Vulić et al. (2020) showed that subword-level embeddings underperform word-level embeddings on intrinsic evaluations (analogy, similarity) but enable open-vocabulary generalization critical for downstream tasks.

### Key References

- Mikolov et al. (2013). "Efficient Estimation of Word Representations in Vector Space." arXiv:1301.3781
- Pennington et al. (2014). "GloVe: Global Vectors for Word Representation." EMNLP.
- Levy & Goldberg (2014). "Neural Word Embedding as Implicit Matrix Factorization." NeurIPS.
- Ethayarajh (2019). "How Contextual are Contextualized Word Representations?" EMNLP.
- Press et al. (2020). "Using the Output Embedding to Improve Language Models." EACL.
- Gao et al. (2021). "SimCSE: Simple Contrastive Learning of Sentence Embeddings." EMNLP.
