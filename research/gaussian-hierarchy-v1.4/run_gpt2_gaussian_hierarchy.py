from __future__ import annotations

import argparse
import copy
import json
import math
import platform
import re
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import numpy as np
import pandas as pd
import torch
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform


@dataclass(frozen=True)
class Env:
    name: str
    A: np.ndarray
    Y: np.ndarray


def energy(env: Env, eps: float = 1e-12) -> float:
    return float(np.sum(env.Y * env.Y) / env.Y.shape[0] + eps)


def risks(envs: Sequence[Env], subset: np.ndarray, B: np.ndarray) -> np.ndarray:
    return np.asarray([
        np.sum((e.Y - e.A[:, subset] @ B) ** 2) / e.Y.shape[0] / energy(e) for e in envs
    ])


def normalized_refit(envs: Sequence[Env], subset: np.ndarray, q: np.ndarray, ridge: float = 2e-6) -> np.ndarray:
    q = np.asarray(q, dtype=np.float64); q /= q.sum()
    xs, ys = [], []
    for w, e in zip(q, envs, strict=True):
        scale = np.sqrt(w / (e.Y.shape[0] * energy(e)))
        xs.append(e.A[:, subset] * scale); ys.append(e.Y * scale)
    X = np.concatenate(xs, axis=0); T = np.concatenate(ys, axis=0)
    k = len(subset)
    if k <= X.shape[0]:
        return np.linalg.solve(X.T @ X + ridge * np.eye(k), X.T @ T)
    return X.T @ np.linalg.solve(X @ X.T + ridge * np.eye(X.shape[0]), T)


def minimax_refit(envs: Sequence[Env], subset: np.ndarray, ridge: float = 2e-6, iterations: int = 10):
    q = np.full(len(envs), 1.0 / len(envs)); logq = np.log(q)
    B = normalized_refit(envs, subset, q, ridge); r = risks(envs, subset, B)
    best = (float(r.max()), B.copy(), q.copy(), r.copy())
    for t in range(iterations):
        logq += (1.5 / np.sqrt(t + 1.0)) * (r - r.mean())
        logq -= logq.max(); q = np.exp(logq); q /= q.sum()
        B = normalized_refit(envs, subset, q, ridge); r = risks(envs, subset, B)
        if float(r.max()) < best[0]: best = (float(r.max()), B.copy(), q.copy(), r.copy())
    return best[1], best[2], best[3]


GUTENBERG = {
    "alice": "https://www.gutenberg.org/files/11/11-0.txt",
    "pride": "https://www.gutenberg.org/files/1342/1342-0.txt",
    "hamlet": "https://www.gutenberg.org/files/1524/1524-0.txt",
    "romeo": "https://www.gutenberg.org/files/1513/1513-0.txt",
}


def download(url: str, path: Path) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as r: path.write_bytes(r.read())
    return path.read_text(encoding="utf-8", errors="replace")


def strip_gutenberg(text: str) -> str:
    start = re.search(r"\*\*\* START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", text, re.I)
    end = re.search(r"\*\*\* END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK.*?\*\*\*", text, re.I)
    if start: text = text[start.end():]
    if end: text = text[:end.start()]
    return text.strip()


def corpora(root: Path, cache: Path):
    texts = {k: strip_gutenberg(download(v, cache / f"{k}.txt")) for k, v in GUTENBERG.items()}
    code_cal = "\n".join(p.read_text(errors="replace") for p in sorted(root.rglob("*.py"))[:10])
    code_eval = "\n".join(p.read_text(errors="replace") for p in sorted(root.rglob("*.tex"))[:10])
    return {
        "prose": (texts["alice"], texts["pride"]),
        "dialogue": (texts["hamlet"], texts["romeo"]),
        "code": (code_cal, code_eval),
    }


def chunks(tokenizer, text: str, length: int, count: int, offset: int) -> torch.Tensor:
    ids = tokenizer.encode(text, add_special_tokens=False)
    need = offset + length * count
    if len(ids) < need: ids = (ids * math.ceil(need / max(len(ids), 1)))[:need]
    return torch.tensor([ids[offset+i*length:offset+(i+1)*length] for i in range(count)], dtype=torch.long)


