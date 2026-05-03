---
title: Reinforcement Learning from Human Feedback
category: alignment
---
<!-- tier:intro -->

# Reinforcement Learning from Human Feedback

Large language models trained on internet text can generate fluent sentences, but they don't automatically know what humans consider *helpful*, *honest*, or *harmless*. Reinforcement Learning from Human Feedback (RLHF) is the technique that bridges this gap — it teaches models to behave the way people actually want.

## The Core Problem

Imagine you've trained a model on billions of web pages. It can complete any sentence plausibly, but "plausible" isn't the same as "good." Ask it a question and it might give a correct answer, a fabricated one, or a toxic rant — all are patterns it saw in training data. We need a way to steer the model toward responses humans prefer.

## The Three Steps of RLHF

RLHF works in three stages:

**Step 1: Supervised Fine-Tuning (SFT).** Start with a pretrained language model and fine-tune it on high-quality examples of the behavior you want — like well-written answers to questions. This gives you a decent starting point, but the model still makes plenty of mistakes.

**Step 2: Train a Reward Model.** Now, show the model's outputs to human raters. For each prompt, generate two or more candidate responses and ask humans: "Which response is better?" Collect thousands of these comparisons. Then train a separate neural network — the **reward model** — to predict which response a human would prefer. The reward model assigns a numerical score to any (prompt, response) pair.

**Step 3: Optimize with RL.** Finally, use the reward model as a scoring function and train the language model to produce responses that earn high scores. The algorithm typically used is called PPO (Proximal Policy Optimization). The model generates a response, the reward model scores it, and the model's parameters get nudged toward generating higher-scoring responses.

## Why Not Just Use More Supervised Data?

Writing perfect answers to every possible question is impossibly expensive. But *comparing* two answers and saying which is better is much easier and faster for humans. RLHF exploits this asymmetry: it's cheaper to rank outputs than to produce ideal ones from scratch.

## The Results

RLHF is what made models like ChatGPT feel qualitatively different from earlier language models. After RLHF, models become better at following instructions, declining inappropriate requests, admitting uncertainty, and producing responses that feel genuinely helpful rather than just plausible.

## Limitations

RLHF isn't perfect. The reward model can learn shortcuts that don't reflect true quality — for example, preferring longer responses regardless of accuracy (a phenomenon called **reward hacking**). Human raters can disagree with each other, introducing noise. And the whole process is expensive and complex to run.

## Related Topics

- [Fine-Tuning](/wiki/fine-tuning) — the supervised fine-tuning step that precedes RLHF
- [Backpropagation](/wiki/backpropagation) — the gradient computation underlying all the training steps

<!-- tier:undergrad -->

# Reinforcement Learning from Human Feedback

RLHF frames language model alignment as a reinforcement learning problem where a learned reward model acts as proxy for human preferences. This section formalizes the three-stage pipeline.

## Stage 1: Supervised Fine-Tuning

Starting from a pretrained model $\pi_\text{base}$, we fine-tune on a curated dataset of demonstrations $\mathcal{D}_\text{SFT} = \{(x_i, y_i)\}$ to obtain $\pi_\text{SFT}$, maximizing:

$$\mathcal{L}_\text{SFT} = \mathbb{E}_{(x,y) \sim \mathcal{D}_\text{SFT}} \left[\sum_{t=1}^{T} \log \pi_\text{SFT}(y_t \mid x, y_{<t})\right]$$

## Stage 2: Reward Modeling

Human annotators compare pairs of model outputs. Given prompt $x$ and two completions $y_w$ (preferred) and $y_l$ (rejected), the reward model $r_\phi(x, y)$ is trained via the Bradley-Terry preference model:

$$\mathcal{L}_\text{RM}(\phi) = -\mathbb{E}_{(x, y_w, y_l)} \left[\log \sigma\big(r_\phi(x, y_w) - r_\phi(x, y_l)\big)\right]$$

