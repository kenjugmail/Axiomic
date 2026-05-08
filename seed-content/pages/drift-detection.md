---
title: Drift Detection
category: systems
---
<!-- tier:intro -->
# Drift Detection

Drift is when production input or output distributions shift from a baseline reference. Sometimes obvious (the user query language switches from English to Spanish). Sometimes subtle (the average prompt length creeps up by 20% over six months as users learn what works).

Drift detection alerts on these shifts before quality regresses noticeably. The standard tool is **Population Stability Index (PSI)**.

<!-- tier:undergrad -->
# Drift Detection (Undergrad)

## PSI

For binned features, compute the proportion in the reference distribution `P` and the production distribution `Q`:

```
PSI(P, Q) = Σᵢ (Pᵢ - Qᵢ) · log(Pᵢ / Qᵢ)
```

Rules of thumb:
- **PSI < 0.1**: no drift. Stable.
- **0.1-0.25**: minor drift. Monitor.
- **> 0.25**: significant drift. Investigate.

PSI is symmetric and bounded; cheaper than full KL because it's a sum over bins. Standard for tabular ML monitoring; works just as well for engineered features on text.

## Features to track on text inputs

- **Length** (token count or byte count): long-shift means user behavior changed or upstream prompt template grew.
- **Language** (langdetect): catches new locale launches that weren't planned for.
- **Topic** (small embedding-clustered classifier): catches major use-case shifts.
- **Special-character fraction**: proxy for code vs prose vs structured text.
- **Embedding centroid distance**: cosine distance from training centroids. Catches semantic drift not visible in the surface features.

## Features to track on outputs

- **Length distribution**.
- **Refusal rate** (for chat models): % of outputs that decline.
- **Terminal token frequency**: does output end with `.` vs `}` vs incomplete?
- **Sentiment skew** (small sentiment classifier).
- **Validity rate** (for structured outputs: % that parse).

Each is a one-line aggregation in your serving stack and a one-line dashboard panel. Aggregate daily; alert when PSI crosses 0.25.

## Data drift vs concept drift

- **Data drift**: input distribution changed; the relationship between inputs and labels is unchanged. Solvable by retraining or coverage of the new distribution.
- **Concept drift**: the relationship between inputs and outputs/labels changed. Same input now needs a different label. Harder; requires retraining with fresh labels.

PSI catches both as inputs/outputs drift, but the remediation is different. When PSI fires, the next investigation is "is this data drift (we need more coverage) or concept drift (the world changed)?"

<!-- tier:grad -->
# Drift Detection (Grad)

Beyond PSI:

- **Maximum mean discrepancy (MMD)**: kernel-based two-sample test. More powerful than PSI on continuous high-dimensional features. Higher compute cost.
- **KS test**: for one-dimensional continuous features. Cheap, well-understood, less applicable to high-dimensional text.
- **Earth mover's distance (Wasserstein)**: more sensitive to ordinal differences than PSI. Useful when the bin ordering matters.
- **Embedding distance**: cosine distance between today's average embedding and the reference. Rough but cheap; catches large semantic shifts.

Practical setup:

```python
# nightly batch
from production_logs import load_inputs_for_day
from baseline import REFERENCE_FEATURES

today = compute_features(load_inputs_for_day(yesterday))
reference = REFERENCE_FEATURES  # last month's distribution

for feature in ("length", "language", "topic"):
    psi = compute_psi(reference[feature], today[feature], num_bins=10)
    log_metric(f"drift.psi.{feature}", psi)
    if psi > 0.25:
        alert(f"PSI drift on {feature}: {psi:.3f}")
```

Reset the reference periodically (every quarter). Otherwise PSI grows monotonically as the world moves; eventually everything alerts and the system becomes noise. The reference should be the last "known good" production distribution, not training data — they're often subtly different.
