---
title: LoRA
category: efficiency
---
<!-- tier:intro -->

# LoRA (Low-Rank Adaptation)

Fine-tuning a large language model normally means updating *all* of its parameters — which could be billions of numbers. That requires enormous amounts of memory and expensive hardware. **LoRA** (Low-Rank Adaptation) is a clever technique that achieves nearly the same results while updating only a tiny fraction of the parameters.

## The Core Idea

When you fine-tune a model, the weight changes tend to be surprisingly "low-dimensional." In other words, even though a weight matrix might have millions of entries, the actual *change* during fine-tuning can be well-approximated by a much simpler structure.

LoRA exploits this by saying: "Instead of modifying the original weight matrix directly, let's add a small, low-rank update to it." A low-rank matrix is one that can be expressed as the product of two much smaller matrices.

## An Analogy

Imagine a 1000x1000 spreadsheet (one million cells). Normally, fine-tuning would change many of those cells. But what if the changes followed a simple pattern — say, each row's changes could be described by just 8 numbers? Then instead of storing one million changes, you'd only need 1000 x 8 + 8 x 1000 = 16,000 numbers. That's a 60x reduction!

That's exactly what LoRA does. It replaces a 1000x1000 change with two small matrices: one that's 1000x8 and another that's 8x1000.

## Practical Benefits

- **Memory savings.** Instead of storing a complete copy of the model for each task, you store only the small LoRA matrices. A 7-billion-parameter model might need only 10--50 million LoRA parameters.
- **Speed.** Training is faster because you compute gradients only for the small matrices.
- **Swappable.** You can train different LoRA adapters for different tasks and swap them in and out of the same base model instantly.
- **No inference overhead.** After training, the LoRA matrices can be merged back into the original weights, so the model runs at the same speed as before.

## How Well Does It Work?

Remarkably well. On most benchmarks, LoRA fine-tuning achieves 90--100% of the performance of full fine-tuning, while using a fraction of the compute and memory. This has made it the default method for fine-tuning open-source language models.

## Related Topics

- [Fine-Tuning](/wiki/fine-tuning) — the general framework that LoRA makes more efficient
- [Attention](/wiki/attention) — LoRA is typically applied to the attention weight matrices
- [RLHF](/wiki/rlhf) — LoRA is often used during the RLHF training pipeline

<!-- tier:undergrad -->

# LoRA (Low-Rank Adaptation)

LoRA (Hu et al., 2022) reparameterizes weight updates during fine-tuning as low-rank matrix decompositions, dramatically reducing trainable parameters while maintaining performance.

## Mathematical Formulation

For a pretrained weight matrix $\mathbf{W}_0 \in \mathbb{R}^{d_\text{out} \times d_\text{in}}$, full fine-tuning learns an update $\Delta\mathbf{W}$ of the same shape. LoRA constrains this update to be low-rank:

$$\mathbf{W} = \mathbf{W}_0 + \Delta\mathbf{W} = \mathbf{W}_0 + \frac{\alpha}{r}\mathbf{B}\mathbf{A}$$

where:
- $\mathbf{A} \in \mathbb{R}^{r \times d_\text{in}}$ (initialized from $\mathcal{N}(0, \sigma^2)$)
- $\mathbf{B} \in \mathbb{R}^{d_\text{out} \times r}$ (initialized to zero)
- $r \ll \min(d_\text{in}, d_\text{out})$ is the **rank**
- $\alpha$ is a scaling hyperparameter

The zero initialization of $\mathbf{B}$ ensures that at the start of training, $\Delta\mathbf{W} = \mathbf{0}$ and the model behaves identically to the pretrained model.

## Parameter Count

For a single weight matrix of shape $d_\text{out} \times d_\text{in}$:
- Full fine-tuning: $d_\text{out} \times d_\text{in}$ parameters
- LoRA: $r \times (d_\text{out} + d_\text{in})$ parameters

For a typical transformer layer with $d = 4096$ and rank $r = 16$:
- Full $\mathbf{W}_Q$: $4096 \times 4096 = 16.8\text{M}$ parameters
- LoRA $\mathbf{W}_Q$: $16 \times (4096 + 4096) = 131\text{K}$ parameters (128x reduction)