where $\sigma$ is the sigmoid function. This loss pushes the reward model to assign higher scores to human-preferred responses.

The reward model is typically initialized from the SFT model with the language modeling head replaced by a scalar output head.

## Stage 3: RL Optimization with PPO

The policy $\pi_\theta$ is optimized to maximize the reward while staying close to $\pi_\text{SFT}$ via a KL penalty:

$$\mathcal{J}(\theta) = \mathbb{E}_{x \sim \mathcal{D},\, y \sim \pi_\theta(\cdot|x)} \left[r_\phi(x, y) - \beta \, D_\text{KL}\!\left(\pi_\theta(\cdot|x) \,\|\, \pi_\text{SFT}(\cdot|x)\right)\right]$$

The KL term is critical — without it, the policy collapses to degenerate outputs that exploit reward model weaknesses (reward hacking). KL divergence is the natural penalty here for the reasons covered in [information theory](/wiki/information-theory): it measures the extra bits per sample of using the new policy where the old one was the optimal code.

**PPO specifics.** The reward is computed per token or per sequence. The advantage estimate uses Generalized Advantage Estimation (GAE). The clipped surrogate objective prevents overly large policy updates:

$$L^\text{CLIP}(\theta) = \mathbb{E}_t \left[\min\!\left(\frac{\pi_\theta(a_t|s_t)}{\pi_{\theta_\text{old}}(a_t|s_t)} \hat{A}_t,\; \text{clip}\!\left(\frac{\pi_\theta}{\pi_{\theta_\text{old}}}, 1-\epsilon, 1+\epsilon\right) \hat{A}_t\right)\right]$$

## Code Sketch: Reward Model Training

```python
import torch
import torch.nn as nn

class RewardModel(nn.Module):
    def __init__(self, base_model):
        super().__init__()
        self.backbone = base_model
        self.reward_head = nn.Linear(base_model.config.hidden_size, 1)

    def forward(self, input_ids, attention_mask):
        outputs = self.backbone(input_ids, attention_mask=attention_mask)
        # Use last token's hidden state as sequence representation
        last_hidden = outputs.last_hidden_state[:, -1, :]
        reward = self.reward_head(last_hidden).squeeze(-1)
        return reward

def reward_loss(reward_model, chosen_ids, rejected_ids, chosen_mask, rejected_mask):
    r_chosen = reward_model(chosen_ids, chosen_mask)
    r_rejected = reward_model(rejected_ids, rejected_mask)
    loss = -torch.log(torch.sigmoid(r_chosen - r_rejected)).mean()
    return loss
```

## Direct Preference Optimization (DPO)

Rafailov et al. (2023) showed the RL stage can be bypassed entirely. DPO reparameterizes the RLHF objective to derive a closed-form loss that trains the policy directly on preference pairs:

$$\mathcal{L}_\text{DPO}(\theta) = -\mathbb{E}_{(x, y_w, y_l)} \left[\log \sigma\!\left(\beta \log \frac{\pi_\theta(y_w|x)}{\pi_\text{ref}(y_w|x)} - \beta \log \frac{\pi_\theta(y_l|x)}{\pi_\text{ref}(y_l|x)}\right)\right]$$

This eliminates the need for a separate reward model and the instabilities of PPO training.

## Related Topics

- [Fine-Tuning](/wiki/fine-tuning) — the SFT stage
- [LoRA](/wiki/lora) — parameter-efficient methods often used during RLHF
- [Backpropagation](/wiki/backpropagation) — gradient computation through the policy and reward model

<!-- tier:grad -->

# Reinforcement Learning from Human Feedback

RLHF emerged as the dominant alignment technique following Ouyang et al. (2022, "InstructGPT") and underpins most commercial chat models. This section examines the theoretical foundations, failure modes, and recent alternatives.

## Theoretical Foundations

