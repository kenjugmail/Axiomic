---
title: Superposition
category: interpretability
---
<!-- tier:intro -->

# Superposition

Here's a puzzle: a language model's internal representation at any point might be a vector with, say, 768 numbers. But the model seems to "know" far more than 768 things simultaneously — it tracks grammar, meaning, tone, facts, and much more. How does it fit so much information into so few numbers?

The answer is **superposition** — the network's strategy of cramming many more concepts into a space than the space has dimensions, by overlapping them.

## An Everyday Analogy

Imagine you have a bulletin board with room for 10 sticky notes, but you need to track 100 things. One strategy: write multiple items on each note using different colored inks. Most of the time you only need a few items at once, so you can usually read what you need without too much confusion. Occasionally the colors overlap and things get garbled — but on average, it works surprisingly well.

Neural networks do something similar. Each "direction" in the 768-dimensional space can represent a concept, and because the network rarely needs all concepts active simultaneously, it can pack many concepts into overlapping directions with minimal interference.

## Why Does This Happen?

Superposition happens because:

1. **There are more concepts than dimensions.** The world is complicated. A model needs to represent thousands of features (parts of speech, topics, sentiment, factual knowledge...) but has limited dimensions per layer.
2. **Features are sparse.** Any given input only activates a small fraction of all possible features. A sentence about cooking doesn't activate sports features, and vice versa. This sparsity makes overlapping representations workable.
3. **The model learns to tolerate small errors.** Some interference between overlapping features is acceptable if it makes the overall system more capable.

## Why Interpretability Researchers Care

Superposition is the main reason that looking at individual neurons in a neural network is often uninformative. A single neuron doesn't correspond to a single clean concept — instead, it participates in representing many concepts at once. This phenomenon is called **polysemanticity** (one neuron, many meanings).

This makes understanding neural networks much harder. If we want to find "the neuron that detects sarcasm," we'll be disappointed — sarcasm might be spread across dozens of neurons, all of which also participate in representing other things.

## Can We Undo Superposition?

Researchers are actively working on techniques to "disentangle" superposed representations — pulling apart the overlapping features into clean, separate components. **Sparse autoencoders** are the most promising approach so far, and they've had some impressive successes in identifying clear, interpretable features even in large models.

## Related Topics

- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — the field working to understand model internals despite superposition
- [Induction Heads](/wiki/induction-heads) — a circuit that can be understood even in the presence of superposition
- [Embeddings](/wiki/embeddings) — the vector representations where superposition occurs

<!-- tier:undergrad -->

# Superposition

Superposition (Elhage et al., 2022, "Toy Models of Superposition") refers to neural networks representing more features than they have dimensions, using non-orthogonal directions in activation space. This section formalizes the phenomenon and its consequences.

## The Geometry of Superposition

Consider a model with $d$-dimensional representations that needs to encode $n \gg d$ binary features. If features were represented as orthogonal directions, the model could only represent $d$ features. But if features are **sparse** (each feature is active with probability $p \ll 1$), the model can represent up to exponentially many features by using nearly-orthogonal directions.

In a $d$-dimensional space, one can find approximately $\exp(c \cdot d)$ vectors with pairwise absolute dot products below $\epsilon$ (the Johnson-Lindenstrauss lemma gives the precise bounds). Superposition exploits this geometric fact.

## Toy Model of Superposition

Elhage et al. (2022) studied a minimal model: an autoencoder with bottleneck dimension $d < n$:

$$\hat{\mathbf{x}} = \mathbf{W}^\top \text{ReLU}(\mathbf{W} \mathbf{x} + \mathbf{b})$$

where $\mathbf{x} \in \mathbb{R}^n$ is a sparse input vector and $\mathbf{W} \in \mathbb{R}^{d \times n}$. The loss is weighted reconstruction error:

$$\mathcal{L} = \sum_{i=1}^{n} S_i \, \mathbb{E}\left[(x_i - \hat{x}_i)^2\right]$$

where $S_i$ is the importance of feature $i$. Key findings:

