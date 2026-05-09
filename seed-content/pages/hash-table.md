---
title: Hash Table
category: algorithms
---
<!-- tier:intro -->
# Hash Table

A **hash table** maps keys to values via a hash function: `index = hash(key) % capacity`. Provides expected O(1) insert, lookup, delete.

The "expected O(1)" is conditional. With good hash functions + low load factor + collision resolution, most operations are constant-time. With pathological collisions or high load, operations degrade to O(n).

Underpins: dictionaries (Python dict, JavaScript Map), database indexes, caches, sets, and roughly 80% of "make this fast" optimizations in real code.

<!-- tier:undergrad -->
# Hash Table (Undergrad)

## Mechanics

1. **Hash function**: maps key (string, integer, struct) to a bucket index. Good hash functions distribute keys uniformly.
2. **Buckets**: array of slots, each holding zero or more (key, value) pairs.
3. **Collision resolution**: when two keys hash to the same bucket. See [[hash-collisions]].
4. **Load factor**: $\alpha = n / \text{capacity}$. When $\alpha$ exceeds a threshold (typically 0.75), the table **resizes** — doubles capacity, rehashes all entries.

## Why O(1) expected

Under the **uniform hashing assumption** (each key hashes to each bucket with equal probability), the expected number of keys per bucket is $\alpha$. With $\alpha < 1$ (kept low via resizing), most buckets have ≤ 1 entry, so lookups are constant.

The assumption fails when:
- The hash function is bad (poor distribution).
- Adversarial input (hash flooding attacks — picked keys all hash to the same bucket).
- Load factor too high (resize too late).

## Resizing cost

When the load factor crosses the threshold, the table doubles capacity + rehashes every entry — an O(n) operation. Amortized over many insertions, the average insert cost stays O(1), but a single insert can be slow.

For latency-sensitive applications (real-time systems), this O(n) spike is a concern. Solutions: pre-size the table, use incremental rehashing, or pick a data structure with bounded worst-case (B-tree, skiplist).

## In ML

Embedding lookups in transformers are conceptually hash-table operations on the vocabulary. Sparse-matrix representations use hash tables for non-zero entries. Feature hashing (the "hashing trick") explicitly uses hash functions for high-cardinality categorical features.

<!-- tier:grad -->
# Hash Table (Grad)

## Modern hash functions

For non-cryptographic use:
- **MurmurHash3**: fast, good distribution.
- **xxHash**: faster than MurmurHash, also good distribution.
- **CityHash / FarmHash** (Google): optimized for short keys.
- **SipHash**: keyed (resists adversarial input), used in Python 3 dict.

For cryptographic use (passwords, MACs): SHA-256, BLAKE2 — slower but collision-resistant.

## Robin Hood + cuckoo hashing

**Robin Hood hashing** balances the lookup cost across buckets — when inserting, swap entries so all entries are at distance ≤ d from their ideal bucket. Improves worst-case lookup.

**Cuckoo hashing**: each key has TWO possible buckets (via two hash functions). Worst-case lookup: 2 probes. Insertion: may need to evict + re-place existing entries. Used when worst-case latency matters more than insertion speed.

## Hash flooding attacks

A naive hash table with a known hash function lets an attacker craft inputs that all hash to the same bucket → O(n) per lookup → service denial. Notable example: Perl 5 (2003), Python (2012), Ruby on Rails (2011) all had hash flooding CVEs.

The fix: use a **keyed hash function** (SipHash) where the seed is randomized per process. Now attackers can't predict bucket assignments.

## Open vs chained

**Chained**: each bucket holds a linked list (or balanced tree) of entries. Simple, robust to high load factors. Java HashMap, Python dict (since 3.6).

**Open addressing** (linear/quadratic probing, double hashing): all entries in the array; collisions resolved by trying alternative slots. Better cache locality; sensitive to load factor (above ~0.7 performance degrades sharply). Used by Go's map, Swift's Dictionary.
