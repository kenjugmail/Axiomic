---
title: Foundation Models for Robotics
category: robotics
---
<!-- tier:intro -->
# Foundation Models for Robotics

Large neural networks pretrained on diverse data (internet + robot datasets) that serve as a base for many robotic tasks.

The 2022-2026 shift: scaling foundation-model pretraining + curated robot data unlocks generalization across tasks, embodiments, environments.

**Notable systems**:
- **RT-1** (Google 2022): first scaled VLA; 700 tasks.
- **RT-2** (2023): VLM-augmented; transfers internet knowledge.
- **OpenVLA** (2024): open-weight 7B VLA.
- **π-0** (Physical Intelligence 2024): flow-matching VLA.
- **Octo** (BAIR 2024): open-source VLA.
- **MOOPT, RT-X**: cross-embodiment training.

The "foundation models for robotics" framing is the dominant 2026 frontier. Whether it leads to commercial breakthroughs by 2030 is the open question.

<!-- tier:undergrad -->
# Foundation Models for Robotics (Undergrad)

## Why foundation models for robotics

Until 2022, robot policies were:
- Hand-engineered + brittle.
- Task-specific.
- Required expensive per-task data collection.

Foundation models change this:
- **Scale**: trained on millions of demonstrations + internet data.
- **Generalization**: handle multiple tasks, embodiments, environments.
- **Pretraining benefit**: internet-pretrained vision + language transfers to robotics.

The hypothesis: scaling laws for robotics work like for LLMs. More data + compute → broader generalization.

## Architecture

Typical VLA stack:

**Vision encoder**: DINOv2, CLIP, SigLIP, or similar foundation-model features. Inputs raw images; outputs visual tokens.

**Language encoder**: pretrained LLM or encoder. Inputs instruction; outputs language tokens.

**Transformer backbone**: cross-attention between vision + language; outputs action tokens.

**Action decoder**: maps action tokens to motor commands. Variants:
- Discrete action tokenization (autoregressive).
- Continuous action regression.
- Diffusion / flow-matching action heads.

## Training data

**Internet pretraining**: web images + text. Provides general visual + language understanding.

**Robot data**:
- Teleoperation: humans control robot; record (observation, action) pairs.
- Scripted policies: hand-engineered for simple tasks.
- RL rollouts: prior policies' executions.
- Cross-embodiment: aggregating data from many robots.

**Open X-Embodiment** (2024): the biggest open robotic dataset. 22 robots, 527 skills, 60 datasets, ~1000 hours. Catalyzed cross-embodiment training.

## Key results

**RT-1**: showed scaling worked for robotics. 130k demos → 700-task generalist.

**RT-2**: showed internet-pretrained VLMs transfer to robotics. *"Pick up the extinct animal"* worked because the VLM understood "extinct" from internet data.

**OpenVLA**: open-source 7B VLA. Open weights + code. Catalyzed academic + commercial follow-on work.

**π-0**: flow-matching VLA. Strong on dexterous tasks. Production-ready demonstrations.

**RT-X / cross-embodiment**: positive transfer across robot types. Trained on data from one robot improves performance on a different one.

## What works (2026)

**Reliably**:
- Pick-and-place common objects.
- Tabletop manipulation with simple instructions.
- Following natural-language commands.
- Limited-context navigation.

**Sometimes**:
- Long-horizon (3-5 step) tasks.
- Dexterous manipulation (insertion, in-hand rotation).
- Novel-object generalization.
- Cross-embodiment transfer.

**Rarely**:
- Cooking.
- Surgery.
- Crowded human environments.
- Truly novel-task generalization (without any in-domain data).

## Compared to prior approaches

**Pre-foundation-model era** (2010s):
- Hand-engineered controllers + carefully-engineered tasks.
- Brittle; doesn't transfer.
- Each task: weeks of engineering.

**Foundation-model era** (2022+):
- One model handles many tasks.
- Pretraining transfers; new tasks need less data.
- Each task: hours-to-days of data collection.

The contrast is striking but not yet revolutionary in production. Most commercial deployments still use hand-engineered + specialized policies. Foundation-model robotics is research-strong + emerging in production.

<!-- tier:grad -->
# Foundation Models for Robotics (Grad)

