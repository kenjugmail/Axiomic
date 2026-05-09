---
title: Hash Collisions
category: algorithms
---
<!-- tier:intro -->
# Hash Collisions

A **collision** happens when two distinct keys hash to the same bucket. Inevitable in practice — by pigeonhole, with $b$ buckets and $n > b$ keys, some bucket has multiple keys.

Two main resolution strategies:

- **Chaining**: each bucket holds a linked list (or balanced tree). Collisions added to the list. Lookup walks the list.
- **Open addressing** (linear/quadratic probing, double hashing): on collision, try a sequence of alternative buckets. All entries in one array.

Both work; chaining is simpler + tolerates higher load factors; open addressing has better cache locality at low load factors.

<!-- tier:undergrad -->
# Hash Collisions (Undergrad)

## Birthday paradox

With a uniform hash function and $n$ keys into $b$ buckets, the expected number of collisions starts surprisingly early. For $b = 365$ and $n = 23$, the probability of at least one collision is > 50% (the birthday paradox).

This means: even with a perfect hash function, collisions are common. Resolution strategies aren't optional.

## Chaining

Each bucket is a list. Insert prepends; lookup walks until found or end of list. Average chain length = $\alpha$ (load factor). Average lookup: $O(1 + \alpha)$.

Tolerates load factors > 1. If chains get too long, performance degrades — typical implementations resize when $\alpha > 0.75$.

Modern variant: **chained tree-bucket** — when a chain exceeds a threshold (8 in Java HashMap), convert to a balanced BST. Bounds worst-case lookup at $O(\log n)$ even under hash flooding.

## Open addressing

On collision, probe alternative buckets:
- **Linear**: try $h(k) + 1, h(k) + 2, \ldots$ Bad for clustering.
- **Quadratic**: try $h(k) + 1, h(k) + 4, h(k) + 9, \ldots$ Reduces clustering.
- **Double hashing**: try $h(k) + i \cdot h_2(k)$ for $i = 1, 2, \ldots$ Best for spreading.

Open addressing requires load factor < 1; performance degrades sharply above ~0.7.

## Adversarial inputs (hash flooding)

Attacker crafts keys that all hash to the same bucket → O(n) per lookup → DoS. Mitigations:

- **Keyed hashing** (SipHash, randomized seed per process). Used by Python 3 dict, Ruby hash.
- **Rebalance to BST** when chains get long. Java HashMap.
- **Cuckoo hashing**: bounded worst case.
