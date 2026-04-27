---
title: Mechanistic Interpretability
category: interpretability
---
<!-- tier:intro -->

# Mechanistic Interpretability

When a language model answers a question or writes a poem, something is happening inside its billions of parameters — but what? **Mechanistic interpretability** is the field dedicated to reverse-engineering neural networks to understand exactly *how* they compute their outputs, not just *what* they output.

## Why Does It Matter?

Think of a neural network like a complex machine with millions of tiny gears. We built the machine and we know what each gear looks like individually (it's a number, a weight). But we don't know how the gears work *together* to produce intelligent behavior. That's a problem for several reasons:

1. **Safety.** If we can't understand what a model is doing internally, we can't predict when it will fail dangerously.
2. **Trust.** Doctors, judges, and engineers need to understand *why* an AI made a recommendation, not just what it recommended.
3. **Science.** These networks might have discovered genuinely novel algorithms for processing language. Understanding them advances computer science itself.

## The Approach: Circuits and Features

Mechanistic interpretability researchers think about neural networks in terms of **features** and **circuits**:

- A **feature** is a meaningful pattern that a neuron or group of neurons responds to. For example, one neuron might activate strongly whenever the input discusses sports, while another fires for text about cooking.
- A **circuit** is a connected pathway through the network that performs a specific computation. For example, a circuit might detect that a sentence contains a name, then route that information to help predict the next word.

The goal is to map out these features and circuits the way a biologist maps out cell types and neural pathways in the brain.

## How Researchers Do It

The main techniques include:

- **Probing.** Feed specific inputs and observe which internal components activate. It's like putting dye into a river to see where the water flows.
- **Ablation.** Turn off specific components (set their outputs to zero) and see what breaks. If removing a component destroys the model's ability to do math, that component was important for math.
- **Activation patching.** Run the model on two different inputs, then swap internal activations between them to pinpoint which components carry which information.

## A Young but Rapidly Growing Field

Mechanistic interpretability is still in its early stages. Researchers have successfully reverse-engineered small circuits — like how models copy words, detect syntax, or retrieve factual associations — but fully understanding an entire large model remains an open challenge.

## Related Topics

- [Induction Heads](/wiki/induction-heads) — one of the best-understood circuits in transformers
- [Superposition](/wiki/superposition) — a major obstacle to interpretability
- [Attention](/wiki/attention) — the mechanism most often analyzed in interpretability work

<!-- tier:undergrad -->

# Mechanistic Interpretability

Mechanistic interpretability aims to decompose neural network computations into human-understandable components. This section covers the core technical toolkit.

## The Residual Stream View

A key conceptual framework (Elhage et al., 2021): in a transformer, each token position maintains a **residual stream** vector $\mathbf{x} \in \mathbb{R}^d$ that gets additively updated by each layer:

$$\mathbf{x}^{(l)} = \mathbf{x}^{(0)} + \sum_{i=1}^{l} \left(\text{Attn}^{(i)}(\mathbf{x}^{(i-1)}) + \text{MLP}^{(i)}(\mathbf{x}^{(i-1)})\right)$$

This additive structure means each attention head and MLP layer writes a vector into the residual stream. Different components can be analyzed independently because they communicate through this shared stream.

## Logit Attribution

To understand which components influence the model's output, we decompose the final logit for token $v$:

$$\text{logit}_v = \mathbf{W}_U[v] \cdot \mathbf{x}^{(L)} = \mathbf{W}_U[v] \cdot \left(\mathbf{x}^{(0)} + \sum_l \text{Attn}^{(l)} + \sum_l \text{MLP}^{(l)}\right)$$

Each term $\mathbf{W}_U[v] \cdot \text{Attn}^{(l)}$ gives the **direct logit attribution** of attention layer $l$ to the prediction of token $v$. This decomposes the model's prediction into per-component contributions.

## Activation Patching

Activation patching (also called causal tracing) identifies which components carry specific information:

1. Run the model on a **clean** input $x$ and cache all activations.
2. Run the model on a **corrupted** input $x'$ (e.g., with a key fact changed).
3. For each component, replace its activation in the corrupted run with the clean activation and measure how much the output recovers.

The recovery metric is typically:

$$\text{Patching Effect} = \frac{\text{logit}_\text{patched} - \text{logit}_\text{corrupted}}{\text{logit}_\text{clean} - \text{logit}_\text{corrupted}}$$

A value near 1.0 means that component is sufficient to restore the correct behavior.

```python
import torch
from transformer_lens import HookedTransformer

model = HookedTransformer.from_pretrained("gpt2-small")

clean_prompt = "The Eiffel Tower is located in"
corrupt_prompt = "The Colosseum is located in"

# Cache clean activations
_, clean_cache = model.run_with_cache(clean_prompt)

# Define patching hook
def patch_hook(activation, hook, clean_act):
    activation[:] = clean_act
    return activation

# Patch each layer's residual stream and measure effect on " Paris" logit
paris_token = model.to_single_token(" Paris")
results = []
for layer in range(model.cfg.n_layers):
    hook_fn = lambda act, hook, ca=clean_cache[f"blocks.{layer}.hook_resid_post"]: patch_hook(act, hook, ca)
    patched_logits = model.run_with_hooks(
        corrupt_prompt,
        fwd_hooks=[(f"blocks.{layer}.hook_resid_post", hook_fn)]
    )
    results.append(patched_logits[0, -1, paris_token].item())
```

## Probing Classifiers

A **probe** is a simple model (often linear) trained to extract information from intermediate representations:

$$\hat{y} = \mathbf{W}_\text{probe} \, \mathbf{x}^{(l)} + \mathbf{b}$$

If a linear probe achieves high accuracy (e.g., predicting part-of-speech from layer 3 activations), the information is said to be **linearly represented** at that layer. The simplicity of the probe matters — a powerful nonlinear probe might extract information the network itself doesn't use.

## Attention Head Analysis

Each attention head computes:

$$\text{head}_{h}^{(l)} = \text{softmax}\!\left(\frac{\mathbf{Q}\mathbf{K}^\top}{\sqrt{d_k}}\right)\mathbf{V}$$

Interpretable attention patterns include:
- **Previous token heads**: attend to position $i-1$
- **Induction heads**: attend to tokens that follow a previous copy of the current token
- **Duplicate token heads**: attend to earlier copies of the same token

## Related Topics

- [Induction Heads](/wiki/induction-heads) — a fully reverse-engineered circuit
- [Superposition](/wiki/superposition) — why individual neurons are hard to interpret
- [Attention](/wiki/attention) — the mathematical foundation of attention heads

<!-- tier:grad -->

# Mechanistic Interpretability

Mechanistic interpretability has matured from a niche research direction to a central pillar of AI safety research, with dedicated teams at Anthropic, DeepMind, OpenAI, and academic labs. This section covers the frontier.

## Theoretical Foundations

**The linear representation hypothesis** (Park et al., 2023): features in neural networks tend to be represented as directions in activation space, not individual neurons. This has important consequences:

1. Features can be extracted via linear probes.
2. Feature arithmetic works (e.g., "king - man + woman ≈ queen").
3. Superposition is possible because directions can pack more features than dimensions.

**Universality hypothesis** (Olah et al., 2020): different models trained on similar data learn similar features and circuits. Evidence includes the convergence of early-layer features across vision models and the independent discovery of induction heads in various transformer architectures.

## Sparse Autoencoders for Feature Extraction

Bricken et al. (2023) and Cunningham et al. (2023) introduced **sparse autoencoders (SAEs)** to decompose superposed representations into interpretable features:

$$\mathbf{f} = \text{ReLU}(\mathbf{W}_\text{enc}(\mathbf{x} - \mathbf{b}_\text{dec}) + \mathbf{b}_\text{enc})$$
$$\hat{\mathbf{x}} = \mathbf{W}_\text{dec} \mathbf{f} + \mathbf{b}_\text{dec}$$

with a sparsity penalty $\lambda \|\mathbf{f}\|_1$ added to the reconstruction loss. Each column of $\mathbf{W}_\text{dec}$ corresponds to a learned feature direction. Templeton et al. (2024) scaled this to Claude 3 Sonnet, extracting millions of interpretable features including abstract concepts like "deception," "code bugs," and "Golden Gate Bridge."

Key challenges with SAEs:
- **Feature splitting**: a single concept may be represented by multiple SAE features at different granularities.
- **Dead features**: many dictionary elements never activate, wasting capacity.
- **Reconstruction fidelity vs. interpretability trade-off**: sparser codes are more interpretable but less faithful.

## Circuit Discovery at Scale

**Automated circuit discovery.** Manual circuit analysis doesn't scale. Recent approaches include:
- **ACDC** (Conmy et al., 2023): automatically identifies minimal circuits via iterative edge pruning with activation patching.
- **Attribution patching** (Neel Nanda, 2023): approximates activation patching using gradients, enabling much faster circuit identification.
- **Subnetwork probing** (Cao et al., 2021): learns binary masks over components to find task-specific subnetworks.

**Circuit universality.** Merullo et al. (2024) found that factual recall circuits in different model families (GPT-2, Pythia, LLaMA) share structural similarities: early attention heads identify the subject entity, middle MLPs store factual associations, and late attention heads route the retrieved fact to the output.

## Intervention-Based Approaches

Beyond passive observation, researchers actively intervene on model internals:

**Steering vectors.** Subtracting or adding feature directions to activations can control model behavior. Turner et al. (2023) showed that adding "sycophancy" or "honesty" directions to residual streams at inference time predictably shifts model outputs. This connects interpretability to alignment — if we can identify the feature for "deceptive behavior," we can potentially suppress it.

**Representation engineering** (Zou et al., 2023): identifies "concept vectors" via contrastive activation differences and uses them for both monitoring and control. Unlike probing, this approach enables causal interventions.

## Open Problems and Limitations

1. **Compositional circuits.** We understand individual circuits, but how do they compose? The interaction between the induction circuit and factual recall circuit when processing complex prompts remains poorly understood.

2. **Feature geometry.** Are features always linear directions? Evidence for nonlinear features exists (e.g., circular features for periodic concepts like days of the week; Engels et al., 2024), challenging the linear representation hypothesis.

3. **Scaling interpretability.** Current deep-dive analyses cover models up to ~7B parameters. Whether the same techniques apply to 100B+ parameter models, or whether qualitatively new phenomena emerge, is unknown.

4. **Validating interpretations.** How do we know an interpretation is correct? Proposed criteria include counterfactual faithfulness (does intervening on the identified mechanism produce predicted behavior changes?) and completeness (does the explanation account for all model behavior on the task?).

## Related Topics

- [Induction Heads](/wiki/induction-heads) — the canonical example of a fully understood circuit
- [Superposition](/wiki/superposition) — the central obstacle to neuron-level interpretability
- [RLHF](/wiki/rlhf) — how interpretability informs and evaluates alignment training
