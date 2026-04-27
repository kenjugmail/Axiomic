---
title: In-Context Learning
category: applications
---
<!-- tier:intro -->
# In-Context Learning

One of the most surprising abilities of large language models is **in-context learning** — the ability to learn new tasks just from examples in the prompt, without any training or parameter updates.

## How It Works

Instead of training the model on labeled data, you just show it a few examples in the prompt:

```
Translate English to French:
cat -> chat
dog -> chien
house -> maison
bird ->
```

The model outputs "oiseau" — it learned the pattern from the examples alone. This is in-context learning (ICL), also known as **few-shot learning**.

## Why This Is Remarkable

The model's parameters don't change at all. It's not being trained. Somehow, the attention mechanism figures out the pattern from the examples and applies it to the new input. This is fundamentally different from how models are traditionally trained.

## Types of In-Context Learning

- **Zero-shot**: no examples, just a task description ("Translate to French: bird")
- **Few-shot**: 2–10 examples shown in the prompt
- **Many-shot**: dozens of examples (possible with long context models)

## Why It Matters

In-context learning is what makes models like ChatGPT useful for general tasks. You don't need to fine-tune a separate model for each task — you just explain what you want and show a few examples.

## Related Topics

- [Attention](/wiki/attention) — the mechanism that enables pattern matching in context
- [Induction Heads](/wiki/induction-heads) — the specific circuit that implements ICL
- [Fine-Tuning](/wiki/fine-tuning) — the traditional alternative to ICL

<!-- tier:undergrad -->
# In-Context Learning

## Formal Definition

Given a pretrained autoregressive model $p_\theta$, in-context learning solves a task by conditioning on demonstration examples $(x_1, y_1), \ldots, (x_k, y_k)$ and a new query $x_{k+1}$:

$$\hat{y}_{k+1} = \arg\max_y p_\theta(y | x_1, y_1, \ldots, x_k, y_k, x_{k+1})$$

No gradient steps are taken. The model's weights $\theta$ remain fixed.

## Scaling with Examples

Performance typically improves log-linearly with the number of examples $k$:

$$\text{accuracy} \propto \log k$$

This holds across many tasks, suggesting a fundamental relationship between context length and learning capacity.

## Implementation

```python
def few_shot_prompt(task_description, examples, query):
    prompt = task_description + "\n\n"
    for x, y in examples:
        prompt += f"{x} -> {y}\n"
    prompt += f"{query} -> "
    return prompt

prompt = few_shot_prompt(
    "Classify sentiment as positive or negative:",
    [("Great movie!", "positive"), ("Terrible service.", "negative")],
    "I loved it!"
)
# Model completes with "positive"
```

## Why Does ICL Work?

Two competing hypotheses:
1. **Bayesian inference**: the model implicitly performs Bayesian inference over tasks, selecting the most likely task given the examples
2. **Gradient descent in context**: attention layers implement an implicit gradient descent step on the examples

## Related Topics

- [Induction Heads](/wiki/induction-heads) — the circuit behind ICL
- [Attention](/wiki/attention) — enables flexible input processing

<!-- tier:grad -->
# In-Context Learning

## Theoretical Foundations

**The Bayesian view** (Xie et al., 2022): If pretraining data is a mixture of tasks, then the autoregressive objective incentivizes models to infer the latent task from examples. Formally, if documents are generated as $d \sim p(d | z)$ for latent task $z$, then the optimal predictor marginalizes over tasks: $p(y|x, \text{context}) = \sum_z p(y|x, z) p(z|\text{context})$.

**Transformers as gradient descent** (Von Oswald et al., 2023): A single transformer attention layer can implement one step of gradient descent on a linear regression problem. The construction uses the fact that $\text{softmax}(QK^T)V$ can approximate $V - \eta K^T(KV - Y)$ with appropriate parameterization. This suggests that deep transformers implement multi-step optimization in their forward pass.

## The Induction Head Mechanism

Olsson et al. (2022) identified **induction heads** as the primary circuit for ICL. The two-head circuit:
1. **Previous-token head**: in layer $L-1$, attends to the previous position of a pattern
2. **Induction head**: in layer $L$, copies the token that followed the matched pattern

This circuit explains both copying behavior (repeating patterns from context) and more abstract ICL. The formation of induction heads during training correlates with a phase transition in in-context learning capability.

## Limitations and Failure Modes

- **Task ambiguity**: when examples are consistent with multiple tasks, models may infer the wrong one
- **Label flipping**: models partially rely on input-output format matching, not just the demonstrated relationship
- **Recency bias**: later examples have more influence than earlier ones
- **Irrelevant context**: random labels can still improve format-following without teaching the task

## Related Topics

- [Induction Heads](/wiki/induction-heads) — the circuit mechanism
- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — how ICL is studied
- [Fine-Tuning](/wiki/fine-tuning) — alternative when ICL is insufficient
