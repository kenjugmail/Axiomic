---
title: Experiment Tracking Discipline
category: systems
---
<!-- tier:intro -->
# Experiment Tracking Discipline

Tools come and go (W&B, MLflow, Comet); the discipline is timeless. An ML team that tracks experiments rigorously can answer questions like:

- "What hyperparameters did our best model use?"
- "Did this 1% improvement actually beat noise?"
- "Why did our retrained model regress 1% on the same data?"

A team without rigorous tracking can't. The cost of inconsistent tracking compounds with team size.

<!-- tier:undergrad -->
# Experiment Tracking Discipline (Undergrad)

## The minimum viable tracking standard

For every training run, the team should log:

1. **Full config** — every hyperparameter, every flag, the parsed dataclass / YAML / Hydra config.
2. **Metrics over time** — train loss, val loss, eval scores at every checkpoint, plus GPU metrics.
3. **Provenance** — git hash + dirty flag, data version (DVC or checksum), hardware, library versions, seeds.
4. **Artifacts** — checkpoints uploaded to a backing store, sample outputs.
5. **A free-text note** — "why this run" — that future-you can read.

This is non-negotiable hygiene. A run without these is unreproducible.

## Reproducibility, properly

Reproducible doesn't mean bit-for-bit identical (that's hard with CUDA non-determinism). It means **same experiment, run twice, lands within statistical noise**.

Recipe:
- Pin everything (PyTorch, CUDA, NCCL versions in `requirements.txt`).
- Set seeds: `torch.manual_seed`, `np.random.seed`, `random.seed`. Optionally `torch.use_deterministic_algorithms(True)` if you can tolerate the slowdown.
- Version the data (DVC, snapshot IDs).
- Log everything.
- Run multiple seeds before claiming an improvement.

The 1% improvement that doesn't show in 3 seeds isn't an improvement. The 1% improvement that shows in 3 of 3 with disjoint confidence intervals is real.

## Hyperparameter sweeps

Strategies, in order of typical usefulness:
- **Random search**: sample uniformly from each hyperparameter range. Strong baseline; outperforms grid for the same budget (Bergstra & Bengio 2012).
- **Bayesian / Hyperband / ASHA**: model the loss-vs-config surface, focus compute on promising regions. W&B + Optuna implement these.
- **Grid search**: exhaustive Cartesian product. Easy to reason about; wasteful past 3 hyperparameters.

Practical: start with random over 20-50 configs; pick the top 5%; do a finer sweep around them. Bayesian adds value when individual runs are very expensive (>1h) or the search space is large.

<!-- tier:grad -->
# Experiment Tracking Discipline (Grad)

Failure modes that motivate each piece:

- **"Best run was 2 months ago, can't reproduce"**: missing config + dirty git tree.
- **"Re-trained, scores dropped 1%"**: data version drift, almost always.
- **"Sweep found a great config"**: but you can't tell which dimensions mattered without proper logging granularity.
- **"Production model regressed silently"**: no smoke-eval set being run nightly against the current production checkpoint.

Cultural elements:

- **Code review for training scripts**: same scrutiny as production code. A PR that adds a new training entry-point gets reviewed for tracking compliance.
- **Pre-commit / CI hooks**: fail if `wandb.init` (or equivalent) is missing in a training script.
- **Quarterly reviews of past runs**: one engineer browses the last quarter's tracker, notices unexpectedly-good configs that didn't get follow-up, surfaces them. Often catches missed wins.

The pathology to avoid: tracking-as-cargo-cult. Logging fires happily; nobody looks at the dashboards; six months in, the team can't tell why their numbers went up. Tracking only works when reading the tracker is a regular, low-friction habit. Make it the first thing the on-call engineer sees in the morning.