## Which Layers to Adapt

Hu et al. (2022) found that applying LoRA to the **attention projection matrices** ($\mathbf{W}_Q, \mathbf{W}_V$) is most effective. In practice, most implementations apply LoRA to all linear layers in the attention block ($\mathbf{W}_Q, \mathbf{W}_K, \mathbf{W}_V, \mathbf{W}_O$) and sometimes the MLP layers.

## Implementation

```python
import torch
import torch.nn as nn
import math

class LoRALinear(nn.Module):
    def __init__(self, original_linear: nn.Linear, rank: int = 16, alpha: float = 32.0):
        super().__init__()
        self.original = original_linear
        self.original.weight.requires_grad_(False)  # Freeze original
        if self.original.bias is not None:
            self.original.bias.requires_grad_(False)

        d_in = original_linear.in_features
        d_out = original_linear.out_features
        self.rank = rank
        self.scaling = alpha / rank

        self.lora_A = nn.Parameter(torch.randn(rank, d_in) * (1.0 / math.sqrt(d_in)))
        self.lora_B = nn.Parameter(torch.zeros(d_out, rank))

    def forward(self, x):
        base_output = self.original(x)
        lora_output = (x @ self.lora_A.T @ self.lora_B.T) * self.scaling
        return base_output + lora_output

    def merge(self):
        """Merge LoRA weights into original for inference."""
        self.original.weight.data += (self.lora_B @ self.lora_A) * self.scaling
```

## Using PEFT Library

```python
from peft import LoraConfig, get_peft_model, TaskType
from transformers import AutoModelForCausalLM

model = AutoModelForCausalLM.from_pretrained("meta-llama/Llama-2-7b-hf")

lora_config = LoraConfig(
    task_type=TaskType.CAUSAL_LM,
    r=16,                         # Rank
    lora_alpha=32,                # Scaling factor
    lora_dropout=0.05,            # Dropout on LoRA layers
    target_modules=["q_proj", "v_proj", "k_proj", "o_proj"],
)

model = get_peft_model(model, lora_config)
model.print_trainable_parameters()
# trainable params: 13,107,200 || all params: 6,751,842,304 || trainable%: 0.1941
```

## Rank Selection

The rank $r$ controls the expressiveness-efficiency trade-off:

| Rank $r$ | Trainable params (7B model) | Typical use case |
|---|---|---|
| 4 | ~3M | Simple style/format tasks |
| 16 | ~13M | General fine-tuning (default) |
| 64 | ~52M | Complex tasks, large datasets |
| 256 | ~210M | Approaching full fine-tuning |

Empirically, $r = 8$--$32$ works well for most tasks. Higher ranks show diminishing returns.

## Related Topics

- [Fine-Tuning](/wiki/fine-tuning) — the full fine-tuning paradigm LoRA approximates
- [Attention](/wiki/attention) — the weight matrices LoRA typically targets
- [RLHF](/wiki/rlhf) — LoRA enables RLHF on consumer hardware

<!-- tier:grad -->

# LoRA (Low-Rank Adaptation)

LoRA (Hu et al., 2022) is the most widely adopted parameter-efficient fine-tuning (PEFT) method. This section examines its theoretical properties, the expanding family of LoRA variants, and open research questions.

## Theoretical Justification

**Why low-rank?** Aghajanyan et al. (2021) showed that pretrained language models have a low **intrinsic dimensionality** — the fine-tuning optimization landscape can be effectively described by far fewer parameters than the full model. For GPT-3 175B, the intrinsic dimension was found to be ~5,000, meaning fine-tuning can be well-approximated in a 5,000-dimensional subspace despite having 175 billion parameters.

**Connection to random projections.** LoRA can be viewed as learning in a structured subspace defined by the low-rank factorization. Unlike random subspace methods (Li et al., 2018), LoRA's subspace adapts during training, making it strictly more expressive.

**Regularization effect.** The rank constraint acts as implicit regularization, biasing toward solutions with small spectral norm changes: $\|\Delta\mathbf{W}\|_* \leq r \cdot \|\Delta\mathbf{W}\|_F / \sqrt{r} = \sqrt{r}\|\Delta\mathbf{W}\|_F$. This helps prevent catastrophic forgetting.

