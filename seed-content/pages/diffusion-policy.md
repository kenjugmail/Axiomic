---
title: Diffusion Policy
category: robotics
---
<!-- tier:intro -->
# Diffusion Policy

A class of robot policies that use **denoising diffusion models** to generate action sequences.

Chi et al. 2023 (RSS). Standard for modern manipulation policies trained from demonstrations.

**Idea**: instead of predicting a single action `a_t` from observation `o_t`, generate a SEQUENCE of actions `(a_t, a_{t+1}, ..., a_{t+H})` via a diffusion model conditioned on the observation.

**Why it wins over single-action regression**:
- Captures multimodal action distributions (multiple ways to do the same task).
- Sequence-level coherence (no jagged action transitions).
- Smooth + dynamically feasible.

State-of-the-art on many manipulation benchmarks. Used in research at most major robotics labs; emerging in commercial systems.

<!-- tier:undergrad -->
# Diffusion Policy (Undergrad)

## How diffusion models work (quickly)

A diffusion model learns to reverse a noising process:

- Start with clean data.
- Add Gaussian noise progressively over T steps.
- Train a neural network to PREDICT the noise (or equivalently, the denoised data).
- At inference: start from pure noise; iteratively denoise.

The trained network can sample from the data distribution by reversing the noising.

For action sequences: data = action sequences from demos; diffusion samples similar sequences conditional on observation.

## Architecture

**U-Net**: 1D convolutions over the action-sequence dimension. Common.

**Transformer**: attention over action tokens. Used in larger diffusion policies.

**Inputs**:
- Observation `o_t` (image or proprioception).
- Diffusion step `k` (which denoising stage).
- Noisy action sequence `a^k`.

**Output**: predicted noise (or clean action sequence).

## Training

For each demo trajectory:
1. Pick a random sub-window of `H+1` consecutive actions.
2. Sample a random diffusion step `k ∈ [1, T]`.
3. Add noise to the actions at level `k`.
4. Train the network to predict the noise.

Loss: MSE between predicted + true noise.

After training: the network can denoise from any starting point.

## Inference

At deployment:
1. Get observation `o_t`.
2. Sample noise `a^T ∼ N(0, I)`.
3. Iteratively denoise: `a^{T-1} = denoise(a^T, T)`, etc.
4. Final `a^0` is the predicted action sequence.
5. Execute the first few actions; discard the rest; re-predict.

**Inference speed**: 10-100 denoising steps per prediction; typically fast enough for 10+ Hz control.

**DDIM sampling**: faster sampling with fewer steps; trade-off slight accuracy for speed.

## Why it beats single-step BC

**Multimodal demos**: imagine a task where two valid actions exist — turn left or turn right around an obstacle. Single-action regression averages them (go straight, into the obstacle). Diffusion samples one mode.

**Sequence coherence**: predicting a full sequence ensures actions are mutually consistent. Step-by-step prediction can produce sequences that don't make physical sense.

**Smoothness**: diffusion-generated sequences are smooth by construction. Less jitter than single-step regression.

## Variants

**ACT (Action Chunking Transformer)** (Zhao et al. 2023): predicts H=100+ actions via transformer + Gaussian decoder. Not strictly diffusion, but similar action-chunking principle.

**π-0** (Physical Intelligence 2024): flow-matching variant of diffusion. Faster + sometimes better.

**Octo, OpenVLA**: VLAs with diffusion-policy-style action heads.

**Conditional Flow Matching (CFM)**: alternative to diffusion; trained to flow from noise to data via continuous-time ODE. Faster sampling.

## Production status

Diffusion policies are state-of-the-art in research benchmarks. Production deployment:
- Toyota Research uses diffusion policies for manipulation.
- Several robotics startups use π-0-style flow-matching.
- Tesla Optimus's policy reportedly uses diffusion-style action generation.

Foundation-model VLAs increasingly default to diffusion or flow-matching action heads.

<!-- tier:grad -->
# Diffusion Policy (Grad)

## Mathematical formulation

