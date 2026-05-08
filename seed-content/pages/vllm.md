---
title: vLLM
category: systems
---
<!-- tier:intro -->
# vLLM

vLLM is the open-source LLM inference engine that popularized **PagedAttention** and **continuous batching** as the standard production primitives. Originated at UC Berkeley (Kwon et al. 2023); now the most-deployed serving framework for self-hosted LLMs.

Compared to a naive HuggingFace `model.generate()` loop, vLLM gives ~10-20× higher throughput on heterogeneous workloads at comparable latency, with a drop-in OpenAI-API-compatible HTTP server.

<!-- tier:undergrad -->
# vLLM (Undergrad)

## What vLLM gives you

- **PagedAttention**: KV cache as virtual memory. Allocate fixed-size pages on demand; serve many concurrent requests at high utilization.
- **Continuous batching**: as soon as a sequence finishes, free its slot and admit a new request. No waiting for a full static batch.
- **Tensor parallelism**: split the model across GPUs within a host for low TTFT.
- **Speculative decoding**: optional draft-model decoding for 2-3× throughput at zero quality cost.
- **OpenAI-compatible API**: `/v1/chat/completions`, `/v1/completions`, `/v1/embeddings` endpoints out of the box.
- **Quantization support**: AWQ, GPTQ, SqueezeLLM, FP8 (Hopper).

## Deploying

```bash
pip install vllm
vllm serve meta-llama/Meta-Llama-3-8B-Instruct \
    --tensor-parallel-size 1 \
    --max-model-len 8192
```

Single-GPU on an A100 / H100. Adds `--tensor-parallel-size 4` to spread across 4 GPUs (TP). The OpenAI-compatible server listens on port 8000 by default.

## Configuration knobs that matter

- **`max-model-len`**: maximum context length. Affects KV cache size; tune to your workload's actual maximum.
- **`gpu-memory-utilization`** (default 0.9): fraction of HBM vLLM may use. Reserve some for the OS and other processes; otherwise OOM.
- **`max-num-seqs`** (default 256): cap on concurrent sequences. Lower if your hardware can't sustain the throughput.
- **`enable-prefix-caching`**: share KV cache pages across requests with the same prefix. Big win for chat assistants with shared system prompts.

## Performance characteristics

A 7B Llama on one H100 with vLLM:
- ~3000-4000 tokens/sec aggregate throughput at high concurrency.
- ~50-80 tokens/sec/user with 50 concurrent users.
- TTFT ~50-100 ms with prefix caching.

Tune `max-num-seqs` + concurrency to your latency SLO; vLLM is bandwidth-bound at high throughput, so the limit is hardware.

<!-- tier:grad -->
# vLLM (Grad)

Production deployment patterns:

- **vLLM behind a router**: a thin Python or Go service in front handles auth, rate limiting, prompt sanitization, structured output validation. vLLM does the heavy compute.
- **Multi-replica fleet**: run multiple vLLM instances behind a load balancer. Each instance handles a slice of traffic. For very-low-latency requirements, isolate latency-sensitive routes on dedicated replicas.
- **Mixed quantization**: FP16 for accuracy-critical routes, AWQ INT4 for throughput-critical routes, served from separate replicas.
- **Speculative decoding**: enable on serving paths where output is somewhat predictable (code completion, structured generation). Larger benefit on lower temperatures.

Alternatives + when to choose them:
- **TGI** (Hugging Face): closer to HF ecosystem, similar features, slightly different perf characteristics. Good when you're already deep in HF tooling.
- **TensorRT-LLM**: NVIDIA-blessed, AOT-compiled kernels, best-in-class throughput on supported hardware. More complex to deploy; locks you to NVIDIA.
- **SGLang**: structured generation primitives (regex, JSON schema constraints) baked in. Useful when output must conform to a schema.
- **Custom**: only if you have specific requirements (long-context, exotic decoding, custom quantization) that vLLM doesn't support.

For 90% of teams, vLLM is the right starting point. Only optimize away from it when profiling shows a specific bottleneck vLLM doesn't address.