1. **Phase transitions.** As sparsity increases (lower $p$), features transition from being excluded (not represented) to being represented in superposition.
2. **Importance matters.** More important features get dedicated dimensions; less important ones are represented in superposition.
3. **Geometric structure.** Features in superposition arrange into specific geometric configurations (antipodal pairs, triangles, pentagons, etc.) that minimize interference.

## Interference and Polysemanticity

When features $i$ and $j$ are represented as non-orthogonal directions $\mathbf{w}_i, \mathbf{w}_j$, activating feature $i$ creates interference on feature $j$:

$$\text{interference}_{j \leftarrow i} = (\mathbf{w}_i \cdot \mathbf{w}_j) \cdot x_i$$

This interference is tolerable when:
- Features are sparse (rarely co-active, so interference is rare)
- The dot product $|\mathbf{w}_i \cdot \mathbf{w}_j|$ is small (nearly orthogonal)
- The downstream computation is robust to small perturbations

**Polysemanticity** is the observable consequence: a single neuron $k$ responds to multiple unrelated concepts because the column of $\mathbf{W}$ corresponding to neuron $k$ has nonzero projections onto multiple feature directions.

## Sparse Autoencoders: Reversing Superposition

To extract the underlying features from superposed representations, we train a sparse autoencoder (SAE) with dictionary size $m \gg d$:

$$\mathbf{f} = \text{ReLU}(\mathbf{W}_\text{enc}(\mathbf{x} - \mathbf{b}_\text{dec}) + \mathbf{b}_\text{enc})$$
$$\hat{\mathbf{x}} = \mathbf{W}_\text{dec} \mathbf{f} + \mathbf{b}_\text{dec}$$

$$\mathcal{L} = \|\mathbf{x} - \hat{\mathbf{x}}\|_2^2 + \lambda \|\mathbf{f}\|_1$$

```python
import torch
import torch.nn as nn

class SparseAutoencoder(nn.Module):
    def __init__(self, d_model, n_features, l1_coeff=1e-3):
        super().__init__()
        self.encoder = nn.Linear(d_model, n_features)
        self.decoder = nn.Linear(n_features, d_model, bias=True)
        self.l1_coeff = l1_coeff
        # Tie decoder columns to unit norm
        with torch.no_grad():
            self.decoder.weight.data = nn.functional.normalize(
                self.decoder.weight.data, dim=0
            )

    def forward(self, x):
        # Subtract decoder bias before encoding
        x_centered = x - self.decoder.bias
        f = torch.relu(self.encoder(x_centered))
        x_hat = self.decoder(f)  # bias added by nn.Linear
        # Losses
        recon_loss = (x - x_hat).pow(2).sum(-1).mean()
        l1_loss = self.l1_coeff * f.abs().sum(-1).mean()
        return x_hat, f, recon_loss + l1_loss
```

The $L_1$ penalty encourages sparse activations, and each column of $\mathbf{W}_\text{dec}$ ideally corresponds to a single interpretable feature.

## Related Topics

- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — using SAEs for model analysis
- [Induction Heads](/wiki/induction-heads) — circuits analyzed in the presence of superposition
- [Embeddings](/wiki/embeddings) — where superposition begins

<!-- tier:grad -->

# Superposition

The superposition hypothesis (Elhage et al., 2022) has become a central theoretical framework for understanding neural network representations. This section covers the mathematical foundations, empirical evidence at scale, and open questions.

## Mathematical Framework

### Optimal Packing in $\mathbb{R}^d$

The problem of representing $n$ features in $d$ dimensions reduces to finding a set of unit vectors $\{\mathbf{w}_1, \ldots, \mathbf{w}_n\} \subset S^{d-1}$ that minimizes expected interference given feature sparsity and importance.

For two features with importance $S_1, S_2$, sparsity $p$, and dot product $\cos\theta$, the expected loss is approximately:

$$\mathcal{L} \approx \underbrace{(1 - \|\mathbf{w}_1\|^2)^2 S_1 p + (1 - \|\mathbf{w}_2\|^2)^2 S_2 p}_{\text{representation error}} + \underbrace{|\mathbf{w}_1 \cdot \mathbf{w}_2|^2 (S_1 + S_2) p^2}_{\text{interference cost}}$$

