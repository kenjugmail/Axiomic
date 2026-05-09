---
title: Trie
category: algorithms
---
<!-- tier:intro -->
# Trie (Prefix Tree)

A **trie** stores strings such that all descendants of a node share a common prefix. Each edge is labeled with a character; traversing root-to-leaf spells the word.

Lookup, insert, prefix search: $O(L)$ where $L$ is the string length. Independent of total number of strings stored.

Workhorse for: autocomplete, spell-check, IP routing tables, longest-prefix-match queries, BPE tokenization (used in modern transformer tokenizers — see [[bpe-tokenization]]).

<!-- tier:undergrad -->
# Trie (Undergrad)

## Structure

Each node holds a map from character → child node. A flag at each node indicates whether it represents a complete word.

```
        (root)
       /  |   \
      c   d    f
      |   |    |
      a   o    o
     /|\  |   /|
    t r b g  o r
    |   |
    s   y
```

Strings stored: cat, cars (cat + s), cab, dog, foo, for. Search "ca" finds the prefix sub-tree (3 words).

## Operations

- **Insert**: walk path; create nodes as needed; mark final.
- **Lookup**: walk path; check final flag.
- **Prefix search**: walk path; collect all words in sub-tree.
- **Delete**: walk path; unmark; prune sub-trees that become empty.

## Space

Naive trie can be space-hungry — one node per character per word. Optimizations:

- **Compressed trie / radix tree**: collapse single-child chains into one edge with a string label. Saves space when many strings share unique suffixes.
- **HAT-trie**: hybrid array + trie; better cache behavior than pure trie.

## Applications

- **IP routing**: longest-prefix-match queries on IP addresses. Linux uses level-compressed tries (LC-trie).
- **Autocomplete**: prefix search on a trie of words sorted by frequency.
- **Spell-check**: BK-tree variants on character n-grams; trie-based approaches with edit-distance traversal.
- **Tokenizers**: BPE + WordPiece use trie-like structures for fast subword matching during tokenization.
