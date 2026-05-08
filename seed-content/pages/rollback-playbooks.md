---
title: Rollback Playbooks
category: systems
---
<!-- tier:intro -->
# Rollback Playbooks

A rollback playbook is the written procedure that gets a misbehaving production service back to a known-good state. The playbook is the difference between a 5-minute incident and a 5-hour incident.

The discipline:
1. Pre-decide the trigger thresholds.
2. Always retain the previous known-good version.
3. Make rollback a single command (or single click).
4. Rehearse it quarterly so the on-call has muscle memory.

<!-- tier:undergrad -->
# Rollback Playbooks (Undergrad)

## What "known good" means

The previous deployed version of the model + serving stack, validated as latency-tested and quality-tested before being replaced. This is the rollback target. Always retained until at least the next-next deploy. Often two prior versions kept simultaneously for safety.

In a model registry: `model:stable` (most recent prod), `model:previous` (the version before stable). Rollback = swap in `model:previous`.

## Pre-decided trigger thresholds

The trigger fires the rollback automatically (or at least pages the on-call without negotiation). Examples:

- p99 latency > 8 s for 5 consecutive minutes.
- Error rate > 5% for 2 consecutive minutes.
- Online-eval mean score < 0.80 for an hour.
- OOM rate > 1% over a 10-minute window.
- Drift PSI > 0.5 day-over-day.

Pre-decided so the engineer on call doesn't have to negotiate the threshold during an incident under pressure. The triggers should be calibrated against realistic noise — too sensitive and you'll roll back legitimate slow days; too loose and you'll ship through real regressions.

## Rollback procedure

A single command (or single button). Examples:

```bash
# Kubernetes serving
kubectl set image deployment/llm-server llm-server=registry/llm-server:stable
kubectl rollout status deployment/llm-server

# vLLM behind a router
curl -X POST $ROUTER/admin/swap-model -d '{"model": "stable"}'

# Terraform-managed
terraform apply -var "model_version=stable"
```

The runbook says: which command to run, how to confirm rollback succeeded, who to alert post-rollback. One page. Linkable from the on-call alert message.

## Rehearsal

Quarterly: run the rollback in staging during a calm afternoon. Have a junior engineer execute it; the senior engineer watches. Time it. Note any surprises (the registry was missing the previous version; the command had a typo; the deploy pipeline rejected the swap).

Costs: 30 minutes of staging time, one engineer's attention. Saves hours during a real incident.

<!-- tier:grad -->
# Rollback Playbooks (Grad)

Anti-patterns and how to avoid them:

- **Roll forward instead of roll back**: "Just push the fix." This is how 5-minute incidents become 5-hour incidents. The fix is rushed, untested, ships through abbreviated review. Roll back. Restore service. Then fix carefully.
- **Discarded previous version**: a deploy succeeded; the previous checkpoint was deleted to save storage. Now there's nothing to roll back to. Always retain at least the previous version, ideally the previous two.
- **Tribal knowledge**: only one engineer knows the procedure. They're on vacation. The on-call has to figure it out from scratch under stress. The fix is rehearsal + a written runbook.
- **Bigger rollback than needed**: rolling back the entire deploy when only one component regressed. Rolling back unnecessarily ships related fixes back into the broken state. Granular rollback (per-service, per-model) is the right discipline.
- **Skipped post-incident review**: even a successful rollback gets a 30-minute review. Why didn't pre-deploy testing catch this? What's the regression test for it? When does the actual fix ship? Without the review, the same incident recurs.

Rollback is a *correctness mechanism*, not a band-aid. A team that uses it confidently ships more aggressively because the cost of a bad deploy is bounded. The teams that ship 10× more reliably than peers are usually the ones that rollback more often, not less.

A useful framing: deploy frequency × rollback ease = innovation throughput. Lowering the cost of rollback raises the throughput. The engineering investment in playbooks + registry + rehearsal pays out directly in deployment cadence.
