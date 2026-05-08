---
title: Protein Language Models
category: bio
---
<!-- tier:intro -->
# Protein Language Models (pLMs)

Transformers trained on protein sequences via masked-residue prediction (BERT-style) or autoregressive generation (GPT-style). Foundation models for biology.

Major variants: **ESM** (Meta AI), **ProtBERT** (RostLab), **ProtGPT2** (autoregressive), **ProGen** (Salesforce/Profluent), **ProstT5** (struct-aware). The pattern transferred from NLP — pretrain on huge unlabeled corpora; fine-tune for downstream tasks.

<!-- tier:undergrad -->
# pLMs (Undergrad)

## Pretraining objectives

**Masked-residue prediction** (BERT-style): mask 15% of residues randomly; predict masked tokens given context. Used by ESM, ProtBERT.

**Autoregressive generation** (GPT-style): predict next residue given preceding context. Used by ProtGPT2, ProGen. Useful for generating new sequences.

**Structure-aware**: pretrain with structural information (residue contacts, secondary structure) as auxiliary supervision. ProstT5 mixes sequence + structure tokens.

**Multimodal** (ESM-3): sequence + structure + function tokens; predict any given the others. State of the art.

## Architectures + scales

Most protein LMs are standard transformers, just with protein-specific tokenization:

- **Per-character tokens**: 20 amino acids + specials. Vocab=~30. Standard.
- **Sequence length**: 100-2000 tokens typical. Long-context for genomes/proteomes is an active research area.

Scales: 8M (small) → 650M (standard) → 15B (large) → 100B+ (frontier, mostly ESM-3 + closed).

## What pLMs are useful for

**Embedding extraction**: per-residue or pooled features for downstream tasks. The dominant use case; works for classification, regression, clustering.

**Variant effect prediction**: log-likelihood ratio between wild-type and mutant. Functional variants reduce likelihood.

**Structure prediction without MSA**: ESMFold uses ESM-2 features + small structure module. Faster than AlphaFold.

**Functional similarity search**: protein LM embeddings + cosine. Finds homologs BLAST misses.

**Protein design**: generative pLMs sample new sequences with desired properties. Used to design novel enzymes, antibodies, fluorescent proteins.

<!-- tier:grad -->
# pLMs (Grad)

## Compared to MSA-based methods

For structure prediction:
- **AlphaFold (with MSA)**: best accuracy. ~92 GDT_TS on CASP14.
- **ESMFold (no MSA)**: ~85 GDT_TS. Faster (no MSA search). Good for orphan proteins.

For function prediction:
- **MSA-aware models** (Profile HMMs, PSI-BLAST): well-calibrated for distant homologs. The classical bioinformatics standard.
- **pLM embeddings**: capture more semantic similarity at the cost of being less interpretable. Sometimes outperform MSA-based on functional tasks.

The trend: pLMs are catching up on tasks where MSAs were essential. For distant homologs (no good MSA), pLMs have already won.

## Limitations

- **In-distribution bias**: pLMs trained on UniRef50 reflect what's been sequenced + databased. Bacteria/archaea overrepresented (easier to sequence); eukaryotes uneven; viral underrepresented.
- **Length limits**: standard transformers have quadratic attention cost. Long proteins (>2000 residues) are slower; some variants use linear attention or chunking.
- **Structural uncertainty**: emerges implicitly; no per-residue confidence like AlphaFold's pLDDT. Workarounds: use prediction variance across model variants, or pair with ESMFold for explicit confidence.

## Where pLMs are going

- **Multimodal foundation models** (ESM-3, RoseTTAFold All-Atom): sequence + structure + function in one model. Generative protein design becomes practical.
- **Long-context proteins / genomes**: HyenaDNA-style architectures for million-base genomic context.
- **Domain-specific pLMs**: antibodies (AbLang, IgLM), GPCRs, enzymes. Smaller, faster, more accurate within domain.
- **Combined with classical bioinformatics**: hybrid pipelines using BLAST + pLM + AlphaFold + MD. The whole-stack approach for serious bio-ML.

For most projects in 2026: ESM-2 for embeddings; ESMFold for fast structure; AlphaFold when accuracy matters most. The ecosystem is mature.
