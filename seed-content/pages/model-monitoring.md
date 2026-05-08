---
title: Model Monitoring
category: systems
---
<!-- tier:intro -->
# Model Monitoring

Standard service monitoring (uptime, latency, error rate) catches "the service is down." Model monitoring catches "the service is up and silently wrong" — quality regressions that don't throw exceptions.

Four layers:

1. **Service health** (standard SRE)
2. **Input distribution drift** (PSI, KL on engineered features)
3. **Output distribution drift** (refusal rate, mean length, structured-output validity)
4. **Online evaluation** (a sample of traffic through a quality harness)

Most teams ship with layer 1 only. The other three catch regressions that layer 1 can't see.

<!-- tier:undergrad -->
# Model Monitoring (Undergrad)

## Layer 1: service health

The standard SRE stack: Prometheus + Grafana, latency p50/p95/p99, error rate, throughput, GPU utilization, HBM use. Use the same tooling as the rest of the org. Sufficient for "is the service up?" Insufficient for "is the service correct?"

Common dashboards:
- Latency over time, broken out by endpoint
- Error rate by status code
- Throughput in tokens/sec
- GPU utilization, HBM use, NCCL bandwidth

## Layer 2: input drift via PSI

[[drift-detection]] covers this in detail. Brief version: log every request input, daily aggregate engineered features (length, language, topic, embedding centroid distance), compute PSI vs a baseline reference distribution.

PSI > 0.25 alerts; 0.1-0.25 warns; <0.1 is stable.

## Layer 3: output drift

Same shape, applied to outputs. Track:
- **Refusal rate** (how often the model declines to answer).
- **Mean output length**.
- **Structured-output validity** (for JSON-mode endpoints: % of outputs that parse).
- **Terminal token distribution** (for code generation: % ending in `}` vs incomplete).
- **Hallucination-detector scores** (a separate small model scoring outputs).

Day-over-day deltas alert on shifts. Common triggers: a new prompt template, a new system instruction, a model swap.

## Layer 4: online eval

Sample 1-5% of production traffic into a queue. Async eval harness scores each:
- LLM-as-judge against a reference model
- Factuality checks (cited claims found in source)
- Instruction-following (does the output address the prompt?)
- Schema validation (for structured outputs)

Score distribution dashboard + alerts on drift. Direct measurement of production quality at the cost of running inference twice on a small slice.

## SLOs and error budgets

Define numerical SLOs:
- TTFT p95 < 500 ms
- End-to-end latency p95 < 5 s
- Quality eval mean > 0.85
- Drift PSI < 0.25

Track burn rate. If you've burned a month's error budget in week 1, freeze deploys until the budget resets.

<!-- tier:grad -->
# Model Monitoring (Grad)

Tooling stacks that work:

- **Open-source DIY**: Prometheus + Grafana + a small Python service for online eval. Cheap, customizable, lots of glue code.
- **Hosted**: Arize, Fiddler, WhyLabs, Aporia. Higher per-month cost; lower setup cost; less flexibility.
- **Hybrid**: standard SRE tooling for layer 1; a hosted ML monitoring service for layers 2-4.

Quality budgets, separately:
- Reserve compute for online eval (1-5% of inference cost).
- Reserve human eval bandwidth for periodic quality audits (~10 hours/quarter for a domain expert reviewing flagged outputs).
- Maintain a fixed eval harness — never change it without versioning. The harness is the measurement instrument; calibration drift on the instrument breaks everything downstream.

Anti-patterns:
- Adding monitoring after a quality regression bites. (You won't have the baseline reference distribution; layer-2 alerts won't fire until you have weeks of post-regression data.)
- Treating layer 1 as sufficient. (It catches "service is broken"; not "service is wrong.")
- Letting eval-set quality drift. (The eval set becomes the de-facto definition of quality. If it stops mattering to users, you're optimizing the wrong thing.)

The teams that ship reliable production ML have all four layers from day 1, not added retroactively after the first incident. The setup cost is roughly 0.5 FTE-month; the first regression caught pays for it.
