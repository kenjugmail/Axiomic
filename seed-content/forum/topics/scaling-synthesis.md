---
title: Synthesis — what we collectively believe about scaling laws after Chinchilla
postType: synthesis
domainSlug: ml
wikiPageSlug: scaling-laws
author: alice
replies:
  - author: bob
    body: |
      Good synthesis. One nit: the Hoffmann et al. paper recommends roughly equal compute scaling between parameters and data, but the specific ratio (1:1 in tokens-per-parameter) was specific to the architectures and data mix studied. Recent work (DeepSeek, Llama 3) trains *well past* compute-optimal because inference compute matters too.
  - author: carol
    body: |
      Right — the "Chinchilla-optimal" point is only optimal for *training* compute. Once you account for inference, smaller models trained on more tokens dominate. This shifts the recommended ratio dramatically toward more tokens.
  - author: dave
    body: |
      I'd add a third dimension: data quality. Both Kaplan and Chinchilla were on roughly fixed-quality web data. Recent results suggest that filtered/synthesized data shifts the laws, and that the loss-vs-compute curve isn't a single curve at all but a family parameterized by data quality.
---

Three years after the Chinchilla paper, what's the synthesis? I'll try a 5-bullet summary; please correct or extend.

1. **Kaplan et al. (2020)** established that loss is a power-law in parameters, data, and compute, and recommended scaling parameters faster than data.
2. **Hoffmann et al. (2022, "Chinchilla")** corrected Kaplan with proper hyperparameter tuning and found compute-optimal scales parameters and tokens roughly equally — meaning prior models like GPT-3 were dramatically *under*-trained.
3. **Inference cost** changes the optimum. For models that will be deployed, training past compute-optimal makes sense — hence Llama-style "small model, many tokens" recipes.
4. **Data quality** is a hidden dimension. Filtering, deduplication, and curriculum effects mean "compute-optimal" is really "compute-optimal *for this dataset*."
5. **Emergent capabilities** (Wei et al.) appear as discontinuities in scaling curves, but Schaeffer et al. argue many of these are artifacts of metric choice. Real "emergence" remains contested.

What's missing? What's wrong?