The interference term scales as $p^2$ (both features must be active), explaining why superposition becomes favorable as sparsity increases.

### Connection to Compressed Sensing

Superposition is closely related to compressed sensing (Candes & Tao, 2005). Both involve recovering a sparse signal from a lower-dimensional measurement. The key difference: in compressed sensing, the measurement matrix is fixed (often random); in superposition, the "measurement matrix" (weights) is *learned* to be optimal for the distribution.

The restricted isometry property (RIP) from compressed sensing provides bounds: if $\mathbf{W}$ satisfies $(2s)$-RIP with constant $\delta_{2s} < \sqrt{2}-1$, then any $s$-sparse feature vector can be recovered exactly. This suggests theoretical limits on how many features a network can represent in superposition.

## Empirical Findings at Scale

### Scaling Sparse Autoencoders

Templeton et al. (2024) trained SAEs on Claude 3 Sonnet's residual stream activations with dictionary sizes up to 34 million features. Key findings:

- Features range from concrete (specific people, places, code patterns) to abstract (deception, ethical reasoning, uncertainty).
- **Feature absorption**: some features that should be distinct get merged into a single SAE feature. This is an artifact of SAE training, not a property of the underlying representation.
- **Feature splitting**: increasing dictionary size reveals finer-grained features. "Python code" at small dictionary sizes splits into "Python list comprehension," "Python decorator syntax," etc. at larger sizes.

### Superposition and Model Scale

Larger models appear to have less superposition — they have enough dimensions to represent important features in dedicated (or near-orthogonal) directions. Bricken et al. (2023) found that SAE features are more cleanly interpretable for larger models, consistent with reduced superposition.

However, this doesn't mean large models avoid superposition entirely. As model capacity increases, the number of features the model attempts to represent also increases, potentially maintaining a constant or growing degree of superposition.

## Superposition Phases

Elhage et al. (2022) identified distinct representational phases as a function of feature sparsity and importance:

1. **Dense regime** ($p \to 1$): features compete for orthogonal dimensions. Only the top-$d$ most important features are represented.
2. **Intermediate regime**: important features get dedicated dimensions; less important features enter superposition, arranged in geometric structures (polytopes) that minimize mutual interference.
3. **Sparse regime** ($p \to 0$): almost all features are represented, heavily superposed, with near-optimal packing.

The transitions between phases can be sharp, suggesting a connection to phase transitions in statistical physics.

## Superposition and Computation

A critical distinction: **superposition of representation** vs. **superposition of computation** (Vaintrob et al., 2024).

- **Representational superposition**: multiple features stored in the same activation space (well-studied via toy models and SAEs).
- **Computational superposition**: a single neural network component (e.g., an MLP neuron) performs different computations depending on which features are active. A neuron might compute "is this a question?" when feature A is active but "is this noun plural?" when feature B is active.

Computational superposition is harder to study and may require new tools beyond SAEs.

## Open Questions

1. **Superposition and generalization.** Does superposition help or hurt generalization? One view: superposition is a form of implicit regularization, forcing the network to learn shared structure. Counter-view: interference from superposition causes systematic errors.

2. **Phase transitions in real networks.** The clean phase transitions from toy models may not appear in real networks where features have complex correlations (not independent).

3. **Beyond $L_1$ sparsity.** $L_1$ penalties in SAEs encourage a specific sparsity pattern. Alternative penalties ($L_0$, group sparsity) or architectural changes (top-$k$ activations, as in Gao et al., 2024) may better match the true structure of superposition.

4. **Theoretical limits.** What is the fundamental capacity of a $d$-dimensional representation with $s$-sparse features? How does this interact with the depth and width of the network?

## Related Topics

- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — applying disentangled features to understand model behavior
- [Induction Heads](/wiki/induction-heads) — circuits operating within superposed representations
- [Embeddings](/wiki/embeddings) — the initial vector space where superposition begins