## Scaling laws for robotics

Open question: do robotics-specific scaling laws hold?

Preliminary evidence (RT-X, OpenVLA, π-0):
- More data → better generalization.
- Bigger models → better task performance.
- Diverse data > narrow data of the same size.

But:
- Robot data is fundamentally bottlenecked by human teleoperation time.
- Scaling beyond 10k hours of demos is expensive.
- Cross-embodiment transfer is partial; not yet at "any robot for any task".

## Training recipes

**Pretrain on internet + finetune on robot data**: RT-2 approach. Best of both worlds.

**Joint pretraining on internet + robot data**: OpenVLA, π-0. Single training loop.

**Curriculum**: simple tasks first; complex later. Reduces failures during training.

**Mixed objectives**: action prediction + future state prediction + text generation. Multi-task learning.

## Action-space representations

**Discrete action tokens**: tokenize action space; predict autoregressively. RT-2 uses this.

**Continuous regression**: predict action vector directly. Simpler but lacks coherence.

**Diffusion / flow-matching heads**: predict action distribution, sample. Multimodal-friendly.

**Hybrid**: high-level discrete tokens (skills) + low-level continuous control. Hierarchical.

## Cross-embodiment transfer

The central claim of RT-X / Open X-Embodiment: a policy trained on diverse robots transfers to new ones.

Evidence:
- Positive transfer when embodiments are similar (manipulators + manipulators).
- Limited transfer across very different forms (manipulator → mobile robot).
- Cross-embodiment training helps even on the source embodiment.

The dream: a foundation policy that runs on any robot with minimal adaptation. Not yet reality but plausibly ~2028.

## Long-horizon + hierarchical

VLAs handle short tasks well; long-horizon (10+ steps) tasks fail by error compounding.

**Hierarchical approaches**:
- High-level LLM-based planner outputs subgoals.
- Low-level VLA executes each subgoal.
- Replan at each subgoal.

**SayCan** (Google 2022): LLM proposes plans; learned skills execute. Influential.

**Voyager** (2023): LLM agent with skill library; long-horizon Minecraft.

**RT-2 + Inner Monologue**: LLM reflection during execution.

The hierarchical pattern is becoming standard for long-horizon manipulation.

## Tactile + multimodal extensions

Most VLAs are vision-only. Extensions:

- **Tactile-augmented VLAs**: integrate GelSight / DIGIT data.
- **Audio-augmented VLAs**: hear sound from environment.
- **Force-augmented VLAs**: include force-torque sensing.
- **Proprioception-augmented**: explicit joint states.

Modern: most VLAs use vision + proprioception. Tactile + audio + force are research-frontier.

## Real-time inference

VLAs are large (1-7B parameters typically). Real-time inference on real robots requires:

- **Distillation**: train smaller policy from VLA outputs.
- **Quantization**: INT8 / INT4 inference.
- **Action chunking**: predict K actions per call; amortize inference cost.
- **Specialized hardware**: NVIDIA Jetson, Apple Silicon, custom inference accelerators.

The production frontier: 7B VLAs at 30+ Hz on edge hardware.

## Open challenges

**Generalization**: cross-task, cross-embodiment, cross-environment. Partial today.

**Long-horizon**: 10+ step tasks. Hierarchical approaches help; not solved.

**Safety + reliability**: when does the policy fail predictably? OOD detection; formal verification.

**Sample efficiency**: data scale is fundamentally bottlenecked.

**Multi-agent**: multiple robots cooperating.

**Sim-to-real**: VLAs trained on real data work; sim-pretrained VLAs lag.

## References

- Brohan et al. 2022. RT-1: Robotics transformer for real-world control at scale. *arXiv*.
- Brohan et al. 2023. RT-2: Vision-language-action models transfer web knowledge to robotic control. *arXiv*.
- Padalkar et al. 2024. Open X-Embodiment: Robotic learning datasets and RT-X models. *ICRA*.
- Kim et al. 2024. OpenVLA: An open-source vision-language-action model. *arXiv*.
- Black et al. 2024. π-0: A vision-language-action flow model. *Physical Intelligence*.
- Octo Model Team 2024. Octo: An open-source generalist robot policy. *arXiv*.
