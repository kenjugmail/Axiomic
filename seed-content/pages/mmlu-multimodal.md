---
title: Multimodal Evaluation Benchmarks
category: multimodal
---
<!-- tier:intro -->
# Multimodal Evaluation

The benchmark landscape for multimodal models. Includes VQA suites (VQAv2, GQA), OCR/document tasks (DocVQA, ChartQA), capability matrices (MM-Vet, MMMU), and hallucination probes (POPE).

Most public benchmarks are contaminated by 2024+ — frontier models have likely seen the test images during pretraining. Production evaluations supplement with custom held-out sets.

<!-- tier:undergrad -->
# Multimodal Evaluation (Undergrad)

## Standard benchmark suite

**General VQA**:
- **VQAv2** (~250K Q&A pairs): saturated; modern VLMs hit 85%+.
- **GQA**: compositional, includes counting + relations. Less saturated.
- **OK-VQA**: requires external knowledge; harder.

**OCR / document**:
- **TextVQA**: questions about text in images.
- **DocVQA**: document understanding (forms, receipts, contracts).
- **ChartQA**: chart and graph reasoning.

**Capability decomposition**:
- **MMMU**: 30 subjects, 11K questions. Designed contamination-resistant.
- **MM-Vet**: 16 capability categories. Capability matrix output.
- **MathVista**: visual math.

**Hallucination**:
- **POPE**: pose 'is there a {object}?' for both present and absent objects. Measures hallucination rate.
- **CHAIR**: count hallucinated objects in generated captions vs ground-truth annotations.

For image generation:
- **FID** (Fréchet Inception Distance): distance between generated and real distributions.
- **CLIP score**: prompt-image alignment.
- **Human eval**: pairwise preference; expensive but the only real measure of quality.

For ASR / TTS:
- **WER** (word error rate) for ASR.
- **MOS** (mean opinion score) for TTS naturalness.

## Choosing benchmarks for your task

Different tasks need different benchmarks:

- **General-purpose VLM**: MMMU + MM-Vet + POPE.
- **Document AI**: DocVQA + ChartQA.
- **Chat assistant**: instruction-following evals + custom held-out + hallucination probes.
- **Image generation**: FID + CLIP score + human eval.

No single benchmark captures the model. Combine; treat each as one signal.

<!-- tier:grad -->
# Multimodal Evaluation (Grad)

## Contamination

Most public multimodal benchmarks have leaked into modern training data. VQAv2's images are on the public web; LAION-2B includes them. Reported scores conflate generalization with memorization.

Detection:
- **N-gram overlap** (for text): search for benchmark questions verbatim in training data.
- **Image hash matching**: hash benchmark images; check if they appear in training corpus.
- **Behavioral signature**: a model with unusually high benchmark accuracy compared to similar-capability tasks is likely contaminated.

Resistance strategies:
- **MMMU, MM-Vet**: deliberately new benchmarks, refresh-friendly.
- **Live leaderboards** (Chatbot Arena, vision arenas): user-submitted prompts.
- **Private holdouts**: vendor-specific test sets never released.

## Production evaluation

For deploying multimodal in production, supplement public benchmarks with:

**1. Custom held-out set**: 100-500 examples curated for your task. Run before every model update.

**2. Online evaluation**: sample 1-5% of production traffic; LLM-as-judge or human review.

**3. Adversarial probing**: test cases for known failure modes (hallucination, refusal calibration, robustness, multi-image reasoning).

**4. Capability matrix**: separate scores for perception, OCR, knowledge, reasoning, generation. A 70% aggregate can hide a 90% perception + 30% reasoning split.

## Hallucination evaluation

POPE is standard. Methodology:
1. For each image, list ground-truth objects (from COCO annotations or similar).
2. Generate questions: 'Is there a {object} in the image?' for both present and randomly-sampled-absent objects.
3. Score the model's yes/no responses.

Metrics: precision (when the model says yes, is the object actually there?), recall (when the object is there, does the model say yes?), F1.

Hallucination rate from POPE: GPT-4V ~5%, LLaVA-1.5 ~15%, smaller VLMs higher. Even 5% is high for production use; users notice.

## LLM-as-judge

For open-ended multimodal evaluation (caption quality, instruction-following), use a separate LLM to score model outputs. Standard:

- Provide the LLM judge with: image, prompt, model response, optionally a reference response.
- Ask: rate quality 1-5; or pairwise comparison.

Caveats:
- LLM judges are biased (toward longer, more detailed, more confident responses).
- Validate the judge against human ratings on a sample; calibrate.
- Cheap to run; useful for sweep evaluation; not a final-quality measure.

For final quality: human evaluation. Slow + expensive; the only ground truth.
