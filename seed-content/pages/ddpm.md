---
title: DDPM (Denoising Diffusion Probabilistic Models)
category: multimodal
---
<!-- tier:intro -->
# DDPM

The original diffusion-as-noise-prediction recipe (Ho et al. 2020). Established the modern framing: forward = add noise, reverse = predict noise, loss = MSE.

DDPM samples in 1000 steps. Subsequent work (DDIM, DPM-Solver) sped this up to 10-50 steps; the underlying training recipe stays the same.

<!-- tier:undergrad -->
# DDPM (Undergrad)

## The training recipe

```python
for batch in data:
    x_0 = batch.images
    t = torch.randint(1, T, (B,))                  # random timestep
    epsilon = torch.randn_like(x_0)                # noise sample
    x_t = sqrt(alpha_bar[t]) * x_0 + sqrt(1 - alpha_bar[t]) * epsilon  # closed-form jump
    
    eps_pred = model(x_t, t)
    loss = F.mse_loss(eps_pred, epsilon)
    loss.backward()
    optimizer.step()
```

That's it. No fancy training tricks. The MSE loss is straightforward; the only complication is the closed-form jump that lets you sample `x_t` for any `t` in O(1).

## Sampling — DDPM ancestral

```python
x = torch.randn(B, 3, H, W)  # start from noise
for t in reversed(range(T)):
    eps_pred = model(x, t)
    mu = (x - beta[t] / sqrt(1 - alpha_bar[t]) * eps_pred) / sqrt(alpha[t])
    if t > 0:
        x = mu + sqrt(beta[t]) * torch.randn_like(x)
    else:
        x = mu
```

1000 steps. Slow. Each step requires a forward pass through the U-Net.

## Why MSE on noise

Predict noise rather than image directly. Why?

1. **Equivalent under reparameterization**: the closed-form jump means predicting noise lets you recover `x_0`. Both formulations work.
2. **Better training stability**: the noise's distribution is roughly stationary across timesteps (always Gaussian); the image distribution shifts substantially. Easier optimization.
3. **Empirical**: DDPM and subsequent work consistently find noise prediction outperforms image prediction.

Some recent work (`x_0` parameterization, `v` parameterization) finds the choice depends on noise schedule + step count. For long schedules + low noise levels, predicting `x_0` directly is sometimes preferred. Frontier-scale recipes use **velocity prediction (`v` = α·ε - σ·x_0)** as a balance.

<!-- tier:grad -->
# DDPM (Grad)

## Noise schedule choice

`β_t` is the per-step noise level. Common schedules:

- **Linear**: `β_t = β_min + (β_max - β_min) · t/T`. DDPM original. β_min=1e-4, β_max=0.02. Works but tail of the schedule wastes capacity (already mostly noise).
- **Cosine**: `ᾱ_t = cos²((t/T + s) / (1+s) · π/2)`. Smoother; better at later timesteps. Improved DDPM (Nichol 2021) showed quality gains.
- **EDM noise levels** (Karras 2022): use noise standard deviations directly rather than β. Cleaner mathematical framing; current SOTA for academic recipes.

For most modern recipes: cosine or EDM. Linear is a baseline; rarely chosen new.

## DDIM — deterministic sampling

DDIM (Song 2020) reformulates sampling as a deterministic ODE solve:

```
x_{t-1} = sqrt(alpha_bar[t-1]) * predicted_x0 + sqrt(1 - alpha_bar[t-1]) * eps_pred
where predicted_x0 = (x_t - sqrt(1 - alpha_bar[t]) * eps_pred) / sqrt(alpha_bar[t])
```

No `σ_t · z` noise injection. Deterministic mapping from initial noise to output. Lets you skip timesteps: 50 DDIM steps gives quality similar to 1000 DDPM steps.

DDIM is the sampling method in most open-source diffusion implementations. Stable Diffusion's default is DDIM-50 or DPM-Solver++ at 20 steps.

## Conditional DDPM

For text-to-image: feed text features into the U-Net via cross-attention layers. The same noise-prediction recipe; just conditioned on text.

For class-conditional: feed class label as an embedding added to time embeddings.

For image-to-image (inpainting, super-resolution): feed the conditioning image through additional conv layers; concat with noisy input. Variants are wide — the diffusion framework is flexible about how conditioning enters.
