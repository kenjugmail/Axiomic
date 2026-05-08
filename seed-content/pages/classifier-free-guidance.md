---
title: Classifier-Free Guidance (CFG)
category: multimodal
---
<!-- tier:intro -->
# Classifier-Free Guidance

The trick that makes text-to-image models actually follow prompts. Without CFG, conditional diffusion models often ignore part of the prompt; with CFG, they sharply track it.

Train the model to predict noise both with and without conditioning. At sampling time, **extrapolate** between the two:

```
eps = eps_uncond + scale · (eps_cond - eps_uncond)
```

`scale > 1` amplifies the conditioning direction.

<!-- tier:undergrad -->
# CFG (Undergrad)

## Why naive conditioning isn't enough

A diffusion model trained with conditioning still has the option to ignore it. The conditional prediction `ε_θ(x_t, t, c)` and unconditional `ε_θ(x_t, t, ∅)` may produce similar outputs because:
- The model can score similarly well on training data either way.
- Conditioning gradients are weaker than the dominant denoising signal.

Result: prompts get partially followed. 'A photo of a corgi wearing a hat' → corgi, hat — but they're not always together.

## The CFG recipe

**Training**: randomly drop the conditioning ~10% of the time (replace with a special null token). The same model learns both `p(x | c)` and `p(x)`.

**Sampling**: compute both predictions; extrapolate:

```
eps = eps_uncond + scale · (eps_cond - eps_uncond)
```

`scale` is the **CFG scale** (also called guidance strength). Typical: 7-9. Too low → conditional ignored. Too high → over-saturated, distorted images.

## Mathematical view

CFG is a sampling-time intervention; no training-time math change. It samples from a sharper distribution:

```
p_guided(x | c) ∝ p(x | c)^scale · p(x)^(1 - scale)
```

For `scale > 1`, the conditional is amplified relative to the unconditional. The model is pushed harder along the conditioning direction.

This isn't sampling from `p(x | c)` directly; it's sampling from a distorted version of it. The distortion is what makes prompts followed strongly. Without it, vanilla sampling would give the underlying conditional which sometimes ignores parts of the prompt.

## Trade-offs

- **Low scale (1-3)**: weak prompt following; naturalistic but might miss specifics.
- **Standard (7-9)**: strong prompt following; balanced quality.
- **High (12-15)**: very strong following; over-saturated; less diverse.
- **Very high (20+)**: artifacts; characteristic CFG over-saturation.

The right scale depends on the prompt complexity, model, and aesthetic goal. Most production use scale 7 as default and tune up for complex prompts.

<!-- tier:grad -->
# CFG (Grad)

## Negative prompts

CFG can also push the model **away from** unwanted features. **Negative prompts** are conditional inputs the model is steered away from:

```
eps_neg = unet(x_t, t, negative_prompt)
eps_cond = unet(x_t, t, prompt)
eps_uncond = unet(x_t, t, empty)
eps = eps_uncond + scale · (eps_cond - eps_uncond) - neg_scale · (eps_neg - eps_uncond)
```

Common negative prompts: 'blurry, distorted, low quality, duplicate'. Pushes the model away from those characteristics.

In practice, just replacing the unconditional with the negative prompt's prediction is sufficient — same effect, simpler implementation.

## Dynamic CFG scheduling

Recent work shows CFG benefits from per-timestep scaling:
- **Higher scale early**: when noise is high, a stronger push toward the conditional helps lock in composition.
- **Lower scale late**: when refining details, weaker guidance preserves naturalism.

Linear or cosine schedules from scale=10 down to scale=4 over the sampling trajectory. SDXL refiner uses dynamic CFG; some custom samplers expose this directly.

## Beyond CFG

- **Classifier guidance** (Dhariwal 2021): trained explicit classifier; gradient pushes generation toward the class. CFG replaced this; classifier-based has the disadvantage of needing a separate classifier per task.
- **Conditional flow matching**: alternative training objective; sometimes doesn't need CFG.
- **Aesthetic score** / **CLIP guidance**: use a CLIP score as auxiliary guidance during sampling. Niche; helpful for stylized outputs.

For most current applications: standard CFG with scale 7-9 is the right default. Negative prompts help for known aesthetic problems. Dynamic scheduling is a nice-to-have.
