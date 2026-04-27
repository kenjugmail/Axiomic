---
title: Feed-Forward Networks in Transformers
category: architecture
---
<!-- tier:intro -->
# Feed-Forward Networks in Transformers

Every transformer layer has two main components: [multi-head attention](/wiki/multi-head-attention) and a **feed-forward network (FFN)**. While attention handles communication between words (letting them share information), the FFN processes each word independently -- it transforms the information at each position without looking at any other position.

## What the FFN Does

Think of attention as a meeting where everyone shares notes, and the FFN as the time afterward where each person privately processes what they learned. Each word takes the information gathered from attention and runs it through a small neural network to produce a richer representation.

## The Structure

The FFN in a transformer is surprisingly simple -- it's just two linear transformations with an activation function in between:

1. **Expand:** Project from the model dimension (e.g., 768) to a larger hidden dimension (e.g., 3072). This is typically a 4x expansion.
2. **Activate:** Apply a nonlinear function (like ReLU or GELU) to introduce nonlinearity.
3. **Contract:** Project back down to the model dimension (768).

The expansion is crucial. By projecting into a higher-dimensional space, the network can represent more complex transformations. Think of it like sketching out your thoughts on a big whiteboard (expansion), working through the problem (activation), and then summarizing the key conclusions on a notecard (contraction).

## Why FFNs Are Needed

[Self-attention](/wiki/self-attention) alone isn't enough. Attention is a linear operation on the values -- it computes weighted sums, which are inherently linear combinations. The FFN adds the nonlinearity that the model needs to learn complex functions. Without FFNs, stacking more attention layers wouldn't help much, because compositions of linear functions are still linear.

Research has shown that FFNs function as **key-value memories**: the first layer's weights store "keys" (patterns to match), and the second layer's weights store "values" (information to retrieve when the pattern matches). This means the FFN is where much of the model's factual knowledge is stored.

## Activation Functions

The original Transformer used **ReLU** (just zeroes out negatives). Modern models almost universally use **GELU** (Gaussian Error Linear Unit) or **SiLU/Swish**, which are smoother versions. The choice of activation affects what patterns the FFN can learn and how well gradients flow during training.

Some modern architectures like LLaMA use a **gated** variant (SwiGLU), where the expansion is split into two paths -- one acts as a gate controlling information flow. This consistently improves quality at the cost of slightly more parameters.

<!-- tier:undergrad -->
# Feed-Forward Networks in Transformers

## Standard FFN

The position-wise feed-forward network applies the same transformation independently to each position:

$$\text{FFN}(\mathbf{x}) = W_2 \cdot \sigma(W_1 \mathbf{x} + \mathbf{b}_1) + \mathbf{b}_2$$

where:
- $W_1 \in \mathbb{R}^{d_{ff} \times d_{\text{model}}}$ (expansion)
- $W_2 \in \mathbb{R}^{d_{\text{model}} \times d_{ff}}$ (contraction)
- $\sigma$ is the activation function
- $d_{ff}$ is the intermediate (hidden) dimension, typically $4 \times d_{\text{model}}$

## Activation Functions

**ReLU** (original Transformer):
$$\text{ReLU}(x) = \max(0, x)$$

**GELU** (BERT, GPT-2, GPT-3):
$$\text{GELU}(x) = x \cdot \Phi(x) \approx 0.5x\left(1 + \tanh\left[\sqrt{2/\pi}(x + 0.044715x^3)\right]\right)$$

where $\Phi$ is the standard Gaussian CDF. GELU smoothly gates values rather than hard-thresholding.

**SiLU / Swish** (LLaMA, PaLM):
$$\text{SiLU}(x) = x \cdot \sigma(x) = \frac{x}{1 + e^{-x}}$$

## Gated FFN Variants

Modern architectures use gated linear units. The general pattern is:

$$\text{GatedFFN}(\mathbf{x}) = W_2 \cdot (\sigma(W_{\text{gate}} \mathbf{x}) \odot W_{\text{up}} \mathbf{x}) + \mathbf{b}$$

where $\odot$ is element-wise multiplication and $\sigma$ is an activation function.

**SwiGLU** (Shazeer, 2020; used in LLaMA, Mistral, PaLM):
$$\text{SwiGLU}(\mathbf{x}) = W_2 \cdot (\text{SiLU}(W_{\text{gate}} \mathbf{x}) \odot W_{\text{up}} \mathbf{x})$$