Diffusion model defines a forward noising:
`q(x^k | x^{k-1}) = N(x^k; √(1-β_k) x^{k-1}, β_k I)`

Reverse process (learned):
`p_θ(x^{k-1} | x^k) = N(x^{k-1}; μ_θ(x^k, k), Σ_θ(x^k, k))`

For diffusion policy, condition on observation:
`p_θ(a^{k-1} | a^k, o)`

Training loss (DDPM): predict noise added at each level.
`L = E_{x^0, ε, k} ||ε - ε_θ(x^k, o, k)||²`

## DDIM + faster sampling

Standard DDPM uses many denoising steps (50-1000). DDIM (Denoising Diffusion Implicit Models) provides:

- Deterministic sampling (no noise injection during reverse).
- Fewer steps (10-50) with comparable quality.
- Smooth interpolation in latent space.

**Consistency models** (Song et al. 2023): one-step or few-step generation. Newer; some success in robotics.

For real-time policies, DDIM + 10-20 steps is standard.

## Conditional flow matching

Flow matching is an alternative to diffusion:

- Learn a velocity field that transports noise to data via ODE: `dx/dt = v_θ(x, t, condition)`.
- Train: minimize the difference between learned velocity + true velocity.
- Sample: solve the ODE from noise to data.

**Advantages over diffusion**:
- Faster sampling (fewer ODE steps).
- More flexible conditioning.
- Sometimes higher quality.

**π-0** uses flow matching. Active area; may displace diffusion in robotics.

## Multimodality + diversity

Diffusion captures multimodal distributions naturally. But sometimes you want SPECIFIC modes:

**Classifier guidance**: bias sampling toward modes that satisfy a condition (e.g., minimize energy).

**Classifier-free guidance**: train conditional + unconditional models; combine at inference for stronger conditioning.

**Diffusion + reward-weighted sampling**: weight samples by reward; concentrate on high-reward modes.

These give finer control over which modes are sampled.

## Action-chunking trade-offs

Predicting H actions is more powerful than predicting one, but:

- Longer chunks → more compounding when conditions change.
- Shorter chunks → more frequent re-prediction (computational cost).
- Optimal H depends on task + dynamics: typically 10-50 actions.

Most papers use H=8 to H=100. ACT uses H=100; diffusion policy typically H=8-16.

## Connection to behavior cloning

Diffusion policy is a sophisticated form of behavior cloning. Same training data (demos); different model architecture.

**Limits inherit from BC**:
- Distribution shift (state encountered at deployment differs from training).
- Bias from suboptimal demos.
- No exploration; doesn't generalize beyond demo coverage.

**DAgger-like fixes apply**: collect on-policy data; relabel by expert; re-train.

## Connection to foundation models

Modern VLAs (RT-2, OpenVLA, π-0) use diffusion / flow-matching action heads + foundation-model perception:

- Vision encoder (DINOv2-style) → visual tokens.
- Language encoder → instruction tokens.
- Transformer backbone → action diffusion.
- Diffusion / flow-matching head → action sequence.

The diffusion + foundation-model combination is the current production frontier.

## Open questions

- **Real-time at scale**: 7B+ parameter diffusion policies at 30+ Hz requires careful engineering. Distillation, quantization, chunked inference.
- **Generalization**: diffusion fits the training distribution well. Does it extrapolate?
- **Safety**: when the policy samples a low-probability mode, is it safe? Open question.
- **Multi-modal beyond action**: diffusion in joint latent + action space; richer behavior modeling.

## References

- Chi et al. 2023. *Diffusion policy: visuomotor policy learning via action diffusion*. *RSS*.
- Ho et al. 2020. *Denoising Diffusion Probabilistic Models*. *NeurIPS*.
- Song et al. 2021. *Denoising Diffusion Implicit Models*. *ICLR*. (DDIM.)
- Lipman et al. 2023. *Flow matching for generative modeling*. *ICLR*.
- Zhao et al. 2023. *Learning fine-grained bimanual manipulation with low-cost hardware*. (ACT.)
- Black et al. 2024. *π-0: A vision-language-action flow model for general robot control*. (Physical Intelligence.)
