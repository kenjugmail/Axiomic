---
title: Production Failure Modes
category: systems
---
<!-- tier:intro -->
# Production Failure Modes

The failures that hit ML services in production cluster into a small list. Knowing the list — and having a written prevention + mitigation per item — separates teams that ship reliably from teams that ship and pray.

The big six:

1. OOM under load
2. NaN / inf in training
3. Silent corruption (the worst)
4. Rollback impossible (because you didn't keep the previous version)
5. Data pipeline drift
6. Cascading retries

<!-- tier:undergrad -->
# Production Failure Modes (Undergrad)

## OOM under load

**Shape**: a request with unusually long context lands; KV cache + activations exceed HBM; CUDA OOMs; the worker dies.

**Prevention**:
- Hard max-context cap at the request router, lower than model's theoretical max.
- Per-request memory estimator that rejects requests exceeding the remaining KV budget.
- PagedAttention so KV cache utilization is high but bounded.
- 5% HBM headroom as a safety margin.

**Mitigation**:
- OOM exception handler: cancel the offending request, return error, *don't crash the worker*.
- Liveness probe + bounded restart rate.
- Alert on OOM rate; treat as a class-1 issue.

## NaN in training

**Shape**: training loss spikes to NaN at step ~12000. Subsequent steps continue NaN. Useless checkpoint produced silently if not detected.

**Prevention**:
- Gradient norm clipping (`clip_grad_norm_`, value 1.0).
- Logit clamping before softmax.
- LR warmup over the first few thousand steps.
- bf16 instead of fp16 (no loss-scaling underflow).

**Mitigation**:
- Detect NaN in loss; skip the step; do not apply the update.
- Save checkpoints every 1000 steps; on NaN, roll back, halve LR, restart.
- Per-layer gradient logs for diagnosis.

## Silent corruption

**Shape**: system runs cleanly, no errors, but produces wrong results. Examples:
- Preprocessing drift (a new dependency version changed unicode normalization).
- Feature schema change (cents → dollars).
- A/B contamination (overlapping treatment + control groups).
- Wrong checkpoint loaded into production.

**Prevention**:
- Daily input/output diff dashboards.
- Smoke-test eval set running in production hourly.
- Checkpoint hash registry; mismatch alerts.
- Schema validation at every model input/output boundary (pydantic, pandera).

**Mitigation**:
- Discoverable only via the prevention checks above. By the time silent corruption surfaces in user reports, it's been live for weeks.

## Rollback impossible

**Shape**: model regressed; the previous good checkpoint was deleted; the old data was overwritten; no way to revert.

**Prevention**:
- Always retain the previous good checkpoint (`model:stable`).
- Version data with DVC or snapshot-named storage.
- Test rollback in staging quarterly.

**Mitigation**:
- Re-train from a known-good config — but this is hours to days, not minutes.

<!-- tier:grad -->
# Production Failure Modes (Grad)

## Data pipeline drift

**Shape**: upstream data source changed schema; nothing crashed; a feature now sometimes contains string instead of bool; downstream model drifts in accuracy without anyone noticing.

**Prevention**:
- Schema validation at the pipeline boundary (Pandera, Great Expectations).
- Contract tests on upstream data sources.
- Daily aggregation + dashboard on input statistics; alert on PSI > 0.25.

## Cascading retries

**Shape**: a downstream service times out; upstream retries; load triples; everything melts.

**Prevention**:
- Exponential backoff with jitter on retries.
- Circuit breaker: after N consecutive failures, stop retrying; fail fast.
- Token-bucket rate limiting.
- Bulkhead isolation: thread pool per downstream so one stuck downstream doesn't drain the others.

**Mitigation**:
- Manual circuit-breaker activation if alarms detect a cascade.
- Drop low-priority traffic to preserve high-priority capacity.

## Rollback playbooks

When things break, a written playbook closes the time-to-recovery from hours to minutes.

Ingredients:
1. **Trigger criteria**: pre-decided thresholds (latency > 8s for 5 min, OOM rate > 1%, eval smoke score < 0.85).
2. **Rollback target**: the previous known-good (`model:stable` in registry).
3. **Procedure**: a single command, tested in staging quarterly.
4. **Post-incident review**: same day, 30 minutes, no blame, focus on detection + prevention.

Anti-patterns:
- "Roll forward" instead of rolling back. (Time-to-recovery: hours of debug + write + ship vs minutes of revert.)
- Discarding the previous checkpoint after a deploy. (Now nothing to revert to.)
- Tribal knowledge of the rollback procedure. (Senior engineer is on vacation; on-call doesn't know.)

The teams that ship reliable production ML rehearse rollback regularly. The drill is cheap; the muscle memory pays for itself the first time it's needed in earnest.
