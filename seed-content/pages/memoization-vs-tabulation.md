---
title: Memoization vs Tabulation
category: algorithms
---
<!-- tier:intro -->
# Memoization vs Tabulation

Two implementation styles for [[dynamic-programming]]:

- **Memoization** (top-down): natural recursive code with a cache. Compute each subproblem on first request, store in a dict.
- **Tabulation** (bottom-up): build the answer table iteratively in dependency order.

Same asymptotic complexity. Different ergonomics.

<!-- tier:undergrad -->
# Memoization vs Tabulation (Undergrad)

## Memoization (Python)

```python
@lru_cache(maxsize=None)
def fib(n):
    if n < 2: return n
    return fib(n-1) + fib(n-2)
```

Pros: natural recursive code; only computes subproblems actually needed.

Cons: function-call + cache-lookup overhead per call; risk of stack overflow on deep recursion (Python: ~1000 default).

## Tabulation (Python)

```python
def fib(n):
    if n < 2: return n
    table = [0] * (n+1)
    table[1] = 1
    for i in range(2, n+1):
        table[i] = table[i-1] + table[i-2]
    return table[n]
```

Pros: iterative, no stack issues; constant-factor faster (no function-call overhead); easier to reason about memory.

Cons: requires figuring out the iteration order; computes all subproblems even if some aren't needed.

## When to prefer which

- **Memoization**: prototyping, when the recursive structure is natural, when you only need a small subset of subproblems.
- **Tabulation**: production code where speed matters, when you want to space-optimize (only keep last few rows of table), when recursion depth would blow the stack.

## Space optimization

Tabulation often allows space optimization. Fibonacci tabulation uses O(n) space; can be reduced to O(1) since we only need the last 2 values:

```python
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

Memoization can't do this — the cache keeps all subproblem results around.

For large DPs (e.g., 2D table for sequence alignment), the rolling-window optimization can save 50% or more memory.
