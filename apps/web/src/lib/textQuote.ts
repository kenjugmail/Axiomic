// Text-quote annotation per the W3C Web Annotation Data Model. Stores
// a passage as { exact, prefix, suffix } so that even after small edits
// to the surrounding article we can still locate the original quote
// with high confidence.
//
// Anchoring is two-step:
// 1. extractTextQuote() walks the current Selection + the article root
//    to read out the highlighted exact text plus ~32 chars of prefix /
//    suffix context.
// 2. findTextQuote() walks all text nodes inside the article element,
//    concatenates them with an offset map, and locates the best match
//    for { exact, prefix, suffix } using a small scoring function. It
//    returns a Range that the caller can highlight (CSS Highlight API)
//    or scroll-into-view.
//
// We do NOT mutate the DOM. The caller decides how to render the match.

const CONTEXT_LEN = 32;

export interface TextQuote {
  exact: string;
  prefix: string;
  suffix: string;
}

// Concatenate all text nodes under `root` into a single string and a
// parallel array mapping (concatenatedOffset → {node, nodeOffset}) so
// we can convert a substring index back into a DOM Range.
interface TextMap {
  text: string;
  // For each character at index i, which text node + offset within
  // that node corresponds. Storing per-node start indices instead of a
  // per-character map keeps memory linear in #nodes, not #chars.
  segments: Array<{ node: Text; start: number; end: number }>;
}

function buildTextMap(root: Element): TextMap {
  const segments: TextMap["segments"] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      // Skip text inside elements we don't want to anchor on (e.g. our
      // own claim-thread highlights, code blocks if we wanted — keep
      // permissive for now).
      const parent = (node as Text).parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      // Skip script / style / noscript children defensively.
      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let node = walker.nextNode() as Text | null;
  while (node) {
    const v = node.nodeValue ?? "";
    if (v.length > 0) {
      const start = text.length;
      text += v;
      segments.push({ node, start, end: text.length });
    }
    node = walker.nextNode() as Text | null;
  }
  return { text, segments };
}

// Convert a [startIdx, endIdx) range in the concatenated text back to
// a DOM Range. Returns null if either endpoint can't be resolved.
function indicesToRange(
  map: TextMap,
  startIdx: number,
  endIdx: number,
): Range | null {
  const findSeg = (idx: number) => {
    // Linear scan is fine: typical articles have ≤ a few hundred text
    // nodes, fewer than 10k for the largest pages.
    for (const seg of map.segments) {
      if (idx >= seg.start && idx <= seg.end) {
        return { node: seg.node, offset: idx - seg.start };
      }
    }
    return null;
  };
  const s = findSeg(startIdx);
  const e = findSeg(endIdx);
  if (!s || !e) return null;
  const range = document.createRange();
  try {
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
  } catch {
    return null;
  }
  return range;
}

// Extract a TextQuote from the user's current selection scoped to
// `root`. Returns null if no selection, the selection is collapsed, or
// the selection extends outside the root element.
export function extractTextQuote(root: Element): TextQuote | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }
  const exact = range.toString();
  if (exact.trim().length < 4) return null;

  const map = buildTextMap(root);
  // Locate the start/end indices of the selection in the concatenated
  // text. We do this by walking segments and finding the one
  // containing each endpoint.
  const findIdx = (node: Node, offset: number): number | null => {
    for (const seg of map.segments) {
      if (seg.node === node) {
        return seg.start + offset;
      }
    }
    // Container is an element (e.g. selection ends just after a node);
    // skip — extractTextQuote returning null is safer than guessing.
    return null;
  };
  const startIdx = findIdx(range.startContainer, range.startOffset);
  const endIdx = findIdx(range.endContainer, range.endOffset);
  if (startIdx === null || endIdx === null) return null;
  if (endIdx <= startIdx) return null;

  const prefix = map.text.slice(Math.max(0, startIdx - CONTEXT_LEN), startIdx);
  const suffix = map.text.slice(endIdx, endIdx + CONTEXT_LEN);
  return { exact, prefix, suffix };
}

// Find a stored TextQuote in the rendered DOM under `root`. Strategy:
// 1. Find every occurrence of `exact` in the concatenated text (case-
//    sensitive — quotes are by definition the exact passage).
// 2. Score each candidate by how much of prefix / suffix matches around
//    it. Highest score wins; ties broken by first-occurrence.
// 3. Return a Range covering the chosen occurrence, or null when no
//    occurrence is found at all (article was edited; treat as orphan).
export function findTextQuote(root: Element, q: TextQuote): Range | null {
  if (!q.exact) return null;
  const map = buildTextMap(root);
  if (!map.text) return null;
  const exact = q.exact;
  const candidates: number[] = [];
  let from = 0;
  while (from <= map.text.length - exact.length) {
    const idx = map.text.indexOf(exact, from);
    if (idx === -1) break;
    candidates.push(idx);
    from = idx + 1;
  }
  if (candidates.length === 0) return null;
  if (candidates.length === 1) {
    return indicesToRange(map, candidates[0], candidates[0] + exact.length);
  }

  // Multiple matches — pick the one whose surrounding text best matches
  // the stored prefix + suffix. Score is # chars of prefix matched (from
  // the right) plus # chars of suffix matched (from the left).
  let best = candidates[0];
  let bestScore = -1;
  for (const start of candidates) {
    const before = map.text.slice(Math.max(0, start - q.prefix.length), start);
    const after = map.text.slice(start + exact.length, start + exact.length + q.suffix.length);
    let score = 0;
    // Compare from the end of before vs end of stored prefix (right-aligned).
    for (let i = 1; i <= Math.min(before.length, q.prefix.length); i++) {
      if (before[before.length - i] === q.prefix[q.prefix.length - i]) score++;
      else break;
    }
    // Compare from the start of after vs start of stored suffix (left-aligned).
    for (let i = 0; i < Math.min(after.length, q.suffix.length); i++) {
      if (after[i] === q.suffix[i]) score++;
      else break;
    }
    if (score > bestScore) {
      bestScore = score;
      best = start;
    }
  }
  return indicesToRange(map, best, best + exact.length);
}