The RLHF objective can be derived from the KL-constrained reward maximization problem. Given reward function $r$ and reference policy $\pi_\text{ref}$, the optimal policy has a closed-form solution:

$$\pi^*(y|x) = \frac{1}{Z(x)} \pi_\text{ref}(y|x) \exp\!\left(\frac{r(x,y)}{\beta}\right)$$

where $Z(x)$ is the partition function. This is the insight behind DPO — the optimal policy is implicitly defined by the reward, so one can work directly with policies rather than explicitly learning rewards then running RL.

## Reward Model Limitations

**Reward hacking.** Gao et al. (2023) characterized the "reward overoptimization" phenomenon: as the policy is optimized further against the reward model, true performance (measured by humans) initially improves then degrades. This follows a predictable pattern modeled by:

$$\text{Gold Reward} \approx \alpha \sqrt{D_\text{KL}} - \beta \, D_\text{KL}$$

where $D_\text{KL}$ measures divergence from the reference policy. The square-root term captures genuine improvement; the linear term captures reward model exploitation.

**Distribution shift.** The reward model is trained on outputs from $\pi_\text{SFT}$, but during RL training the policy shifts. The reward model may be unreliable on out-of-distribution outputs. Iterative reward model retraining and ensembles of reward models partially address this.

**Sycophancy.** Models trained with RLHF tend to agree with users even when users are wrong (Perez et al., 2023). This likely arises because human raters prefer agreeable responses, and the reward model captures this bias.

## Alternatives to PPO

**REINFORCE-style methods.** REINFORCE Leave-One-Out (RLOO) and variants reduce variance without the complexity of PPO's critic network and clipping. Ahmadian et al. (2024) showed RLOO can match PPO performance with simpler implementation.

**DPO and variants.** Beyond vanilla DPO (Rafailov et al., 2023):
- **IPO** (Azar et al., 2024): addresses DPO's tendency to overfit by using a squared loss rather than logistic.
- **KTO** (Ethayarajh et al., 2024): requires only binary feedback (good/bad) per response, not pairwise comparisons.
- **ORPO** (Hong et al., 2024): combines SFT and preference optimization into a single stage.

**Best-of-N sampling.** A simple but effective baseline: generate $N$ responses, score each with the reward model, return the highest-scored one. Nakano et al. (2022) found this surprisingly competitive with PPO for moderate $N$, though cost scales linearly at inference.

## Constitutional AI and Self-Play

Bai et al. (2022) introduced Constitutional AI (CAI), where the model critiques and revises its own outputs according to a set of principles, generating synthetic preference data. This reduces (but doesn't eliminate) reliance on human annotation. RLAIF (Reinforcement Learning from AI Feedback) extends this by using a strong model as the preference annotator.

## Scalable Oversight

A fundamental challenge: as models become more capable, human evaluators may not be able to assess response quality for complex tasks. Research directions include:
- **Debate** (Irving et al., 2018): two AI agents argue opposing positions while a human judges.
- **Recursive reward modeling** (Leike et al., 2018): decompose complex tasks into simpler subtasks that humans can evaluate.
- **Weak-to-strong generalization** (Burns et al., 2024): can a weaker model's supervision elicit strong model capabilities?

## Open Problems

1. **Process reward models** vs. outcome reward models: rewarding intermediate reasoning steps (Lightman et al., 2023) shows promise for math tasks but is harder to annotate.
2. **Multi-objective alignment**: balancing helpfulness, harmlessness, and honesty requires Pareto optimization rather than a single scalar reward.
3. **Robustness to adversarial users**: RLHF-trained models remain vulnerable to jailbreaks that circumvent alignment training.

## Related Topics

- [Fine-Tuning](/wiki/fine-tuning) — pretrain-then-align paradigm
- [Mechanistic Interpretability](/wiki/mechanistic-interpretability) — understanding what alignment training changes internally
- [Superposition](/wiki/superposition) — why interpreting aligned models is hard
