---
title: FSDP / ZeRO
category: systems
---
<!-- tier:intro -->
# FSDP (Fully Sharded Data Parallel)

FSDP shards the model's weights, gradients, and optimizer state across GPUs while preserving DDP-like training dynamics. Each GPU only holds 1/N of the state (where N = world size); the full layer is gathered momentarily for the forward + backward, then released.

Equivalent to ZeRO-3 (Microsoft DeepSpeed). The two implementations have feature parity; PyTorch FSDP is more idiomatic in PyTorch-native codebases.

FSDP enables training models 8-16× larger than DDP fits, on the same hardware.

<!-- tier:undergrad -->
# FSDP (Undergrad)

## ZeRO levels recap

DeepSpeed's ZeRO progression:
- **ZeRO-1**: shard optimizer state only. Saves ~50% of training memory (Adam state is 8 bytes/param vs 2 for weights).
- **ZeRO-2**: shard optimizer + gradients. Saves ~75%.
- **ZeRO-3 / FSDP**: shard everything (weights, grads, optimizer). Saves ~90%+.

PyTorch FSDP corresponds to ZeRO-3 by default. The lighter levels are accessible via the `sharding_strategy` argument.

## FSDP per-step pattern

For each layer in forward:
1. **All-gather** the weight shard from every rank → full weight materializes on every rank.
2. **Forward** through the layer using full weights.
3. **Free** the gathered weights — only the local shard remains.

Backward similarly:
1. All-gather weights again.
2. Compute gradients.
3. **Reduce-scatter** gradients across ranks → each rank ends with the sum of its shard's gradients.
4. Free the gathered weights.

Optimizer step: each rank applies updates to its local shard only.

## Memory accounting

Per GPU memory ≈ `model_size / world_size + active_layer_size + activations`.

For a 70B model on 64 H100s with FSDP:
- Sharded weights+grads+optimizer: ~17.5 GB / 64 = ~0.27 GB per GPU
- Active layer (gathered briefly): ~few GB peak
- Activations: depends on batch and sequence length

Vs. DDP: 70B model needs ~1120 GB per GPU. Doesn't fit. FSDP enables it.

## Bandwidth cost

Roughly 2× DDP's all-reduce volume (the all-gather of weights + reduce-scatter of grads). PyTorch overlaps these with compute aggressively. Steady-state throughput is typically 80-95% of theoretical max — competitive with DDP when DDP can't fit at all.

## Configuration knobs

```python
from torch.distributed.fsdp import FullyShardedDataParallel as FSDP
from torch.distributed.fsdp import ShardingStrategy

model = FSDP(
    model,
    sharding_strategy=ShardingStrategy.FULL_SHARD,  # ZeRO-3 equivalent
    mixed_precision=mp_policy,
    device_id=local_rank,
)
```

`SHARD_GRAD_OP` is ZeRO-2; `NO_SHARD` is DDP. Switch up if memory is fine and bandwidth is the bottleneck.

<!-- tier:grad -->
# FSDP (Grad)

Practical gotchas:

- **CPU offload**: stash optimizer state on host RAM; pull as needed. Massive memory savings; ~30-50% throughput cost. Useful when GPU memory is the binding constraint.
- **Activation checkpointing**: combine with FSDP for biggest savings. Each forward does 2× compute but cuts activation memory dramatically.
- **`full_state_dict` vs `sharded_state_dict`**: checkpointing all-gathers weights to rank 0 and saves a single file (slow on big models, simple consumer) or saves per-rank shards (fast, but loading requires the same world size). Modern recipes use `sharded_state_dict` + a separate consolidation tool for shipping checkpoints.
- **Wrapping policy**: by default, FSDP wraps the entire module as one shard. Better: `transformer_auto_wrap_policy` wraps each transformer block as its own shard, enabling finer-grained gather/free. Critical for memory; rarely the default in tutorials.
- **Compile interaction**: `torch.compile` + FSDP has improved a lot in 2.4+ but still has rough edges. Test before relying on it.

When FSDP isn't enough:
- Beyond ~100B parameters, mix FSDP with TP and PP (3D parallelism).
- For inference, switch to TP (FSDP's per-step gather is too slow for inference).
