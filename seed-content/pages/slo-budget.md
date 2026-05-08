---
title: SLOs and Error Budgets
category: systems
---
<!-- tier:intro -->
# SLOs and Error Budgets

A Service-Level Objective (SLO) is a numerical contract: "p99 latency under 5s 99.9% of the time", "uptime ≥ 99.95%", "p95 quality eval score ≥ 0.85."

An **error budget** is the inverse: how often can the SLO be violated before the contract breaks? An SLO of 99.9% available means 0.1% of the month (~43 minutes) can be unavailable. That 43 minutes is the budget.

The discipline: track burn rate; if you've burned the month's budget early, freeze risky deploys until it resets.

<!-- tier:undergrad -->
# SLOs and Error Budgets (Undergrad)

## Why p95 / p99 instead of mean

Mean latency hides the long tail. A median of 200ms with a p99 of 5s is a much worse user experience than a median of 400ms with a p99 of 800ms — even though the means are close.

p95: 5% of requests are slower than this number.
p99: 1% of requests are slower than this number.
p99.9: 0.1% of requests are slower than this number.

For chat-style serving, p95 is the right granularity. For batch / async workflows, mean is fine.

## Common SLO targets for LLM serving

- **TTFT (time-to-first-token) p95**: < 500ms for chat.
- **End-to-end latency p95**: < 5s for ≤ 200-token generation.
- **Throughput**: ≥ 50 tokens/sec/user under nominal load.
- **Availability**: 99.95% (~22 minutes downtime per month).
- **Error rate**: < 0.5% 5xx + 4xx-due-to-server-bug.

Don't pick targets your hardware can't sustain. Don't pick targets so loose users won't notice degradation. Calibrate against actual traffic.

## Burn rate and deploy freezes

The error budget for a 30-day month with 99.9% SLO: 0.1% × 30 days × 24 hours × 60 min = ~43 minutes.

Track real-time burn rate. If you've consumed 50% of the month's budget in the first week, that's a 4× expected burn rate. Freeze risky deploys (new model versions, infrastructure changes) until the burn rate normalizes.

The discipline: pre-decide the freeze trigger. If 2× burn rate for 24 hours triggers a freeze, the engineer on call doesn't have to negotiate during an incident. Reduces friction; improves response.

## Quality budgets, not just availability

LLM SLOs extend beyond uptime. Define:
- **Quality eval score floor** (e.g., online eval mean > 0.85).
- **Drift PSI ceiling** (e.g., PSI < 0.25 day-over-day).
- **Hallucination rate ceiling** (e.g., < 5% of audited outputs).

When a quality budget is consumed, the same freeze logic applies. Quality regressions get the same treatment as latency regressions — pre-agreed thresholds, automatic freeze, calm post-incident review.

<!-- tier:grad -->
# SLOs and Error Budgets (Grad)

Putting it into practice:

- **Tier your services**: customer-facing routes get tighter SLOs than internal batch jobs. The error budget is per-route.
- **SLO coverage**: not every route needs an SLO. Pick the 10-20% of routes that drive 90% of user-perceived value.
- **Don't over-spec**: 99.9999% sounds great but is impossible to achieve and even harder to detect-vs-noise. 99.95% is realistic; 99.99% is hard; beyond is mostly compliance theater.
- **Externalize the report**: publish SLO performance to internal stakeholders monthly. The team that quietly misses its own SLOs without anyone noticing is... about to have a public incident.

The Google SRE book is the canonical reference; chapters 4 ("Service-Level Objectives") and 5 ("Eliminating Toil") are essential reading. The ML adaptation is essentially: same shape, more dimensions. ML services have quality + drift on top of availability + latency.

For a 0-to-1 ML team, the order to introduce these:
1. Latency p95 SLO + dashboard.
2. Availability SLO with error budget tracking.
3. Quality eval (online-eval-driven score) SLO.
4. Drift SLO (PSI ceiling).
5. Burn-rate alerts + automatic freeze policy.

This sequence matches the order in which problems become visible. Most teams skip steps 3-5 and pay for it the first time they ship a silent quality regression.
