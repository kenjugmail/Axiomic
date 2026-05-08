---
title: Speculative Decoding
category: inference
---
<!-- tier:intro -->
# Speculative Decoding

LLM inference is autoregressive: predict the next token, then the next, then the next. For long outputs this is slow — each token requires a full forward pass through the model. With a 70B model, that's hundreds of milliseconds per token.

**Speculative decoding** speeds this up without changing the output. The trick: use a small fast model to *propose* multiple tokens at once, then use the big model to *verify* them in parallel. If the big model agrees, you advance multiple tokens per big-model forward pass. If it disagrees, you discard from that point forward and restart.

The speedup comes from two facts: (1) verifying K tokens in parallel is roughly the same cost as generating 1 token, because both use a single forward pass; (2) the small model is right *most* of the time, especially on easy tokens (whitespace, common words, predictable continuations).

Net effect: 2-3× faster inference at the same quality. Used in production by major LLM serving systems.

<!-- tier:undergrad -->
# Speculative Decoding (Undergrad)

## The algorithm

Given a target model `M_target` and a draft model `M_draft` (smaller, faster, ideally similar distribution):

```
while not done:
    # 1. Draft model proposes K tokens
    drafted = M_draft.generate(context, k=K)

    # 2. Target model evaluates ALL of them in parallel (one forward pass)
    target_probs = M_target.forward(context + drafted)

    # 3. Verify tokens one by one
    accepted = []
    for i, token in enumerate(drafted):
        p_target = target_probs[i][token]
        p_draft = drafted_probs[i][token]
        if random() < min(1, p_target / p_draft):
            accepted.append(token)
        else:
            # Reject this token; sample from corrected distribution
            corrected_token = sample_from(adjusted_dist(target_probs[i], drafted_probs[i]))
            accepted.append(corrected_token)
            break  # discard remaining drafted tokens

    context += accepted
```

The key property: **the resulting sequence is mathematically equivalent to sampling from `M_target` directly**. Speculative decoding doesn't approximate the target distribution; it produces the same distribution at higher speed.

Typical K (number of draft tokens) is 4-8. Larger K is faster when accept rates are high but wastes compute when they're low.

## Why this works

The critical observation: a transformer's forward pass produces logits for *every* position in the input simultaneously. So if you give it `context + [drafted_token_1, drafted_token_2, ..., drafted_token_K]`, you get K next-token distributions in a single forward pass — at the cost of one forward pass.

Without speculative decoding, you'd need K forward passes to generate K tokens. With it, you do one forward pass to verify K candidates. If your draft model gets even 50% of the K tokens right, you're net faster.

The acceptance probability `min(1, p_target / p_draft)` is a rejection-sampling step. It guarantees the final sample is from `p_target` regardless of what `p_draft` was. The draft model can be wrong about specific probabilities; the verification step corrects.

## Choosing the draft model

Standard recipe: use a much smaller model from the same family. For LLaMA-2 70B, the draft model is often LLaMA-2 7B. The intuition: the small model has roughly the same vocabulary distribution; it's right enough of the time to give acceptance rates of 60-80%.

Some setups train a *specifically* small draft model for the target — same data, similar tokenizer, same instruction tuning. This raises acceptance rates further.

The economics: the draft model adds compute. If draft compute > target compute saved by faster generation, you've made things slower. The break-even is roughly: draft model should be ≤ 5-10% of target model's compute per token.

<!-- tier:grad -->
# Speculative Decoding (Graduate)

## Variants

**Vanilla speculative decoding** (Leviathan et al. 2023, Chen et al. 2023): the algorithm above. Two separate models.

**Medusa** (Cai et al. 2024): instead of a separate draft model, add multiple "medusa heads" to the target model that each predict the next K tokens. The heads share the target model's hidden states, so the draft cost is small. Trains the heads with a special objective; achieves 2-3× speedup.

**Lookahead decoding** (Fu et al. 2024): no draft model. Use n-gram patterns from previous generation steps to predict next tokens. Speedups are smaller (1.5-2×) but no extra model needed.

**EAGLE** (Li et al. 2024): a learned draft model that's conditioned on the target model's intermediate states, getting much higher acceptance rates than a naive draft model.

**Tree-based speculation**: instead of a linear sequence of draft tokens, propose a tree of candidates and verify them in parallel. More tokens proposed per round → higher throughput. Implemented in vLLM and TGI.

## Trade-offs

**Latency vs throughput**. Speculative decoding reduces latency (time per token for a single user). It doesn't always help throughput (tokens per second across many users) — for batched serving, the verification step adds compute the system might not have spare.

**Memory pressure**. The draft model adds memory. For an LLaMA-2 70B + 7B speculative setup, that's ~14B more parameters loaded.

**Quality**. None — the output distribution is identical to `M_target`. This is the central appeal: speedup is free in quality terms.

**When it doesn't help**. Speculative decoding's gains depend on accept rate. For tasks where the draft model is consistently wrong (highly specialized domains, code that the draft hasn't been trained on), accept rates drop and speedup vanishes.

## Production deployment

Major serving stacks support speculative decoding:

- **vLLM**: tree-based speculation, configurable draft model
- **TGI** (HuggingFace): speculative decoding for select model pairs
- **TensorRT-LLM**: NVIDIA's serving stack with speculative decoding
- **TabbyAPI**, **llama.cpp**: open-source servers with speculative options

Picking parameters: start with K=4-5 and a draft model 5-10× smaller than target. Measure acceptance rate on your traffic. If it's above 60%, increase K. If below 40%, consider a different draft model or disable speculation.

## Key References

- Leviathan et al., "Fast Inference from Transformers via Speculative Decoding" (2023)
- Chen et al., "Accelerating Large Language Model Decoding with Speculative Sampling" (2023)
- Cai et al., "Medusa: Simple LLM Inference Acceleration Framework with Multiple Decoding Heads" (2024)
- Fu et al., "Break the Sequential Dependency of LLM Inference Using Lookahead Decoding" (2024)
- Li et al., "EAGLE: Speculative Sampling Requires Rethinking Feature Uncertainty" (2024)
