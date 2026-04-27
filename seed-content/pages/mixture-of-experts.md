---
title: Mixture of Experts
category: architecture
---
<!-- tier:intro -->
# Mixture of Experts (MoE)

Imagine you have eight specialists instead of one generalist. For each question, a "router" quickly decides which 2 specialists are best suited to answer, and only those 2 do the work. The other 6 rest. This is **Mixture of Experts** — a way to make models much larger without making them proportionally slower.

## Why MoE?

A standard transformer processes every token through every parameter. A 175B parameter model needs 175B parameters worth of computation per token. But with MoE, you can have 1.6 trillion parameters while only using ~180B per token (like Mixtral 8x22B).

## How It Works

In an MoE transformer, the [feed-forward network](/wiki/feed-forward-networks) in each transformer block is replaced with multiple "expert" FFNs. A small neural network (the **router** or **gate**) decides which experts to use for each token:

1. Token arrives at the MoE layer
2. Router computes a score for each expert
3. Top-K experts (usually K=2) are selected
4. Token is processed by just those experts
5. Results are combined with weights from the router

## Real Examples

- **Mixtral 8x7B**: 8 experts, top-2 routing. 47B total parameters, ~13B active per token
- **GPT-4**: Rumored to use MoE architecture
- **Switch Transformer**: pioneered 1-expert routing for maximum efficiency

## Related Topics

- [Feed-Forward Networks](/wiki/feed-forward-networks) — the experts are FFN layers
- [Scaling Laws](/wiki/scaling-laws) — MoE changes the compute-parameter relationship
- [SwiGLU](/wiki/swiglu) — common activation in expert FFNs

<!-- tier:undergrad -->
# Mixture of Experts

## Architecture

Given input $x$, the MoE layer with $E$ experts computes:

$$\text{MoE}(x) = \sum_{i=1}^{E} g_i(x) \cdot e_i(x)$$

where $e_i$ is the $i$-th expert network and $g(x) = \text{TopK}(\text{softmax}(W_g x))$ is the gating function that selects and weights the top-$K$ experts.

## Load Balancing

A naive router tends to collapse: it sends all tokens to one or two "favorite" experts, wasting the others. The **auxiliary load balancing loss** encourages even distribution:

$$\mathcal{L}_{aux} = \alpha \cdot E \sum_{i=1}^{E} f_i \cdot P_i$$

where $f_i$ is the fraction of tokens routed to expert $i$ and $P_i$ is the average routing probability for expert $i$.

## Implementation

```python
import torch
import torch.nn as nn

class MoELayer(nn.Module):
    def __init__(self, d_model, d_ff, num_experts=8, top_k=2):
        super().__init__()
        self.experts = nn.ModuleList([
            nn.Sequential(nn.Linear(d_model, d_ff), nn.SiLU(), nn.Linear(d_ff, d_model))
            for _ in range(num_experts)
        ])
        self.gate = nn.Linear(d_model, num_experts)
        self.top_k = top_k

    def forward(self, x):
        # x: (batch, seq, d_model)
        gate_logits = self.gate(x)  # (batch, seq, num_experts)
        weights, indices = torch.topk(torch.softmax(gate_logits, dim=-1), self.top_k)
        weights = weights / weights.sum(dim=-1, keepdim=True)  # normalize

        output = torch.zeros_like(x)
        for k in range(self.top_k):
            expert_idx = indices[..., k]  # which expert for each token
            for i, expert in enumerate(self.experts):
                mask = (expert_idx == i)
                if mask.any():
                    output[mask] += weights[..., k:k+1][mask] * expert(x[mask])
        return output
```

## Related Topics

- [Transformer Block](/wiki/transformer-block) — where MoE replaces the FFN
- [SwiGLU](/wiki/swiglu) — experts typically use gated activations

<!-- tier:grad -->
# Mixture of Experts

## Scaling Properties

MoE decouples parameter count from compute per token. The Switch Transformer (Fedus et al., 2022) showed that for a fixed compute budget, MoE models consistently outperform dense models. The scaling law approximately follows: an MoE model with $E$ experts and $N$ parameters per expert performs similarly to a dense model with ~$\sqrt{E} \cdot N$ parameters.

## Expert Specialization

Analysis of trained MoE models reveals partial specialization:
- Some experts specialize in domains (code, math, languages)
- Others specialize in syntactic roles (punctuation, function words)
- But most experts handle a mix of tasks

This is an active research area connecting to [mechanistic interpretability](/wiki/mechanistic-interpretability).

## Challenges

**Communication overhead**: In distributed training, MoE requires all-to-all communication to route tokens to experts on different devices. This can dominate training time.

**Training instability**: MoE models are notoriously difficult to train, with router collapse and loss spikes. Techniques like expert-choice routing (Zhou et al., 2022) and soft MoE (Puigcerver et al., 2024) address this.

**Inference serving**: All experts must be loaded in memory even though only K are active. Offloading inactive experts to CPU is possible but adds latency.

## Related Topics

- [Scaling Laws](/wiki/scaling-laws) — modified scaling for MoE
- [LoRA](/wiki/lora) — efficient fine-tuning of MoE models is especially challenging
