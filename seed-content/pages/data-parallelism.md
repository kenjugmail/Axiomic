---
title: Data Parallelism (DDP)
category: systems
---
<!-- tier:intro -->
# Data Parallelism (DDP)

Data parallelism is the simplest way to train across multiple GPUs: replicate the model on every GPU, give each GPU a different slice of the batch, average gradients across GPUs after every step.

PyTorch's `DistributedDataParallel` (DDP) is the production-grade implementation. The older `DataParallel` exists but is slower and deprecated for non-trivial workloads.

After every step, every GPU has identical weights. The model stays in sync without ever materializing on a single device.

<!-- tier:undergrad -->
# Data Parallelism (Undergrad)

## DDP step in detail

```python
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP

dist.init_process_group(backend="nccl")
model = MyModel().cuda(local_rank)
model = DDP(model, device_ids=[local_rank])

for batch in dataloader:           # DistributedSampler shards batch across ranks
    loss = model(batch)
    loss.backward()                # auto all-reduces gradients
    optimizer.step()
    optimizer.zero_grad()
```

Each rank runs an independent process. NCCL (the NVIDIA collective comm library) handles the all-reduce in C++ outside the Python GIL. Gradient all-reduces overlap with backward computation — as soon as a layer's gradient is computed, its all-reduce kicks off while the next layer's backward is still running.

## All-reduce mechanics

All-reduce is the workhorse: every GPU has a tensor; every GPU ends up with the elementwise sum (or mean). NCCL implements two algorithms:

- **Ring**: GPUs in a ring; partial sums circulate. Bandwidth-optimal for large tensors.
- **Tree**: GPUs in a tree; reduce up to root, broadcast down. Latency-optimal for small tensors.

NCCL picks dynamically based on message size. Practical floor: 1 GB all-reduce across 8 H100s on NVLink takes ~2-3 ms.

## Effective batch size and LR scaling

DDP scales effective batch size by `world_size`. With per-GPU batch 8 and 64 GPUs, the effective batch is 512.

For SGD: linear LR scaling — multiply LR by `world_size`. For Adam: sub-linear, often `√world_size`. Always pair LR scaling with warmup over the first 1-5% of steps.

## Gradient accumulation

```python
for i, batch in enumerate(dataloader):
    loss = model(batch) / accum_steps
    loss.backward()
    if (i + 1) % accum_steps == 0:
        optimizer.step()
        optimizer.zero_grad()
```

Skips the all-reduce on intermediate steps (use `model.no_sync()` context manager). Trades latency for fewer comm rounds — useful when network bandwidth is the bottleneck.

<!-- tier:grad -->
# Data Parallelism (Grad)

When DDP isn't enough:

1. **Model doesn't fit on one GPU**: DP replicates; the model is still full-size on every rank. Switch to FSDP or ZeRO-3 to shard state.
2. **Activations dominate memory**: long-context training overflows even when weights fit. Use sequence parallelism (Megatron-LM) or gradient checkpointing.
3. **Inter-host bandwidth dominates step time**: NVLink intra-host = 900 GB/s; InfiniBand inter-host = 25-50 GB/s. The 20-36× ratio bottlenecks multi-host all-reduce. Use TP intra-host + DP across hosts (3D parallelism).

Modern frontier training uses DDP at the outermost replica layer, FSDP / TP / PP inside. The combination is sometimes called "3D parallelism" (Megatron-DeepSpeed, ColossalAI). The principle: each parallelism strategy has a bandwidth tax that should match its level of the interconnect hierarchy.

DDP remains the default outer ring even at 1000-GPU scale because it's simple, well-supported, and overlaps cleanly with the inner parallelism layers.
