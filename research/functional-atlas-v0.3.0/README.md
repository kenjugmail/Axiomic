# Functional Atlas Research Program v0.3.0

This directory is the public, exact controlled-experiment snapshot for two companion studies:

- **Distribution-Robust Functional Subset Projection (DR-FSP)**
- **Auditable Functional Atlases (AFA)**

The snapshot contains executable Python source, tests, configurations, the MIT license, and the raw aggregate/per-seed outputs used in the v0.3 manuscripts. The release corrects the normalized-risk refit algebra to use `q_e/(n_e d_e)`, reruns all affected experiments, separates subset selection from refitting, adds exact small-problem checks, and expands the atlas audit with causal diagnostics and independently trained sparse dictionaries.

**Scientific status:** controlled proof of concept. No pretrained-language-model or GPU result is claimed.

## Reconstruct the exact archive

The compressed archive is stored as six ordinary-text Base64 parts so the snapshot remains portable through GitHub's text API.

```bash
python restore_release.py --extract
cd functional-atlas-v0.3.0
python -m pip install -e ".[dev]"
python -m pytest -q
```

Expected test result: `23 passed`.

The reconstructed archive is `functional-atlas-v0.3.0-core-source-results.tar.gz`. Its SHA-256 is recorded in `SHA256SUMS.txt` and verified automatically by the restore script.

For quick review, the key raw DR-FSP and AFA result files are also exposed directly in `raw-results/`.

## Scope

The archive includes the exact code and raw summaries required to rerun the controlled experiments. Large legacy checkpoints and rendered PDFs are distributed with the manuscript artifact rather than duplicated here; the controlled models can be regenerated from the included code and seeds.

## License

MIT. See `LICENSE`.
