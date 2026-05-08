---
title: NCCL Collectives
category: systems
---
<!-- tier:intro -->
# NCCL Collectives

NCCL (NVIDIA Collective Communications Library) is the substrate for multi-GPU training. PyTorch DDP and FSDP both call into NCCL under the hood. Understanding the collectives it provides — and their bandwidth costs — is the difference between scaling cleanly and bottlenecking on comm.

The four collectives that matter for ML:

- **All-reduce**: every rank sums its tensor with all others; every rank ends with the sum. (Used for gradient averaging in DDP.)
- **Reduce-scatter**: like all-reduce, but each rank ends with a different shard of the sum. (Used for FSDP gradient reduction.)
- **All-gather**: each rank sends its shard; every rank ends with the concatenation. (Used for FSDP weight gathering.)
- **Broadcast**: one rank sends; all others receive. (Used for initial weight distribution.)

<!-- tier:undergrad -->
# NCCL (Undergrad)

## Bandwidth cost per collective

For tensor of size `T` bytes and `N` ranks:

- **All-reduce**: ~`2(N-1)/N · T` bytes per rank (ring algorithm).
- **Reduce-scatter**: ~`(N-1)/N · T` bytes per rank.
- **All-gather**: ~`(N-1)/N · T` bytes per rank.
- **Broadcast**: ~`T` bytes total from sender; ~`T` bytes received per receiver.

Note that all-reduce ≈ reduce-scatter + all-gather; FSDP exploits this by separately staging the reduce-scatter (gradient sync) and all-gather (weight load).

## Ring vs tree

NCCL implements two algorithms, picks dynamically:

- **Ring**: bandwidth-optimal for large messages. Each rank sends ~T/N bytes per "step"; the ring has 2(N-1) steps. Good for gradient all-reduces on large tensors.
- **Tree**: latency-optimal for small messages. log(N) hops vs N-1. Good for small tensors or many small-message ops.

NCCL's tuning: `NCCL_ALGO=Ring` or `Tree` to force; `NCCL_DEBUG=INFO` to see what it picked.

## Hierarchical reductions

For multi-host training, NCCL can do hierarchical all-reduces:
1. All-reduce within each host (NVLink, fast).
2. All-reduce across host leaders (InfiniBand, slow).
3. Broadcast within each host (NVLink, fast).

Total inter-host comm: just the leader-leader exchange. Much faster than naive N-way all-reduce across the whole pod. NCCL does this automatically for sufficiently large topologies.

<!-- tier:grad -->
# NCCL (Grad)

Tuning + diagnostics:

- **`NCCL_DEBUG=INFO`**: prints the topology NCCL detected and the algorithm picked. Look for "Channel 00" entries showing the ring/tree shape.
- **`NCCL_TOPO_DUMP_FILE`**: dumps the inferred GPU-to-network topology. Useful when NCCL picks unexpectedly slow paths (e.g., not using NVLink because it didn't detect the switch).
- **`NCCL_SOCKET_IFNAME`**: which network interface to use for inter-host. Default is auto-detect; on misconfigured clusters this can pick a slow management network instead of the fast InfiniBand fabric.
- **`NCCL_IB_HCA`**: which InfiniBand HCA to use; matters on multi-NIC hosts.

Performance benchmarks: `nccl-tests` (`all_reduce_perf`, `all_gather_perf`) reproduce the bandwidth NCCL achieves on your specific hardware. Run before any large training; if your all-reduce throughput is < 70% of theoretical max, comm is the bottleneck and the training will scale poorly.

PyTorch's `dist.barrier()` synchronizes ranks but doesn't move data. Avoid in hot paths; it adds latency without value. The implicit synchronization at the end of an all-reduce is sufficient for most workflows.
