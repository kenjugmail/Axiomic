---
title: ESM (Evolutionary Scale Modeling)
category: bio
---
<!-- tier:intro -->
# ESM

A family of large protein language models from Meta AI. ESM-1 (2019), ESM-2 (2022), ESM-3 (2024). Trained on 30M-650M+ protein sequences via masked-residue prediction (BERT-style).

The largest variant: ESM-3 at ~98B parameters. Multimodal (sequence + structure + function). Generative; can design novel proteins.

ESM is to biology what BERT is to NLP — a foundation model for protein sequences.

<!-- tier:undergrad -->
# ESM (Undergrad)

## ESM-1b (2019)

33-layer transformer; 650M parameters. Trained on UniRef50 (~30M sequences) via masked-residue prediction:

```
mask 15% of residues randomly
predict masked tokens given context
loss: cross-entropy on masked positions
```

The model learns:
- Statistical patterns (which residues commonly occur in α-helices vs β-sheets).
- Co-evolution patterns (which residues co-occur or substitute compatibly).
- Implicit structure: probing experiments showed attention heads detect contact pairs and secondary structure assignments.

## ESM-2 (2022)

Same architecture, more data + scale. Released in 8M / 35M / 150M / 650M / 3B / 15B parameter variants. Trained on UniRef90 + extras.

Each scale gives different capability/cost trade-off. ESM-2 650M is the open-source default for protein embedding extraction. ESM-2 15B is the largest released; few use it directly because of compute cost.

## ESM-3 (2024)

Multimodal: sequence + structure + function tokens in one model. Each modality has its own tokenizer:
- **Sequence tokens**: 20 amino acids + specials.
- **Structure tokens**: 3D structure → ~4000 discrete tokens via a learned VQ-VAE-style codec.
- **Function tokens**: binding sites, post-translational modifications, etc.

Trained to predict any modality given any subset of others. Can:
- Generate sequence given structure (protein design).
- Predict structure given sequence (like AlphaFold).
- Generate sequences with desired function annotations.

~98B parameters at largest scale. Used to generate novel functional proteins (esmGFP — a fluorescent protein with no natural homolog).

## Practical use cases

- **Embeddings for downstream tasks**: pass a protein through ESM; use the per-residue or pooled embeddings for classification, regression, clustering.
- **Variant effect prediction**: compare wild-type vs mutant likelihood under ESM. Functional mutations reduce likelihood.
- **Structure prediction without MSA**: ESMFold = ESM-2 + small structure module. ~80-90% of AlphaFold quality, faster.
- **Functional similarity search**: protein LM embeddings + cosine similarity. Finds functional homologs that BLAST misses.
- **Protein design** (ESM-3 specifically): generate novel sequences with target structure or function.

<!-- tier:grad -->
# ESM (Grad)

## Why structure emerges from sequence-only pretraining

ESM-2 was trained on sequences alone — no structure data. Yet probing reveals attention heads that detect contact pairs (residues physically close in 3D), secondary structure, etc.

Why: the training data carries co-evolution signal. Residues physically close in 3D often co-vary across evolution (they need to remain compatible for the protein to function). Learning to predict masked residues from context forces the model to use this signal.

The 'sequence + scale → structure' result is one of the striking emergent capability findings in bio-ML. Echoes of NLP's emergent capabilities at scale.

## Training data scale

- **UniRef50**: ~50M sequences after redundancy reduction. ESM-1's training set.
- **UniRef90**: ~150M sequences. ESM-2.
- **Mixture for ESM-3**: UniRef + AlphaFold DB structures + curated function annotations. Hundreds of millions of (sequence, structure, function) tokens.

The data scale is what enables the learned representations. Smaller bio-LMs (ProtBERT, ProtGPT2) trained on similar data achieve qualitatively similar but quantitatively weaker capabilities.

## ESM in production

For most protein-ML applications:
- **Frozen embeddings + MLP head**: ESM-2 650M → per-protein embedding → small classifier. Standard pattern; good baseline.
- **Fine-tuning**: ESM-2 (smaller variants) can be fine-tuned on domain-specific tasks. Larger variants are usually frozen due to compute.
- **ESMFold for fast structure**: when you need structures for hundreds of thousands of proteins, ESMFold (no MSA search) is the practical choice. AlphaFold for the cases where you can afford the MSA + better accuracy.

For protein design (a frontier application): ESM-3 is the right tool, used through Evolutionary Scale's APIs since the largest variants aren't open-released.
