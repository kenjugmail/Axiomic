---
title: Vision-Language-Action (VLA) Models
category: robotics
---
<!-- tier:intro -->
# Vision-Language-Action (VLA) Models

Large transformers that take vision + language (instructions) as input and output robot actions.

The 2023+ frontier of foundation models for robotics. RT-2, OpenVLA, π-0, Octo are notable systems.

**Architecture**: Vision encoder + language encoder + transformer backbone + action decoder.

**Training**: combination of internet data + curated robot demonstrations + cross-embodiment data.

**Why VLAs win**: they unify perception + reasoning + control in one model. Internet pretraining provides world knowledge; robot data provides motor skills.

<!-- tier:undergrad -->
# VLA Models (Undergrad)

## What VLAs do

Input: image (or images) + language instruction (e.g., "pick up the red block and place it on the green block").

Output: robot actions (joint positions, end-effector pose, or motor commands).

Internal: transformer-based reasoning that bridges visual perception + language understanding + motor planning.

## Why "Vision-Language-Action"

The three components:

**Vision**: handle raw images directly. No hand-engineered features. Pretrained vision encoders (DINOv2, SigLIP, CLIP) provide strong feature representations.

**Language**: natural-language instructions. Lets users specify tasks flexibly. Pretrained LLMs provide language understanding.

**Action**: motor commands for the robot. Learned from demonstrations.

The combination is powerful: a user can say "make me a sandwich" and the model translates this into a sequence of motor actions.

## Notable models

**RT-1** (Google 2022): first scaled robot transformer. 35M params. 130k demos. 700 tasks.

**RT-2** (2023): VLM-augmented (PaLM-E, PaLI-X backbone). Internet pretraining transfers to robotics.

**OpenVLA** (2024): 7B params; open weights. Llama-2 + DINOv2 + SigLIP. Strong baseline; open-source standard.

**π-0** (Physical Intelligence 2024): flow-matching VLA. Strong on dexterous tasks. Production-ready.

**Octo** (BAIR 2024): open-source modular VLA. Good academic baseline.

**Tesla Optimus**: VLA-style policy + custom hardware. Production deployment in progress.

## Training data composition

**Internet pretraining**: web images + text. Provides general world knowledge.

**Curated robot data**: teleoperation, scripted policies, prior policies' rollouts. Hundreds-of-thousands of demos.

**Cross-embodiment data**: Open X-Embodiment aggregates 22 robots' data. Improves generalization.

**Synthetic data**: simulator-generated demonstrations. Cheap; sim-to-real gap.

The mix matters. Pure-robot data is limited; pure-internet doesn't have robot actions. The combination is the foundation-model recipe.

## Action representations

**Discrete tokens**: action space tokenized; predicted autoregressively. RT-2 uses this. Lets you reuse LLM-style training.

**Continuous regression**: predict numerical action vector. Simple; lacks multimodality.

**Diffusion / flow-matching**: predict action distribution; sample. Modern preferred. Multimodal-friendly.

**Action chunking**: predict next H actions as a chunk. Reduces inference cost; smoother trajectories.

## Real-world capabilities

**Reliable**:
- Pick-and-place common objects.
- Tabletop manipulation with simple instructions.
- Limited-context navigation.
- Following natural-language commands for known tasks.

**Working but unreliable**:
- Long-horizon (3-5+ step) tasks.
- Dexterous manipulation.
- Novel-object generalization.
- Cross-embodiment.

**Not yet**:
- Cooking.
- Surgery.
- Crowded human environments.
- Truly novel tasks.

<!-- tier:grad -->
# VLA Models (Grad)

## Architecture details

**Vision encoder**: typically DINOv2 (self-supervised), SigLIP (CLIP-style), or CLIP. Outputs visual tokens (patches → embedding sequences).

**Language encoder**: LLM-style, e.g., Llama-2 (OpenVLA) or PaLM (RT-2). Encodes the instruction.

**Transformer backbone**: cross-attention between vision + language tokens. Decoder-only or encoder-decoder.

