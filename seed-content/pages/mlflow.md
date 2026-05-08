---
title: MLflow + Experiment Tracking
category: systems
---
<!-- tier:intro -->
# MLflow + Experiment Tracking

Experiment tracking is the discipline of logging every training run's configuration, metrics, code version, and outputs into a central system. It exists because:

1. Without tracking, the recipe behind your good runs gets forgotten.
2. Without tracking, you can't tell whether a "1% improvement" is real or noise.
3. Without tracking, regressions are debugged from human memory rather than data.

Common tools: **Weights & Biases** (research-style, hosted), **MLflow** (open-source, often self-hosted), **TensorBoard** (file-based, basic), **Comet / Aim / Neptune** (variants).

The tool matters less than the discipline. A team that consistently uses any of them beats a team that sporadically uses the best.

<!-- tier:undergrad -->
# Experiment Tracking (Undergrad)

## What every run should log

**Configuration**: every hyperparameter (model arch, optimizer, schedule, data mix, augmentations). Use `hydra` / `OmegaConf` / dataclasses to load configs from YAML; log the parsed config to the tracker.

**Metrics over time**: train loss, val loss, eval scores, GPU stats — at every checkpoint interval. Plus throughput (tokens/sec, samples/sec, step time).

**Provenance**:
- `git rev-parse HEAD` for the code version.
- `git status --porcelain` to detect uncommitted changes (a "dirty" run is non-reproducible).
- Dataset version (DVC hash, S3 snapshot ID, or file checksum).
- Hardware: GPU type, world size.
- Library versions: PyTorch, CUDA, NCCL, transformers.
- Random seeds.

**Artifacts**: checkpoints, tokenizer, eval predictions, sample outputs. Upload to S3 / GCS / a backing store — keep them per-run for later comparison.

**Notes**: a free-text "why this run" field. The most underrated metadata.

## MLflow basics

```python
import mlflow

mlflow.set_experiment("transformer-pretrain")

with mlflow.start_run():
    mlflow.log_params(config_dict)
    for step in range(max_steps):
        loss = train_step()
        if step % log_interval == 0:
            mlflow.log_metric("train_loss", loss, step=step)
    mlflow.log_artifact("checkpoint.pt")
```

Self-hostable backend: Postgres for metadata, S3/MinIO for artifacts. Production deployments scale to millions of runs.

## W&B basics

```python
import wandb

wandb.init(project="transformer-pretrain", config=config_dict)
for step in range(max_steps):
    loss = train_step()
    if step % log_interval == 0:
        wandb.log({"train_loss": loss}, step=step)
wandb.save("checkpoint.pt")
```

Hosted UI; auto-logs system metrics; sweep API for hyperparameter search; artifact registry. Free tier for solo + small teams.

<!-- tier:grad -->
# Experiment Tracking (Grad)

Beyond the basics:

- **Run grouping + tags**: tag runs with phase (`pretrain`, `finetune`, `eval`), data version, owner. Filter dashboards by tag for clean comparisons.
- **Sweeps**: orchestrate hyperparameter search. W&B's `bayes` or `hyperband` find better configs than grid for the same compute budget. Random search is a strong baseline; Bayesian methods pay off when individual runs are expensive.
- **Model registry**: promote a "release candidate" run to a "production" model with metadata (eval scores, signed-off-by). A/B test new candidates against the registered production model. Rolls back trivially.
- **Reproducibility checks**: nightly job that reruns a known-good config and alarms if metrics drift > X%. Catches infra changes (new CUDA version, new image) before they hit production.

The historical record is the team's institutional memory. After a year of consistent tracking, regression debugging becomes "compare run 1247 vs 1812"; new team members onboard by browsing past runs; the cost of inconsistent tracking compounds with team size.

The one consistent mistake: starting a new tracking convention every six months. Pick one, document it, enforce it in CI (e.g., a pre-commit hook that fails if `wandb.init` is missing in a training script).
