---
title: PagedAttention
category: systems
---
<!-- tier:intro -->
# PagedAttention

PagedAttention treats the KV cache like operating-system virtual memory: allocate fixed-size pages on demand, maintain per-request page tables, share pages across requests with the same prefix.

Introduced in vLLM (Kwon et al. 2023). The single biggest win for LLM inference throughput in 2023.

The problem it solves: naive KV-cache allocation pre-reserves max-sequence-length space per request. Most requests don't use their full max → utilization is typically <30%. PagedAttention pushes utilization above 95%, enabling 4-5× more concurrent requests on the same hardware.

<!-- tier:undergrad -->
# PagedAttention (Undergrad)

## The KV cache memory problem

For a 7B model at seq_len 8K in fp16:
```
2 (K + V) × 32 layers × 8K tokens × 32 heads × 128 head_dim × 2 bytes ≈ 4 GB per request
```

Serving 100 concurrent 8K-context requests: 400 GB of KV cache. Doesn't fit on one GPU.

In practice, most requests don't hit 8K — typical use is 1K-4K. But the naive allocator reserves max-length space upfront because reallocating mid-sequence is expensive. The unused capacity is wasted.

## Pages + page tables

PagedAttention slices the KV cache into fixed-size **pages** (typically 16 or 32 tokens worth of K + V data). The system maintains:

- A **page pool**: all pages allocated to all requests.
- A **per-request page table**: a list of page indices owned by each request.

When a request grows by another token:
1. If the current page has space, write into it.
2. If full, allocate a new page from the pool, append its index to the request's page table.

When a request finishes, all its pages return to the pool.

## Attention computation with pages

Attention reads K and V for all positions in the sequence. With pages, this becomes:

```
for each page in the request's page table:
    load page from HBM
    contribute to attention output
```

Each page read is a contiguous HBM access. The page table itself is small. The implementation is a custom CUDA kernel; vLLM ships it.

## Prefix sharing

A nice side-effect: multiple requests with the same prefix can **share pages**. A chat assistant with the same system prompt for every user reuses the system-prompt pages across all concurrent users. With heavy prefix sharing, KV cache memory drops dramatically.

vLLM exposes this via `--enable-prefix-caching`. Big win for assistant-style workloads.

<!-- tier:grad -->
# PagedAttention (Grad)

Implementation details that matter:

- **Page size**: 16 vs 32 tokens. Smaller → finer-grained (less waste at the tail) but more fragmentation overhead. vLLM defaults to 16; some forks use 32 for slightly higher per-page efficiency.
- **Block manager**: tracks free pages, allocates / frees, handles copy-on-write for prefix sharing. Implementation is a thin C++ layer with Python bindings.
- **Attention kernel**: integrates the page-table indirection into the attention compute. Slightly more complex than vanilla attention but the throughput gain dwarfs the per-kernel overhead.

Variants and extensions:
- **Continuous KV cache compaction**: when fragmentation grows, periodically compact the page pool. Marginal improvement; rarely needed in practice because page sizes are small enough that fragmentation is bounded.
- **Disaggregated KV cache** (DistServe): split prefill and decode across different machines, exchange KV cache over the network. Useful for very heterogeneous workloads (long-context prefill + fast decoding).
- **Cross-request KV reuse**: more aggressive than prefix sharing — match arbitrary substrings. Engineering complexity; modest additional gain.

The OS-virtual-memory analogy is exact and useful. Memory used: physical KV cache → physical RAM. Pages: 4KB OS pages, 16-token KV pages. Per-process page table: per-request page table. Page faults / on-demand allocation: same model. The decades of OS engineering on this pattern translate directly.
