---
title: Stable Diffusion
category: multimodal
---
<!-- tier:intro -->
# Stable Diffusion

The canonical open-source text-to-image model (Rombach et al. 2022, Stability AI). Built on **latent diffusion**: do diffusion in a VAE's compressed latent space rather than raw pixels. ~48× compute savings; runs on consumer GPUs.

Variants: SD 1.5, SD 2, SDXL, SD3, FLUX. Each iteration improves quality, prompt-following, and resolution.

<!-- tier:undergrad -->
# Stable Diffusion (Undergrad)

## Architecture

Three components:

**1. VAE encoder + decoder.**
- Encoder: 512×512×3 image → 64×64×4 latent.
- Decoder: latent → image at the end.
- Pretrained separately; frozen during diffusion training.
- ~48× spatial compression; quality preserved because the VAE captures perceptual content.

**2. Diffusion U-Net (~860M params for SD 1.5).**
- Operates on the 64×64 latent.
- Cross-attention layers attend to text features at multiple scales.
- Trained with the standard DDPM objective: predict the noise added to a latent.

**3. Text encoder (CLIP ViT-L/14).**
- Encodes the prompt into 77 token embeddings.
- Frozen during diffusion training.
- SDXL adds a second encoder (CLIP-G); SD3 uses T5-XXL.

## Sampling pipeline

```
prompt → text encoder → text features
latent = N(0, I)                          # 64×64×4
for t in reversed(timesteps):
    eps_cond = unet(latent, t, text_features)
    eps_uncond = unet(latent, t, empty_text)
    eps = eps_uncond + cfg_scale · (eps_cond - eps_uncond)
    latent = sampler_step(latent, eps, t)
image = vae_decoder(latent)
```

CFG scale 7-9 typical. 20-50 sampling steps. Image emerges in ~2-5 seconds on a consumer GPU.

## Variants

- **SD 1.5**: original. 860M params; 512×512 base resolution.
- **SD 2**: same architecture; OpenCLIP text encoder; 768×768 base.
- **SDXL**: 3.5B params total; dual text encoders (CLIP-L + CLIP-G); 1024×1024 base. Better quality, ~3× slower.
- **SD3**: rectified flow training; better prompt-following + text rendering.
- **FLUX**: 12B params; rectified flow; current open-source SOTA quality.

For most projects: SDXL is the safe default. FLUX for quality-critical applications. SD 1.5 for compute-constrained.

<!-- tier:grad -->
# Stable Diffusion (Grad)

## Cross-attention conditioning

The U-Net's attention layers come in two forms at each block:

- **Self-attention** over the latent's spatial positions.
- **Cross-attention** where queries come from the latent and keys + values come from text features.

The cross-attention is what makes the prompt actually drive generation. Roughly half the U-Net's params are dedicated to it.

Editing tools (prompt-to-prompt, attend-and-excite) work by intervening on the cross-attention maps directly — you can see which prompt tokens drive which spatial regions and modify them.

## Classifier-free guidance scale

CFG scale is the most-tuned hyperparameter. Effects:

- **Scale 1.0**: no guidance, only conditional. Sometimes ignores prompt.
- **Scale 7-9**: standard. Strong prompt following; natural images.
- **Scale 12-15**: very strong; saturated colors; over-emphasis.
- **Scale 20+**: artifacts dominant.

SDXL is more sensitive than SD 1.5. The right scale depends on the prompt and the model. Most production uses dynamic scaling — start high to lock in composition, lower mid-generation to refine details.

## Production deployment

Standard production stack:
- Stable Diffusion model + LoRA adapters (style, character, concept).
- ControlNets for spatial control (pose, depth, edge).
- Optional refinement step (SDXL refiner, GFP-GAN for faces).
- Tools like ComfyUI / A1111 for orchestration; diffusers library for programmatic.

Inference speed:
- SD 1.5 on RTX 3090: ~2 seconds per 512×512 image at 20 steps.
- SDXL on RTX 4090: ~5-10 seconds per 1024×1024 image.
- Distilled models (SDXL Turbo, LCM): single-step or 4-step generation; near-real-time.

## Failure modes

- **Hands and faces**: persistent struggle. Specialized models (face restoration, hand correction) often fix in post.
- **Text rendering**: SD 1.5/2/SDXL render text poorly. SD3 + FLUX much better.
- **Composition**: very long prompts often partially ignored. CFG scale + careful prompting helps.
- **Mode collapse on certain seeds**: some random seeds produce consistently bad outputs; just resample.
