---
title: Fine-Tuning
category: training
---
<!-- tier:intro -->

# Fine-Tuning

Training a large language model from scratch requires enormous amounts of data, compute, and time — often millions of dollars. But what if you want a model that's great at *your* specific task, like classifying customer emails or writing legal summaries? That's where **fine-tuning** comes in.

## The Big Idea

Fine-tuning means taking a model that's already been trained on a massive general dataset (the **pretrained** model) and continuing to train it on a smaller, specialized dataset. The model keeps all the general language knowledge it already learned and adapts it to your particular needs.

Think of it like hiring an expert. Instead of teaching someone English from scratch, you hire someone who already speaks English fluently and train them on medical terminology. They learn the specialized material much faster because they already have the foundation.

## How It Works

1. **Start with a pretrained model.** This model has already learned grammar, facts, reasoning patterns, and general knowledge from training on billions of words.
2. **Prepare your dataset.** Collect examples of the task you care about. For classification, this might be labeled examples. For text generation, it might be high-quality examples of the style or format you want.
3. **Continue training.** Run the standard training process on your dataset, but typically with a much smaller learning rate (so you don't destroy the useful knowledge already in the model) and for fewer steps.

## Why It Works So Well

Pretrained models learn representations that are broadly useful — understanding of syntax, semantics, world knowledge, and reasoning. These representations transfer remarkably well to new tasks. Fine-tuning adjusts the model just enough to excel at your specific task without losing this general capability. This is called **transfer learning**.

## Types of Fine-Tuning

- **Full fine-tuning:** Update all the model's parameters. Most flexible but requires more compute and risks overfitting on small datasets.
- **Parameter-efficient fine-tuning:** Only update a small fraction of parameters (or add small adapter modules). Methods like [LoRA](/wiki/lora) make fine-tuning practical even on a single GPU.
- **Instruction fine-tuning:** Train the model to follow instructions by providing (instruction, response) pairs. This is how base models become helpful chatbots.

## When to Fine-Tune vs. When to Prompt

Sometimes you can get good results just by writing a clever prompt (few-shot prompting) without any fine-tuning. Fine-tuning is worth it when:

- You have hundreds or thousands of task-specific examples
- You need consistently high performance on a specific format or style
- Latency matters and you can't afford to include many examples in every prompt
- The task requires specialized knowledge not well-represented in the pretraining data

## Related Topics

- [LoRA](/wiki/lora) — the most popular parameter-efficient fine-tuning method
- [RLHF](/wiki/rlhf) — fine-tuning with human preferences instead of examples
- [Backpropagation](/wiki/backpropagation) — the algorithm that makes training (and fine-tuning) work

<!-- tier:undergrad -->

# Fine-Tuning

Fine-tuning adapts a pretrained model $\pi_\text{pre}$ to a target task by continuing optimization on task-specific data. This section covers the mathematical framework, practical considerations, and failure modes.

## Formal Setup

Given a pretrained model with parameters $\theta_\text{pre}$ and a task-specific dataset $\mathcal{D}_\text{ft} = \{(x_i, y_i)\}_{i=1}^N$, fine-tuning solves:

$$\theta_\text{ft} = \arg\min_\theta \; \mathcal{L}_\text{task}(\theta; \mathcal{D}_\text{ft})$$

initialized at $\theta = \theta_\text{pre}$. For language modeling tasks:

$$\mathcal{L}_\text{task}(\theta) = -\frac{1}{N}\sum_{i=1}^{N}\sum_{t=1}^{|y_i|} \log p_\theta(y_{i,t} \mid x_i, y_{i,<t})$$

## Hyperparameter Considerations

Fine-tuning is sensitive to hyperparameters, especially:

**Learning rate.** Typically 10--100x smaller than pretraining. Common ranges:
- Full fine-tuning: $1\times10^{-5}$ to $5\times10^{-5}$
- With small datasets: $1\times10^{-6}$ to $1\times10^{-5}$

A learning rate that's too high causes **catastrophic forgetting** — the model rapidly loses its pretrained knowledge. Too low means slow convergence and insufficient adaptation.

**Epochs.** Usually 1--5 epochs over the fine-tuning data. Overfitting is a major risk, especially with small datasets ($N < 10,000$).

**Batch size.** Smaller batch sizes (8--32) often work well for fine-tuning, providing implicit regularization through gradient noise.

## Feature Extraction vs. Full Fine-Tuning

There's a spectrum of how much of the model to update:

| Approach | Parameters Updated | When to Use |
|---|---|---|
| Feature extraction (frozen) | Only the final head | Very small datasets, simple tasks |
| Last-$k$ layers | Top layers only | Small-medium datasets |
| Full fine-tuning | All parameters | Medium-large datasets, complex tasks |
| [LoRA](/wiki/lora) / adapters | Small added modules | Any dataset size, limited compute |

## Instruction Fine-Tuning

Instruction fine-tuning (IFT) trains the model on (instruction, response) pairs. The key formatting decision is the **chat template**:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

model_name = "meta-llama/Llama-2-7b-hf"
tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForCausalLM.from_pretrained(model_name, torch_dtype=torch.float16)

# Format training examples
def format_example(example):
    text = f"### Instruction:\n{example['instruction']}\n\n### Response:\n{example['response']}"
    tokens = tokenizer(text, truncation=True, max_length=512)
    # Mask instruction tokens from loss computation
    instruction_len = len(tokenizer(f"### Instruction:\n{example['instruction']}\n\n### Response:\n")["input_ids"])
    tokens["labels"] = tokens["input_ids"].copy()
    tokens["labels"][:instruction_len] = [-100] * instruction_len  # ignore in loss
    return tokens

training_args = TrainingArguments(
    output_dir="./ft-model",
    per_device_train_batch_size=8,
    learning_rate=2e-5,
    num_train_epochs=3,
    warmup_ratio=0.1,
    weight_decay=0.01,
    fp16=True,
)

trainer = Trainer(model=model, args=training_args, train_dataset=formatted_dataset)
trainer.train()
```

An important detail: the loss should only be computed on the **response** tokens, not the instruction/prompt tokens. This is done by setting label tokens corresponding to the prompt to `-100` (the ignore index in PyTorch's cross-entropy loss).

## Catastrophic Forgetting

Fine-tuning on a narrow dataset can cause the model to forget general capabilities. Mitigation strategies:

1. **Low learning rate + short training**: minimize parameter changes.
2. **Replay buffer**: mix in a small fraction of general pretraining data.
3. **Regularization**: add an $L_2$ penalty toward the pretrained weights: $\lambda\|\theta - \theta_\text{pre}\|_2^2$.
4. **Parameter-efficient methods**: [LoRA](/wiki/lora) and adapters limit the rank of weight updates, acting as implicit regularization.
5. **Elastic Weight Consolidation (EWC)**: weight the regularization per-parameter by Fisher information.

## Related Topics

- [LoRA](/wiki/lora) — parameter-efficient alternative to full fine-tuning
- [RLHF](/wiki/rlhf) — preference-based fine-tuning for alignment
- [Backpropagation](/wiki/backpropagation) — gradient computation during fine-tuning
- [Tokens](/wiki/tokens) — tokenization choices affect fine-tuning performance

<!-- tier:grad -->

# Fine-Tuning

Fine-tuning is the primary mechanism for specializing foundation models. This section examines the theoretical underpinnings of transfer learning, scaling behavior, and the frontier of fine-tuning research.

## Why Transfer Learning Works

**The feature reuse hypothesis.** Lower layers learn general features (syntax, basic semantics) that transfer across tasks, while upper layers specialize. Merchant et al. (2020) confirmed this for BERT: probing shows linguistic features are concentrated in lower layers, while task-specific representations emerge in upper layers during fine-tuning.

**The loss landscape perspective.** Neyshabur et al. (2020) showed that fine-tuned models stay within a "basin" of the pretrained model's loss landscape. The pretrained initialization biases optimization toward solutions that leverage general features, even when the fine-tuning loss has many minima that don't.

**Formal analysis.** Consider the fine-tuning objective as:

$$\theta_\text{ft} = \arg\min_\theta \; \mathcal{L}_\text{task}(\theta) + \lambda R(\theta, \theta_\text{pre})$$

where $R$ measures distance from the pretrained initialization. Even without explicit regularization ($\lambda=0$), the combination of small learning rate, few epochs, and SGD noise provides implicit regularization toward $\theta_\text{pre}$.

## Scaling Laws for Fine-Tuning

Hernandez et al. (2021) established scaling laws for transfer: the effective data requirement for fine-tuning scales as:

$$D_\text{ft} \propto D_\text{pre}^{\alpha}$$

where $\alpha < 1$, meaning fine-tuning data requirements grow sub-linearly with pretraining data. Empirically, $\alpha \approx 0.4$--$0.6$ for distribution shifts between pretraining and fine-tuning data.

The **compute-optimal** fine-tuning budget depends on the gap between pretraining and target distributions. For in-distribution tasks, a few hundred examples suffice; for significant distribution shifts, thousands to tens of thousands are needed.

## Multi-Task and Continual Fine-Tuning

**Multi-task fine-tuning.** Training on a mixture of tasks simultaneously (FLAN, T0) often outperforms single-task fine-tuning. The key is task diversity and mixing ratios. Chung et al. (2022) showed that scaling the number of fine-tuning tasks improves performance on held-out tasks, with roughly logarithmic returns.

**Continual fine-tuning.** Sequentially fine-tuning on multiple tasks causes catastrophic forgetting. Approaches:
- **Task arithmetic** (Ilharco et al., 2023): represent each task's knowledge as a weight vector $\tau_i = \theta_{\text{ft},i} - \theta_\text{pre}$ and combine via arithmetic: $\theta_\text{multi} = \theta_\text{pre} + \sum_i \lambda_i \tau_i$.
- **Model merging** (Yadav et al., 2023): TIES-Merging resolves interference between task vectors by trimming small values, resolving sign conflicts, and averaging.
- **Orthogonal subspace training**: project gradient updates into subspaces orthogonal to those used by previous tasks.

## Data Quality and Curation

Recent work emphasizes that data quality dominates quantity for fine-tuning:

**LIMA** (Zhou et al., 2023): fine-tuning LLaMA-65B on just 1,000 carefully curated instruction-response pairs produces a model competitive with GPT-4 on many benchmarks. This suggests that pretraining captures most knowledge, and fine-tuning primarily teaches the model a *format* or *style* of interaction.

**Data selection.** Active learning and influence functions can identify the most valuable fine-tuning examples. LESS (Xia et al., 2024) uses gradient-based data selection, choosing fine-tuning examples whose gradient signal most benefits the target task.

## Fine-Tuning as Bayesian Inference

Conceptually, fine-tuning is approximate Bayesian inference where:
- The pretrained model provides the prior $p(\theta)$
- The fine-tuning data provides the likelihood $p(\mathcal{D}|\theta)$
- SGD approximates sampling from the posterior $p(\theta|\mathcal{D})$

This perspective explains why ensembles of fine-tuned models (same pretrained model, different fine-tuning runs) improve calibration and robustness — they approximate the Bayesian model average.

## Emerging Directions

**Representation fine-tuning (ReFT).** Wu et al. (2024) proposed modifying *representations* rather than weights, learning interventions on hidden states that steer model behavior. This is even more parameter-efficient than LoRA and connects to the [mechanistic interpretability](/wiki/mechanistic-interpretability) agenda.

**Alignment tax.** Fine-tuning for alignment (safety, helpfulness) often degrades performance on benchmarks — the "alignment tax." Recent work attempts to minimize this tax through careful training recipes and data mixing.

## Related Topics

- [LoRA](/wiki/lora) — parameter-efficient fine-tuning
- [RLHF](/wiki/rlhf) — preference-based fine-tuning
- [Backpropagation](/wiki/backpropagation) — the gradient computation underlying all fine-tuning
- [RAG](/wiki/rag) — an alternative to fine-tuning for knowledge injection
