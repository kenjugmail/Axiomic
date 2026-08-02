from __future__ import annotations

import argparse
import json
import platform
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from fac.atlas import AuditConfig, audit_components, label_distribution_js, match_dictionaries
from fac.natural_text_model import CONCEPT_NAMES, generate_texts
from fac.sae import train_sae


def _write_status(output: Path, model: str, layer: int, reason: str, exc: Exception) -> None:
    status = {
        "status": "not_run",
        "scope": "Pythia-70M raw-neuron and sparse-autoencoder atlas audit; no quantitative result was produced.",
        "model": model,
        "layer": layer,
        "reason": reason,
        "exception_type": type(exc).__name__,
        "exception": str(exc),
        "python_version": platform.python_version(),
        "torch_version": torch.__version__,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "status.json").write_text(json.dumps(status, indent=2))
    print(json.dumps(status, indent=2))


def _encode_batches(tokenizer, texts: list[str], max_length: int, batch_size: int = 16):
    for start in range(0, len(texts), batch_size):
        yield tokenizer(
            texts[start : start + batch_size],
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="pt",
        )


def collect(model, tokenizer, texts: list[str], layer: int, device: torch.device, max_length: int) -> np.ndarray:
    captured: list[torch.Tensor] = []
    mlp = model.gpt_neox.layers[layer].mlp

    def hook(_module, args):
        captured.append(args[0].detach().float().cpu())

    handle = mlp.dense_4h_to_h.register_forward_pre_hook(hook)
    pooled: list[torch.Tensor] = []
    try:
        with torch.no_grad():
            for batch in _encode_batches(tokenizer, texts, max_length):
                mask = batch["attention_mask"].to(device)
                model(**{k: v.to(device) for k, v in batch.items()})
                activations = captured.pop(0)
                weights = mask.cpu().unsqueeze(-1).to(activations.dtype)
                pooled.append((activations * weights).sum(1) / weights.sum(1).clamp_min(1.0))
    finally:
        handle.remove()
    return torch.cat(pooled).numpy().astype(np.float64)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("results/pythia70m_audit_v1"))
    parser.add_argument("--model", default="EleutherAI/pythia-70m-deduped")
    parser.add_argument("--revision", default="main")
    parser.add_argument("--layer", type=int, default=3)
    parser.add_argument("--samples", type=int, default=600)
    parser.add_argument("--max-length", type=int, default=48)
    parser.add_argument("--raw-top-k", type=int, default=96)
    parser.add_argument("--sae-width-a", type=int, default=128)
    parser.add_argument("--sae-width-b", type=int, default=192)
    parser.add_argument("--sae-steps", type=int, default=150)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(1)

    try:
        from transformers import AutoModelForCausalLM, AutoTokenizer, __version__ as transformers_version
    except Exception as exc:
        _write_status(args.output, args.model, args.layer, "required_dependency_unavailable", exc)
        raise

    try:
        tokenizer = AutoTokenizer.from_pretrained(args.model, revision=args.revision)
        if tokenizer.pad_token_id is None:
            tokenizer.pad_token = tokenizer.eos_token
        model = AutoModelForCausalLM.from_pretrained(
            args.model,
            revision=args.revision,
            torch_dtype=torch.float32,
        )
    except Exception as exc:
        _write_status(args.output, args.model, args.layer, "model_or_tokenizer_unavailable", exc)
        raise

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device).eval()
    discovery_texts, discovery_labels = generate_texts(args.samples, 31001)
    evaluation_texts, evaluation_labels = generate_texts(args.samples, 31002)
    discovery_activations = collect(model, tokenizer, discovery_texts, args.layer, device, args.max_length)
    evaluation_activations = collect(model, tokenizer, evaluation_texts, args.layer, device, args.max_length)

    mlp = model.gpt_neox.layers[args.layer].mlp
    outgoing = mlp.dense_4h_to_h.weight.detach().float().cpu().numpy().T.astype(np.float64)
    capacity = np.sqrt(np.mean(evaluation_activations * evaluation_activations, axis=0)) * np.linalg.norm(outgoing, axis=1)
    count = min(args.raw_top_k, len(capacity))
    subset = np.sort(np.argpartition(capacity, -count)[-count:])
    discovery_raw = discovery_activations[:, subset]
    evaluation_raw = evaluation_activations[:, subset]
    outgoing_raw = outgoing[subset]
    evaluation_output = evaluation_activations @ outgoing

    raw = audit_components(
        discovery_raw,
        evaluation_raw,
        discovery_labels.astype(int),
        evaluation_labels.astype(int),
        CONCEPT_NAMES,
        outgoing_raw,
        evaluation_output,
        unit_names=[f"layer{args.layer}_neuron_{i}" for i in subset],
        unit_families=["pythia_raw_neuron"] * len(subset),
        config=AuditConfig(bootstrap_draws=40, stability_draws=15, seed=0),
    )
    sae_a = train_sae(
        discovery_activations,
        evaluation_activations,
        outgoing,
        width=args.sae_width_a,
        seed=401,
        steps=args.sae_steps,
    )
    sae_b = train_sae(
        discovery_activations,
        evaluation_activations,
        outgoing,
        width=args.sae_width_b,
        seed=402,
        steps=args.sae_steps,
    )
    records_a = audit_components(
        sae_a.train_features,
        sae_a.evaluation_features,
        discovery_labels.astype(int),
        evaluation_labels.astype(int),
        CONCEPT_NAMES,
        sae_a.feature_write_vectors,
        evaluation_output,
        unit_families=[f"pythia_sae{args.sae_width_a}"] * args.sae_width_a,
        config=AuditConfig(bootstrap_draws=16, stability_draws=6, seed=1),
    )
    records_b = audit_components(
        sae_b.train_features,
        sae_b.evaluation_features,
        discovery_labels.astype(int),
        evaluation_labels.astype(int),
        CONCEPT_NAMES,
        sae_b.feature_write_vectors,
        evaluation_output,
        unit_families=[f"pythia_sae{args.sae_width_b}"] * args.sae_width_b,
        config=AuditConfig(bootstrap_draws=16, stability_draws=6, seed=2),
    )
    rows, columns, similarities = match_dictionaries(
        sae_a.evaluation_features,
        sae_a.feature_write_vectors,
        sae_b.evaluation_features,
        sae_b.feature_write_vectors,
    )

    raw_frame = pd.DataFrame(raw)
    raw_frame.to_csv(args.output / "raw_neuron_atlas.csv", index=False)
    pd.DataFrame(records_a).to_csv(args.output / f"sae{args.sae_width_a}_atlas.csv", index=False)
    pd.DataFrame(records_b).to_csv(args.output / f"sae{args.sae_width_b}_atlas.csv", index=False)

    summary = {
        "status": "completed",
        "scope": "Single-model, single-layer Pythia-70M sanity audit; not a general mechanistic-interpretability result.",
        "model": args.model,
        "revision_requested": args.revision,
        "resolved_revision": getattr(model.config, "_commit_hash", None),
        "transformers_version": transformers_version,
        "torch_version": torch.__version__,
        "device": str(device),
        "layer": args.layer,
        "samples_per_split": args.samples,
        "raw_neurons_audited": len(subset),
        "raw_mean_heldout_auc": float(raw_frame.heldout_auc.mean()),
        "raw_supported_active_fraction": float(raw_frame.evidence_tier.eq("supported-active").mean()),
        "sae_matched_label_agreement": float(
            np.mean(
                [
                    records_a[int(i)]["candidate_label"] == records_b[int(j)]["candidate_label"]
                    for i, j in zip(rows, columns, strict=True)
                ]
            )
        ),
        "sae_matched_operator_cosine": float(np.mean(np.abs(similarities))),
        "sae_label_js": label_distribution_js(records_a, records_b, CONCEPT_NAMES),
        "sae_a_reconstruction_nmse": sae_a.reconstruction_nmse,
        "sae_b_reconstruction_nmse": sae_b.reconstruction_nmse,
        "sae_a_output_nmse": sae_a.output_reconstruction_nmse,
        "sae_b_output_nmse": sae_b.output_reconstruction_nmse,
        "sae_a_width": args.sae_width_a,
        "sae_b_width": args.sae_width_b,
        "sae_a_mean_l0": sae_a.mean_l0,
        "sae_b_mean_l0": sae_b.mean_l0,
        "sae_a_dead_feature_fraction": sae_a.dead_feature_fraction,
        "sae_b_dead_feature_fraction": sae_b.dead_feature_fraction,
    }
    (args.output / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
