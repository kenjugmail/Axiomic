---
title: Dropout
category: training
---
<!-- tier:intro -->
# Dropout

**Dropout** is a simple but powerful trick to prevent neural networks from memorizing the training data instead of learning general patterns. During training, it randomly "turns off" neurons — setting their outputs to zero with some probability (typically 10-50%).

## Why It Works

Imagine a team where the same person always takes the lead. If that person is absent, the team falls apart. Dropout forces the network to develop "redundant" capabilities — no single neuron can be solely responsible for any task because it might be turned off at any time. This makes the network more robust.

## In Transformers

Modern transformers use dropout in three places:
- **Attention dropout**: randomly zeros out attention weights, forcing tokens to attend to multiple positions
- **Residual dropout**: applied after each sub-layer before the residual connection
- **Embedding dropout**: applied to the input embeddings

Typical dropout rates in transformers: 0.1 (GPT-2, BERT) to 0.0 (large models like LLaMA, which don't use dropout at all because they have enough data).

## A Key Detail

Dropout is only active during **training**. During inference, all neurons are active but outputs are scaled down to match the expected values from training.

## Related Topics

- [Training Objectives](/wiki/training-objectives) — the training process where dropout is used
- [Layer Normalization](/wiki/layer-normalization) — another regularization technique

<!-- tier:undergrad -->
# Dropout

## Mathematical Formulation

During training, each element of a hidden layer $h$ is independently set to zero with probability $p$:

$$\tilde{h}_i = \begin{cases} 0 & \text{with probability } p \\ h_i / (1-p) & \text{with probability } 1-p \end{cases}$$

The scaling by $1/(1-p)$ (called "inverted dropout") ensures that $\mathbb{E}[\tilde{h}_i] = h_i$, so no adjustment is needed at inference time.

## Dropout as Ensemble

Srivastava et al. (2014) showed that dropout approximately trains an exponential ensemble of $2^n$ sub-networks (for $n$ neurons). At inference, the full network with scaled weights approximates the ensemble average.

```python
import torch.nn as nn

class TransformerBlock(nn.Module):
    def __init__(self, d_model, num_heads, d_ff, dropout=0.1):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, num_heads, dropout=dropout)
        self.ffn = nn.Sequential(
            nn.Linear(d_model, d_ff), nn.GELU(), nn.Linear(d_ff, d_model)
        )
        self.dropout = nn.Dropout(dropout)
        self.norm1 = nn.LayerNorm(d_model)
        self.norm2 = nn.LayerNorm(d_model)

    def forward(self, x):
        x = x + self.dropout(self.attn(self.norm1(x), self.norm1(x), self.norm1(x))[0])
        x = x + self.dropout(self.ffn(self.norm2(x)))
        return x
```

## Related Topics

- [Residual Connections](/wiki/residual-connections) — where dropout is applied
- [Fine-Tuning](/wiki/fine-tuning) — dropout rates often change during fine-tuning

<!-- tier:grad -->
# Dropout

## Dropout in the Era of Large Models

A striking trend: the largest language models often **don't use dropout at all**. LLaMA, Chinchilla, and PaLM train without dropout. The reason: when training data is sufficiently large and diverse, the regularization from dropout becomes unnecessary. The model is already under-fitting (not memorizing training data) because it never sees the same example twice.

This connects to scaling law insights: dropout's benefit decreases as training data increases. For compute-optimal training (Hoffmann et al., 2022), the data is large enough to make dropout unnecessary.

## DropPath (Stochastic Depth)

An alternative to standard dropout: **stochastic depth** (Huang et al., 2016) drops entire residual blocks instead of individual neurons. During training, each block is skipped with probability $p$. This provides stronger regularization and allows training much deeper networks.

## Attention Dropout vs. Head Dropping

Attention dropout zeros individual attention weights. A stronger variant, **head dropout**, zeros entire attention heads during training. Voita et al. (2019) showed this improves head specialization and identifies which heads are truly necessary.

## Related Topics

- [Training Objectives](/wiki/training-objectives) — training dynamics
- [Scaling Laws](/wiki/scaling-laws) — when dropout becomes unnecessary
