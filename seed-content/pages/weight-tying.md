---
title: Weight Tying
category: architecture
---
<!-- tier:intro -->
# Weight Tying

In a language model, there are two important matrices that deal with the vocabulary:

1. The **input embedding** matrix — converts each token into a vector at the start
2. The **output projection** matrix — converts vectors back into a probability distribution over tokens at the end

**Weight tying** is the trick of using the *same* matrix for both jobs. This sounds like it shouldn't work — one matrix goes from tokens to vectors, the other from vectors to tokens. But it turns out this works remarkably well and saves a huge amount of memory.

## Why It Works

Think about it: if the input embedding puts similar words near each other in vector space, then using the same matrix to convert back to words means the model will naturally assign high probability to words that are "close" to the predicted vector. The embedding space serves double duty as both the input representation and the output scoring function.

## The Numbers

For a model with vocabulary size 50,000 and embedding dimension 4,096, the embedding matrix has 50,000 × 4,096 ≈ 200 million parameters. Without weight tying, you'd need a second copy for the output. Weight tying cuts this by half — saving 200 million parameters and the memory to store them.

## Related Topics

- [Tokens](/wiki/tokens) — what the vocabulary represents
- [Embeddings](/wiki/embeddings) — the embedding matrix itself

<!-- tier:undergrad -->
# Weight Tying

## Mathematical Formulation

Let $\mathbf{E} \in \mathbb{R}^{V \times d}$ be the token embedding matrix, where $V$ is vocabulary size and $d$ is embedding dimension.

**Without weight tying**, the output logits are: $\text{logits} = h \mathbf{W}_o^T + b$ where $\mathbf{W}_o \in \mathbb{R}^{V \times d}$ is a separate output projection.

**With weight tying**: $\text{logits} = h \mathbf{E}^T + b$ — the embedding matrix is reused.

This was shown to be effective by Press & Wolf (2017) and is now standard in GPT-2, LLaMA, and most modern LLMs.

## Parameter Savings

For a model with $V = 32000$ and $d = 4096$:
- Without tying: $2Vd = 262$ million extra parameters
- With tying: 0 extra parameters

For large vocabularies (100K+), this saving is substantial.

## Related Topics

- [Embeddings](/wiki/embeddings) — the matrix being shared
- [Scaling Laws](/wiki/scaling-laws) — parameter count and efficiency

<!-- tier:grad -->
# Weight Tying

## Theoretical Justification

Press & Wolf (2017) showed weight tying improves perplexity on language modeling tasks while reducing parameters. The theoretical argument: in a well-trained model, the input embedding $\mathbf{E}$ maps semantically similar tokens to nearby vectors. The output projection should map hidden states to high logits for semantically appropriate next tokens. Using the same matrix ensures these two notions of "semantic similarity" are consistent.

Formally, with weight tying, the probability of token $w$ is proportional to $\exp(\mathbf{h}^T \mathbf{e}_w / \tau)$ — the softmax of the dot product between the hidden state and the token's embedding. This is equivalent to nearest-neighbor retrieval in embedding space.

## Interaction with Scaling

At very large model sizes, the embedding matrix becomes a smaller fraction of total parameters, so the relative savings of weight tying decrease. However, modern models still use it universally because: (1) it provides a useful inductive bias, (2) it slightly improves performance, (3) the memory savings remain significant at inference time.

## Related Topics

- [Embeddings](/wiki/embeddings) — the shared matrix
- [Softmax](/wiki/softmax) — the output distribution