def collect_activations(model, ids: torch.Tensor, layer: int, device: torch.device) -> np.ndarray:
    captured = []
    def hook(_module, args): captured.append(args[0].detach().float().cpu())
    h = model.transformer.h[layer].mlp.c_proj.register_forward_pre_hook(hook)
    try:
        with torch.no_grad():
            for batch in ids.split(2): model(batch.to(device))
    finally: h.remove()
    return torch.cat(captured).reshape(-1, captured[0].shape[-1]).numpy().astype(np.float64)


def perplexity(model, ids: torch.Tensor, device: torch.device) -> float:
    nll = 0.0; tokens = 0
    model.eval()
    with torch.no_grad():
        for batch in ids.split(2):
            batch = batch.to(device); out = model(batch, labels=batch)
            n = batch.numel() - batch.shape[0]
            nll += float(out.loss) * n; tokens += n
    return float(math.exp(nll / tokens))


def output_basis(envs: Sequence[Env], rank: int) -> np.ndarray:
    Y = np.concatenate([e.Y for e in envs], axis=0)
    Y -= Y.mean(0, keepdims=True)
    _, _, vt = np.linalg.svd(Y, full_matrices=False)
    return vt[:rank].T


def operator_sketches(envs: Sequence[Env], outgoing: np.ndarray, *, rank: int, probes: int, bootstraps: int, seed: int):
    rng = np.random.default_rng(seed); P = output_basis(envs, rank); W = outgoing @ P
    full_parts = []
    sum_b = None; sumsq_b = None
    for b in range(bootstraps):
        parts = []
        for ei, e in enumerate(envs):
            local = np.random.default_rng(seed + 1009 * (ei + 1))
            R = local.normal(size=(probes, e.A.shape[0])) / np.sqrt(probes * e.A.shape[0])
            if b == 0:
                projected = (R @ e.A).T
                z = np.einsum("mp,mr->mpr", projected, W).reshape(e.A.shape[1], -1) / np.sqrt(energy(e))
                full_parts.append(z.astype(np.float32))
            weights = rng.exponential(size=e.A.shape[0]); weights /= weights.mean()
            projected_b = (R @ (e.A * weights[:, None])).T
            zb = np.einsum("mp,mr->mpr", projected_b, W).reshape(e.A.shape[1], -1) / np.sqrt(energy(e))
            parts.append(zb.astype(np.float32))
        Zb = np.concatenate(parts, axis=1)
        if sum_b is None:
            sum_b = Zb.astype(np.float64); sumsq_b = Zb.astype(np.float64) ** 2
        else:
            sum_b += Zb; sumsq_b += Zb.astype(np.float64) ** 2
    raw = np.concatenate(full_parts, axis=1).astype(np.float64)
    mean = sum_b / bootstraps
    sample_var = np.maximum((sumsq_b - bootstraps * mean**2) / max(bootstraps - 1, 1), 0.0)
    observation_var = sample_var / bootstraps
    tau = np.maximum(mean.var(axis=0, ddof=1) - observation_var.mean(axis=0), 1e-12)
    gain = tau[None] / (tau[None] + observation_var)
    post_mean = gain * mean
    post_var = tau[None] * observation_var / (tau[None] + observation_var)
    signal = np.sum(post_mean**2, axis=1); unc = np.sum(post_var, axis=1)
    ufrac = unc / (signal + unc + 1e-12)
    return raw, post_mean, post_var, ufrac


def prepare_tree(mean: np.ndarray, variance: np.ndarray, ufrac: np.ndarray, penalty: float):
    en = np.linalg.norm(mean, axis=1); active = np.where(en > max(1e-12, 1e-7 * en.max()))[0]
    X = mean[active]; n = np.linalg.norm(X, axis=1)
    cos = np.clip((X @ X.T) / (n[:,None]*n[None,:] + 1e-12), -1, 1)
    D = 1-cos + penalty*(ufrac[active,None] + ufrac[active][None,:])
    D = np.maximum((D+D.T)/2, 0); np.fill_diagonal(D, 0)
    return {"mean":mean,"variance":variance,"ufrac":ufrac,"energy":en,"active":active,
            "tree":linkage(squareform(D, checks=False), method="average"),"penalty":penalty}


