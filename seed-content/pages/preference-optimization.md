---
title: Preference Optimization (DPO and friends)
category: training
---
<!-- tier:intro -->
# Preference Optimization

[[rlhf]] taught us that **preference-based fine-tuning** is what turns a base model into a useful assistant. The classical RLHF pipeline (SFT → reward model → PPO) works but is heavy: it requires training a separate reward model, then using reinforcement learning to optimize the policy against it.

**Preference optimization** is a family of techniques that simplify this. Most of them skip the explicit reward model and train the policy directly from preference pairs `(y_chosen, y_rejected)`. The most popular member is **DPO** (Direct Preference Optimization).

This page covers DPO and its variants — IPO, KTO, ORPO. Each tweaks the loss in a different way; each has different empirical properties. The high-level story: by 2024, most open-model post-training pipelines have moved off PPO toward one of these.

<!-- tier:undergrad -->
# Preference Optimization (Undergrad)

## DPO — the canonical recipe

Rafailov et al. (2023) showed that the optimal policy under RLHF has a closed-form expression in terms of the reward and reference policy. Inverting that relationship lets you skip the reward model entirely.

The DPO loss for a preference pair `(y_w, y_l)` (winner, loser) given prompt `x`:

$$\mathcal{L}_{DPO} = -\log \sigma\left(\beta \log \frac{\pi(y_w | x)}{\pi_{\text{ref}}(y_w | x)} - \beta \log \frac{\pi(y_l | x)}{\pi_{\text{ref}}(y_l | x)}\right)$$

Where:
- `π` is the policy being trained
- `π_ref` is the reference policy (typically the SFT model)
- `β` is a temperature controlling regularization toward `π_ref`

Intuition: increase `π(y_w | x)` relative to `π(y_l | x)`, weighted by how much the policy has already moved from the reference. The `β` term keeps the policy close enough to `π_ref` to prevent collapse / reward hacking.

Implementation is much simpler than PPO:
- No reward model
- No value model
- No PPO machinery (advantage estimation, clipping)
- Just the preference loss above + standard backprop

DPO has become the default in most open-model recipes. Hugging Face's TRL library implements it; major open models (Tulu, Zephyr, dozens of Hugging Face fine-tunes) use it.

## When PPO still wins

DPO trains on a static dataset of preferences. PPO can sample from the policy *during* training and use those on-policy samples to update. At frontier scale, this matters: as the policy drifts from `π_ref`, on-policy data better represents what the model is actually doing.

For frontier-class models (Claude, GPT-4) the labs use PPO-style approaches. For most open-model recipes, DPO is good enough and much simpler.

## Variants

**IPO** (Identity Preference Optimization, Azar et al. 2023). Replaces the sigmoid in DPO with a different mapping. Theoretically more robust to overconfident preferences (where the model already strongly prefers the chosen response). Empirically: mixed results. Some teams report IPO helps on small datasets; others see no difference.

**KTO** (Kahneman-Tversky Optimization, Ethayarajh et al. 2024). Trains on individual labels (this output is good / bad) rather than paired comparisons. Useful when paired data is hard to collect — you can collect single-binary feedback at higher volume. Loss is inspired by Kahneman-Tversky utility theory (loss aversion).

**ORPO** (Odds Ratio Preference Optimization, Hong et al. 2024). Combines SFT and preference loss in a single training stage. Removes the need for a separate SFT stage. Practical advantage: one training loop instead of two.

**SimPO** (Simple Preference Optimization, Meng et al. 2024). Drops the reference policy entirely, replacing it with a length-normalized log-likelihood. Simpler still; competitive results in some benchmarks.

In practice, the differences are smaller than the literature implies. Pick DPO unless you have a specific reason. ORPO if you want a single-stage pipeline. KTO if you only have unary labels.

<!-- tier:grad -->
# Preference Optimization (Graduate)

## The KL-regularization story

DPO's β term is implicit KL regularization between `π` and `π_ref`. The full RLHF objective is:

$$\max_\pi \mathbb{E}_x [r(x, y) - \beta D_{KL}(\pi(y|x) || \pi_{\text{ref}}(y|x))]$$

The optimal policy under this objective has a closed-form expression:

$$\pi^*(y|x) = \frac{1}{Z(x)} \pi_{\text{ref}}(y|x) \exp(r(x,y)/\beta)$$

DPO inverts this to express `r` in terms of `π*` and `π_ref`. Plugging into the Bradley-Terry model of preferences gives the DPO loss. The simplification is mathematically exact (under the BT assumption).

The β-temperature controls how far the policy can drift. Small β → strong preference signal, more drift, more reward-hacking risk. Large β → conservative, stays close to `π_ref`. Typical values: β ∈ [0.01, 0.5].

## Limitations of preference-only training

A few subtleties worth knowing:

**Length bias.** DPO and variants tend to make models *more verbose* — longer responses are often the chosen ones in preference data. If your annotators prefer thorough over concise, your fine-tune learns that bias.

**Preference data quality.** The chosen/rejected pairs are only as good as the annotators. Inter-annotator agreement on response quality is low (often 60-70% on subjective tasks). Garbage in, garbage out.

**Mode collapse.** With small β, the policy can collapse onto a few high-reward modes and lose diversity. The reference-policy regularization is partly intended to prevent this.

**No exploration.** PPO can sample new responses during training and learn from them. DPO can only update on the static dataset. For tasks requiring exploration (long-horizon reasoning, creative generation), this matters.

## When to use which

- **DPO**: default for most projects. Simple, fast, works.
- **PPO**: frontier-scale. When you have the infra and want on-policy sampling.
- **ORPO**: when you want to combine SFT + preference in one training stage.
- **KTO**: when you can only collect unary labels (good/bad).
- **Constitutional AI**: when you want automated preference generation. (See [[rlhf]].)

## Key References

- Rafailov et al., "Direct Preference Optimization: Your Language Model is Secretly a Reward Model" (2023)
- Azar et al., "A General Theoretical Paradigm to Understand Learning from Human Preferences" (2023) — IPO
- Ethayarajh et al., "KTO: Model Alignment as Prospect Theoretic Optimization" (2024)
- Hong et al., "ORPO: Monolithic Preference Optimization without Reference Model" (2024)
- Meng et al., "SimPO: Simple Preference Optimization with a Reference-Free Reward" (2024)