## LoRA Variants

The success of LoRA has spawned a large family of variants:

**QLoRA** (Dettmers et al., 2023): combines LoRA with 4-bit quantization of the base model. The pretrained weights are stored in NF4 (4-bit NormalFloat) format, reducing memory by ~4x, while LoRA adapters train in full precision. This enables fine-tuning a 65B parameter model on a single 48GB GPU.

**DoRA** (Liu et al., 2024): decomposes weight updates into magnitude and direction components: $\mathbf{W} = m \cdot \frac{\mathbf{W}_0 + \mathbf{B}\mathbf{A}}{\|\mathbf{W}_0 + \mathbf{B}\mathbf{A}\|_c}$ where $m$ is a learnable magnitude vector and $\|\cdot\|_c$ is column-wise norm. This better mimics the learning dynamics of full fine-tuning.

**AdaLoRA** (Zhang et al., 2023): dynamically allocates rank across layers based on importance scores. Layers that need more expressiveness get higher rank; less important layers get pruned. This improves performance under fixed parameter budgets.

**LoRA+** (Hayou et al., 2024): uses different learning rates for $\mathbf{A}$ and $\mathbf{B}$, with $\eta_B \gg \eta_A$. Analysis shows this better aligns with the gradient dynamics of full fine-tuning.

**rsLoRA** (Kalajdzievski, 2023): changes the scaling factor from $\alpha/r$ to $\alpha/\sqrt{r}$, which is theoretically motivated by ensuring stable gradient norms as rank increases.

## Multi-Adapter Systems

**LoRA merging.** Multiple LoRA adapters trained for different tasks can be combined:
- **Linear merging**: $\Delta\mathbf{W}_\text{merged} = \sum_i \lambda_i \Delta\mathbf{W}_i$ with task weights $\lambda_i$.
- **TIES-Merging** (Yadav et al., 2023): resolves sign conflicts between adapters before averaging.
- **DARE** (Yu et al., 2024): randomly drops elements of task vectors before merging, reducing interference.

**LoRA switching.** At inference time, different LoRA adapters can be applied to the same base model based on the input. S-LoRA (Sheng et al., 2024) efficiently serves thousands of LoRA adapters simultaneously by batching base model computation and applying per-request adapters.

## Limitations and Failure Modes

1. **Rank limitation.** Some tasks genuinely require high-rank updates. Tasks that alter the model's knowledge (e.g., new languages, new domains) often need higher ranks than tasks that alter format or style.

2. **Layer allocation.** Uniform rank across layers is suboptimal. Different layers contribute differently to different tasks, but optimal allocation requires expensive hyperparameter search.

3. **Composition.** Stacking or merging LoRA adapters doesn't always compose well. The interaction between low-rank updates is nonlinear through the network's activation functions, and theoretical guarantees on composition quality are lacking.

4. **Comparison fairness.** Claims that "LoRA matches full fine-tuning" are sensitive to evaluation setup. Biderman et al. (2024) showed that with sufficient compute budget, full fine-tuning consistently outperforms LoRA, especially on knowledge-intensive tasks. The advantage of LoRA is efficiency, not superior performance.

## Open Questions

1. **Optimal subspace structure.** Is low-rank the right inductive bias? Alternatives include sparse updates, block-diagonal structure, and Kronecker products. The "right" structure likely depends on the task.

2. **Theoretical sample complexity.** How does the rank $r$ interact with the sample complexity of fine-tuning? Lower rank means stronger regularization, which could help with small datasets but hurt with large ones.

3. **Scaling behavior.** How should LoRA hyperparameters ($r$, $\alpha$, target modules) scale with model size? Current practice is largely empirical.

## Related Topics

- [Fine-Tuning](/wiki/fine-tuning) — the full-parameter baseline
- [Attention](/wiki/attention) — the architecture where LoRA is typically applied
- [RLHF](/wiki/rlhf) — LoRA makes preference optimization accessible
- [RAG](/wiki/rag) — an alternative to fine-tuning for knowledge adaptation