**Action head**: maps last-layer outputs to actions. Variants:
- Tokenized action prediction (autoregressive).
- Continuous regression.
- Diffusion / flow-matching heads.

**Training objective**: behavior cloning loss (predict expert actions). Sometimes auxiliary losses (next-state prediction, language reconstruction).

## Cross-embodiment training

Train on data from multiple robots simultaneously:

- Each robot has different action space (different DoF, different joint conventions).
- Strategies:
  - Shared action vocabulary (after normalization).
  - Embodiment ID as input.
  - Per-robot action heads.
- Result: positive transfer; one model works on multiple robots with minimal per-robot tuning.

## Multi-task vs single-task

**Single-task VLAs**: trained for one specific task. Higher per-task accuracy.

**Multi-task VLAs**: trained on many tasks. Lower per-task accuracy but generalizes.

**Generalist + specialist**: train a multi-task generalist; fine-tune on each target task. Standard production recipe.

## Long-horizon + hierarchical

VLAs work best on short-horizon tasks. Long-horizon strategies:

**Hierarchical**:
- LLM-based high-level planner outputs subgoals.
- VLA executes each subgoal.
- Re-plan at subgoal boundaries.

**Inner monologue**: VLA reflects on execution; replans when stuck.

**Skill libraries**: pre-trained skill VLAs; high-level orchestrator selects + chains them.

## Training compute + data

Approximate training scale:
- RT-1: 130k demos; weeks on TPU pods.
- RT-2: 130k demos + internet data; months on TPU pods.
- OpenVLA: 970k demos (Open X-Embodiment); tens of GPU-weeks.
- π-0: 10k+ hours of teleoperation; large-scale training.

Compared to LLMs, robotics data is fundamentally limited by teleoperation cost. Synthetic data + cross-embodiment + internet pretraining help close the gap.

## Real-time deployment

VLAs are large (1-7B parameters). Real-time inference requires:

- **Distillation**: smaller policy mimicking the VLA. Faster but less capable.
- **Quantization**: INT8 / INT4 inference. ~2-4x speedup with minimal quality loss.
- **Action chunking**: predict H actions per call; amortize inference cost.
- **Specialized hardware**: NVIDIA Jetson, Apple Silicon, custom inference chips.
- **Adaptive frequency**: high-frequency control via classical inner loop; low-frequency VLA-based outer loop.

Production VLAs run at 5-30 Hz typically. Faster requires distillation or specialized hardware.

## Safety

VLAs are not formally verified. Safety mechanisms:

- **Action smoothing**: low-pass filter VLA outputs to prevent jerky motions.
- **Workspace bounds**: clip actions to safe operating region.
- **Force / torque limits**: limit physical interaction force.
- **Human override**: emergency stop; teleoperation takeover.
- **Out-of-distribution detection**: detect when the input is unfamiliar; back off to safe behavior.

For safety-critical settings (autonomous vehicles, surgery), classical verified controllers + safety wrappers around VLAs are standard.

## Open frontiers

- **Generalization**: cross-task, cross-embodiment, cross-environment. Partial today.
- **Long-horizon**: hierarchical helps; not solved.
- **Tactile + multimodal**: vision-only is standard; multimodal extensions emerging.
- **Real-time at scale**: 7B+ VLAs at 30+ Hz on edge hardware.
- **Safety + verification**: formal guarantees for ML-based policies.
- **Data efficiency**: training on less robot data via better priors.

## References

- Brohan et al. 2022. RT-1: Robotics transformer for real-world control at scale.
- Brohan et al. 2023. RT-2: Vision-language-action models transfer web knowledge to robotic control.
- Padalkar et al. 2024. Open X-Embodiment: Robotic learning datasets and RT-X models.
- Kim et al. 2024. OpenVLA: An open-source vision-language-action model.
- Black et al. 2024. π-0: A vision-language-action flow model.
- Octo Model Team 2024. Octo: An open-source generalist robot policy.
