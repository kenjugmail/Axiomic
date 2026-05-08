---
title: Diffusion Models
category: multimodal
---
<!-- tier:intro -->
# Diffusion Models

The dominant architecture for image (and increasingly video, audio) generation. Stable Diffusion, DALL-E, Midjourney, Sora — all diffusion under the hood.

Train a network to undo Gaussian noise added to an image. At sampling time, start from random noise; iteratively denoise; end with a generated image.

<!-- tier:undergrad -->
# Diffusion (Undergrad)

## Forward process

Add Gaussian noise to a real image over many steps:

```
x_t = sqrt(1 - β_t) · x_{t-1} + sqrt(β_t) · ε,  ε ~ N(0, I)
```

After ~1000 steps, `x_T ≈ N(0, I)` — pure noise.

**Closed-form jump**: sample `x_t` directly from `x_0`:

```
x_t = sqrt(ᾱ_t) · x_0 + sqrt(1 - ᾱ_t) · ε
```

where `ᾱ_t = ∏ α_s = ∏ (1 - β_s)`. This is what makes training tractable.

## Reverse process

Train a network to predict the noise that was added. Given `x_t` and `t`, output `ε̂_θ(x_t, t) ≈ ε`.

Loss is simple MSE:

```
L = E[||ε̂_θ(x_t, t) - ε||²]   where x_t is sampled via the closed-form jump
```

At sampling time, iteratively reverse:
```
x_T = N(0, I)
for t = T, T-1, ..., 1:
    ε_pred = model(x_t, t)
    x_{t-1} = (x_t - β_t/sqrt(1-ᾱ_t) · ε_pred) / sqrt(α_t) + σ_t · z
```

Hundreds of forward passes per generated image. Slow; sped up by DDIM, DPM-Solver, distillation.

## U-Net architecture

The network is typically a **U-Net**: encoder downsampling + decoder upsampling with skip connections. Time `t` is encoded as a sinusoidal vector and added to each layer's activations.

For text-to-image: cross-attention layers in the U-Net attend to text encoder features. Standard in Stable Diffusion.

<!-- tier:grad -->
# Diffusion (Grad)

## Score matching equivalence

Diffusion can be reformulated as **score matching**: estimating `∇_x log p(x)` of the data distribution. The score function points toward higher-probability regions.

Training the noise predictor `ε_θ(x_t, t)` is equivalent (up to a constant) to estimating the score `s_θ(x_t, t) = -ε_θ(x_t, t) / σ_t`.

**The continuous-time view** (Song & Ermon 2020): diffusion is a stochastic differential equation (SDE). The forward SDE adds noise; the reverse SDE samples from data. This unifies score-matching and diffusion under one framework, enables tools from numerical SDE integration for fast sampling.

## Sampling speedups

- **DDIM** (Song 2020): deterministic sampling that subsamples timesteps. 50 steps ≈ 1000 DDPM steps in quality.
- **DPM-Solver** (Lu 2022): higher-order ODE solver. 10-20 steps achievable.
- **Distillation** (Salimans 2022, LCM): train a 'student' to match many-step sampling in 1-4 steps.
- **Consistency models** (Song 2023): single-step sampling at modest quality cost.

For production text-to-image: 20-50 step DPM-Solver or DDIM is the sweet spot. Quality saturates; speed matters.

## Latent diffusion

Operating on raw pixels at 512×512 is computationally enormous. **Latent diffusion** (Rombach 2022, Stable Diffusion):

1. **VAE encoder**: 512×512×3 → 64×64×4 latent. ~48× downsampling.
2. **Diffusion U-Net**: operates on the 64×64 latent.
3. **VAE decoder**: latent → image at the end.

Cuts compute by 48×; quality preserved because the VAE captures perceptual content.

This architectural insight is what made consumer-deployable text-to-image possible. Without it, Stable Diffusion would need multi-GPU clusters; with it, runs on a 12GB consumer GPU.

## Recent developments

- **Rectified Flow** (Liu 2022, used in SD3 and FLUX): straighten the probability flow path; reduces sampling steps needed.
- **EDM** (Karras 2022): improved noise schedules and sampling tricks; current open-source SOTA recipe.
- **Diffusion Transformers (DiT, MM-DiT)**: replace the U-Net with a transformer. Used in SD3 and Sora; scales better.

For modern open-source generation: DiT-based models with rectified flow training are the cutting edge. U-Net-based remain common for established tooling.