This has three projection matrices instead of two, so $d_{ff}$ is adjusted to keep parameter count similar. LLaMA uses $d_{ff} = \frac{2}{3} \times 4d_{\text{model}}$, rounded to a multiple of 256.

## Parameter Count

For a standard FFN: $2 \times d_{\text{model}} \times d_{ff}$ parameters (plus biases).
For SwiGLU: $3 \times d_{\text{model}} \times d_{ff}$ parameters.

With the standard $4\times$ expansion, each FFN has $8 d_{\text{model}}^2$ parameters -- **twice** the parameters of the [multi-head attention](/wiki/multi-head-attention) layer ($4 d_{\text{model}}^2$). FFNs account for roughly 2/3 of total transformer parameters.

## PyTorch Implementation

```python
import torch
import torch.nn as nn
import torch.nn.functional as F

class TransformerFFN(nn.Module):
    """Standard FFN with GELU activation."""
    def __init__(self, d_model: int, d_ff: int, dropout: float = 0.1):
        super().__init__()
        self.w1 = nn.Linear(d_model, d_ff)
        self.w2 = nn.Linear(d_ff, d_model)
        self.dropout = nn.Dropout(dropout)

    def forward(self, x):
        return self.w2(self.dropout(F.gelu(self.w1(x))))

class SwiGLU_FFN(nn.Module):
    """Gated FFN with SwiGLU activation (LLaMA-style)."""
    def __init__(self, d_model: int, d_ff: int):
        super().__init__()
        # d_ff is already adjusted (2/3 * 4 * d_model)
        self.w_gate = nn.Linear(d_model, d_ff, bias=False)
        self.w_up = nn.Linear(d_model, d_ff, bias=False)
        self.w_down = nn.Linear(d_ff, d_model, bias=False)

    def forward(self, x):
        return self.w_down(F.silu(self.w_gate(x)) * self.w_up(x))

# Full transformer block for context
class TransformerBlock(nn.Module):
    def __init__(self, d_model, n_heads, d_ff):
        super().__init__()
        self.attn = nn.MultiheadAttention(d_model, n_heads, batch_first=True)
        self.ffn = SwiGLU_FFN(d_model, d_ff)
        self.norm1 = nn.RMSNorm(d_model)  # PyTorch 2.4+
        self.norm2 = nn.RMSNorm(d_model)

    def forward(self, x):
        # Pre-norm architecture
        h = x + self.attn(self.norm1(x), self.norm1(x), self.norm1(x))[0]
        return h + self.ffn(self.norm2(h))

# Verify parameter counts
d_model, d_ff = 4096, 11008  # LLaMA-7B dimensions
ffn = SwiGLU_FFN(d_model, d_ff)
n_params = sum(p.numel() for p in ffn.parameters())
print(f"SwiGLU params: {n_params:,}")  # 135,266,304
```

<!-- tier:grad -->
# Feed-Forward Networks in Transformers

## FFNs as Key-Value Memories

Geva et al. (2021) presented a compelling interpretation: each FFN functions as a collection of key-value memories. For a ReLU-activated FFN:

$$\text{FFN}(\mathbf{x}) = \sum_{i=1}^{d_{ff}} \text{ReLU}(\mathbf{k}_i^\top \mathbf{x}) \cdot \mathbf{v}_i$$

where $\mathbf{k}_i$ is the $i$-th row of $W_1$ (the "key") and $\mathbf{v}_i$ is the $i$-th column of $W_2$ (the "value"). Each neuron computes a match score against its key pattern and, if activated, contributes its value to the output.

Geva et al. showed that:
- Keys correspond to interpretable input patterns (topics, syntactic structures)
- Values correspond to the next-token distributions induced by those patterns
- Individual neurons can be mapped to human-understandable concepts

Dai et al. (2022) extended this, showing that FFN knowledge can be directly edited: modifying specific rows of $W_1$ and columns of $W_2$ changes the model's factual associations (the basis for knowledge editing methods like ROME and MEMIT).

## Mixture-of-Experts FFN

The FFN is the dominant computational cost per layer ($8d^2$ vs $4d^2$ for attention). **Mixture-of-Experts (MoE)** replaces the single FFN with $E$ expert FFNs, of which only $k$ are activated per token:

$$\text{MoE}(\mathbf{x}) = \sum_{i=1}^{k} g_i(\mathbf{x}) \cdot \text{FFN}_i(\mathbf{x})$$

where $g(\mathbf{x}) = \text{TopK}(\text{softmax}(\mathbf{x} \mathbf{W}_g))$ is a learned router selecting the top-$k$ experts.

Key MoE models:
- **Switch Transformer** (Fedus et al., 2022): $k=1$, up to 1.6T parameters with 128 experts
- **Mixtral 8x7B** (Mistral AI, 2024): 8 experts, $k=2$, 46.7B total params but 12.9B active
- **DeepSeek-V2** (2024): 160 experts with $k=6$, plus shared experts always active

The routing introduces load balancing challenges. Fedus et al. use an auxiliary loss:

$$\mathcal{L}_{\text{aux}} = \alpha \sum_{i=1}^{E} f_i \cdot p_i$$

where $f_i$ is the fraction of tokens routed to expert $i$ and $p_i$ is the average router probability for expert $i$. This encourages uniform routing.

## Sparsity in FFN Activations

Even in dense (non-MoE) models, FFN activations are remarkably sparse. Li et al. (2023) showed that for ReLU-activated FFNs, 90-95% of neurons have zero activation for any given input. For GELU/SiLU, while activations are not exactly zero, a similar sparsity pattern exists with near-zero activations.

This observation enables:
- **Deja Vu** (Liu et al., 2023): Predict which neurons will activate and skip the rest, achieving 2x speedup
- **PowerInfer** (Song et al., 2024): Exploit activation sparsity for efficient CPU/GPU hybrid inference

## FFN Width vs. Depth

The expansion ratio ($d_{ff} / d_{\text{model}}$) is a critical design choice. The standard 4x was set in the original Transformer without extensive ablation. Recent findings:

Levine et al. (2020) provided theoretical analysis showing that width and depth have complementary roles: depth enables representing complex function compositions, while width enables memorization capacity. They argue for deeper, narrower networks.

However, Tay et al. (2022, "Scaling Laws for Compute-Optimal Training") and Kaplan et al. (2020) showed that optimal allocation between width and depth depends on the compute budget. At larger compute budgets, models benefit from being wider (larger $d_{ff}$).

The expansion ratio in practice:
| Model | $d_{\text{model}}$ | $d_{ff}$ | Ratio | Activation |
|-------|---------------------|-----------|-------|------------|
| Original Transformer | 512 | 2048 | 4.0x | ReLU |
| GPT-3 175B | 12288 | 49152 | 4.0x | GELU |
| LLaMA-7B | 4096 | 11008 | 2.69x* | SwiGLU |
| LLaMA-70B | 8192 | 28672 | 3.50x* | SwiGLU |

*SwiGLU has 3 matrices, so effective parameter ratio is $3 \times 2.69 / 2 = 4.03\times$ standard.

## Parallel Attention + FFN

Some architectures (PaLM, GPT-J) compute attention and FFN in parallel rather than sequentially:

$$\mathbf{x}_{l+1} = \mathbf{x}_l + \text{Attn}(\text{Norm}(\mathbf{x}_l)) + \text{FFN}(\text{Norm}(\mathbf{x}_l))$$

vs. the standard sequential formulation:

$$\mathbf{x}_{l+1} = \text{FFN}(\text{Norm}(\mathbf{x}_l + \text{Attn}(\text{Norm}(\mathbf{x}_l))))$$

The parallel formulation is ~15% faster (attention and FFN can be fused into one large matmul) with negligible quality loss at scale (>8B parameters). At smaller scales, there is a measurable quality gap (Chowdhery et al., 2022).

### Key References

- Shazeer (2020). "GLU Variants Improve Transformer." arXiv:2002.05202.
- Geva et al. (2021). "Transformer Feed-Forward Layers Are Key-Value Memories." EMNLP.
- Fedus et al. (2022). "Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity." JMLR.
- Dai et al. (2022). "Knowledge Neurons in Pretrained Transformers." ACL.
- Li et al. (2023). "Lazy Neuron Phenomenon in Large Language Models." ICLR.
- Chowdhery et al. (2022). "PaLM: Scaling Language Modeling with Pathways." arXiv:2204.02311.