def cut_tree(prep, keep: int, extra: int = 96):
    mean=prep["mean"];var=prep["variance"];u=prep["ufrac"];active=prep["active"];tree=prep["tree"];pen=prep["penalty"]
    labels=fcluster(tree,t=min(len(active),keep+extra),criterion="maxclust")
    reps=[];scores=[];clusters=[]
    for lab in np.unique(labels):
        members=active[np.where(labels==lab)[0]]; cent=mean[members].mean(0); cn=np.linalg.norm(cent)
        align=(mean[members]@cent)/(np.linalg.norm(mean[members],axis=1)*cn+1e-12)
        rep=int(members[np.argmax(align-pen*u[members])])
        e=max(float(np.sum(cent**2)-np.mean(np.sum(var[members],axis=1))),0)*np.sqrt(len(members))
        reps.append(rep);scores.append(e);clusters.append([int(x) for x in members])
    chosen=np.argsort(scores)[::-1][:keep]
    return np.sort(np.asarray(reps,dtype=int)[chosen]), {"clusters":clusters,"representatives":reps,"scores":scores}


def diagonal_subset(envs: Sequence[Env], outgoing: np.ndarray, incoming: np.ndarray, keep: int, method: str):
    out=np.sum(outgoing**2,axis=1)
    second=np.stack([np.mean(e.A**2,axis=0)*out/energy(e) for e in envs])
    if method=="magnitude": score=np.linalg.norm(incoming,axis=0)*np.sqrt(out)
    elif method=="wanda": score=np.mean([np.mean(np.abs(e.A),axis=0) for e in envs],axis=0)*np.sqrt(out)
    elif method=="robust_capacity": score=second.max(0)
    else: raise ValueError(method)
    return np.sort(np.argpartition(score,-keep)[-keep:])


def rebuild(model, layer: int, subset: np.ndarray, B: np.ndarray):
    from transformers.pytorch_utils import Conv1D
    mlp=model.transformer.h[layer].mlp; oldfc=mlp.c_fc; oldp=mlp.c_proj
    device=oldfc.weight.device;dtype=oldfc.weight.dtype;d=oldfc.weight.shape[0];k=len(subset)
    fc=Conv1D(k,d).to(device=device,dtype=dtype);proj=Conv1D(d,k).to(device=device,dtype=dtype)
    with torch.no_grad():
        fc.weight.copy_(oldfc.weight[:,subset]);fc.bias.copy_(oldfc.bias[subset])
        proj.weight.copy_(torch.as_tensor(B,device=device,dtype=dtype));proj.bias.copy_(oldp.bias)
    mlp.c_fc=fc;mlp.c_proj=proj


def main():
    ap=argparse.ArgumentParser();ap.add_argument("--output",type=Path,default=Path("results/gpt2_gaussian_hierarchy"))
    ap.add_argument("--model",default="openai-community/gpt2");ap.add_argument("--layer",type=int,default=5)
    ap.add_argument("--length",type=int,default=64);ap.add_argument("--cal-chunks",type=int,default=2);ap.add_argument("--eval-chunks",type=int,default=4)
    args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    from transformers import AutoModelForCausalLM, AutoTokenizer, __version__ as tv
    device=torch.device("cuda" if torch.cuda.is_available() else "cpu")
    tok=AutoTokenizer.from_pretrained(args.model);model=AutoModelForCausalLM.from_pretrained(args.model,dtype=torch.float32).to(device).eval()
    revision=getattr(model.config,"_commit_hash",None); root=Path(__file__).resolve().parents[2]
    data=corpora(root,args.output/"corpus_cache")
    cal_ids={k:chunks(tok,v[0],args.length,args.cal_chunks,64) for k,v in data.items()}
    eval_ids={k:chunks(tok,v[1],args.length,args.eval_chunks,128) for k,v in data.items()}
    cal_A={k:collect_activations(model,v,args.layer,device) for k,v in cal_ids.items()}
    eval_A={k:collect_activations(model,v,args.layer,device) for k,v in eval_ids.items()}
    mlp=model.transformer.h[args.layer].mlp
    incoming=mlp.c_fc.weight.detach().float().cpu().numpy().astype(np.float64)
    outgoing=mlp.c_proj.weight.detach().float().cpu().numpy().astype(np.float64)
    cal_env=[Env(k,A,A@outgoing) for k,A in cal_A.items()]; eval_env=[Env(k,A,A@outgoing) for k,A in eval_A.items()]
    raw,gm,gv,gu=operator_sketches(cal_env,outgoing,rank=24,probes=4,bootstraps=12,seed=20260801)
    raw_p=prepare_tree(raw,np.zeros_like(raw),np.zeros(raw.shape[0]),0.0)
    gau_p=prepare_tree(gm,gv,gu,1.0)
    base_ppl={k:perplexity(model,v,device) for k,v in eval_ids.items()};base_params=sum(p.numel() for p in model.parameters());width=outgoing.shape[0]
    rows=[];diagnostics={}
    for reduction in (0.25,0.50,0.60):
        keep=width-int(round(width*reduction))
        candidates={
            "magnitude":diagonal_subset(cal_env,outgoing,incoming,keep,"magnitude"),
            "wanda":diagonal_subset(cal_env,outgoing,incoming,keep,"wanda"),
            "robust_capacity":diagonal_subset(cal_env,outgoing,incoming,keep,"robust_capacity"),
        }
        candidates["raw_merge_tree"],diagnostics[f"raw_{int(reduction*100)}"]=cut_tree(raw_p,keep)
        candidates["gaussian_merge_tree"],diagnostics[f"gaussian_{int(reduction*100)}"]=cut_tree(gau_p,keep)
        for method,subset in candidates.items():
            started=time.perf_counter();B,q,seen=minimax_refit(cal_env,subset,iterations=10);held=risks(eval_env,subset,B)
            compressed=copy.deepcopy(model);rebuild(compressed,args.layer,subset,B)
            ppl={k:perplexity(compressed,v,device) for k,v in eval_ids.items()};params=sum(p.numel() for p in compressed.parameters())
            rel={k:(ppl[k]-base_ppl[k])/base_ppl[k] for k in ppl}
            rows.append({"method":method,"width_reduction":reduction,"original_width":width,"retained_width":keep,
                "worst_layer_risk":float(held.max()),"mean_layer_risk":float(held.mean()),"worst_relative_ppl_change":float(max(rel.values())),
                "mean_relative_ppl_change":float(np.mean(list(rel.values()))),"parameter_reduction_total_fraction":(base_params-params)/base_params,
                "refit_weights":json.dumps(q.tolist()),"elapsed_seconds":time.perf_counter()-started,
                **{f"ppl_{k}":ppl[k] for k in ppl},**{f"relative_ppl_change_{k}":rel[k] for k in rel}})
            del compressed
    frame=pd.DataFrame(rows);frame.to_csv(args.output/"raw_results.csv",index=False)
    summary={"status":"completed","scope":"One GPT-2 Small block; three fixed domains; hierarchical functional compression to 25%, 50%, and 60% local width reduction.",
        "model":args.model,"resolved_revision":revision,"layer":args.layer,"transformers":tv,"torch":torch.__version__,"python":platform.python_version(),
        "device":str(device),"calibration_tokens_per_domain":args.length*args.cal_chunks,"evaluation_tokens_per_domain":args.length*args.eval_chunks,
        "base_perplexity":base_ppl,"mean_gaussian_uncertainty_fraction":float(gu.mean()),"rows":frame.to_dict(orient="records"),"diagnostics":diagnostics}
    (args.output/"summary.json").write_text(json.dumps(summary,indent=2));(args.output/"resolved_model_revision.txt").write_text(str(revision))

if __name__=="__main__": main()
