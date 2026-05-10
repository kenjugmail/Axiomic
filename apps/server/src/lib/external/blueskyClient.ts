// Sprint 72 — BlueSky (AT Proto) ingestor.
//
// Uses the public unauthenticated AppView at api.bsky.app — no
// app-password / OAuth needed because we only read public posts.
// Polite limit: 1 req/sec. Two endpoints in play:
//
//   1. /xrpc/app.bsky.actor.getProfile?actor=<handle>
//      → resolve handle → DID + display name.
//   2. /xrpc/app.bsky.feed.getAuthorFeed?actor=<handle>&limit=50
//      → most-recent posts by an actor (DID or handle works).
//
// We only persist posts that reference at least one paper (DOI or
// arXiv ID extracted from the post text); pure social chatter
// stays out of our database.

import { rateLimitedFetch, type FetchLike } from "./httpClient";
import { extractPaperRefs, type ExtractedRef } from "./extractPaperRefs";

const BSKY_BASE = "https://api.bsky.app";
const BSKY_MIN_INTERVAL_MS = 1000;

interface BlueskyPostRecord {
  text?: string;
  createdAt?: string;
}

interface BlueskyPost {
  uri?: string;
  cid?: string;
  author?: { handle?: string; did?: string; displayName?: string };
  record?: BlueskyPostRecord;
  indexedAt?: string;
}

interface BlueskyFeedItem {
  post?: BlueskyPost;
}

interface BlueskyFeedResponse {
  feed?: BlueskyFeedItem[];
  cursor?: string;
}

export interface BlueskyResearcherPost {
  // Stable upstream id — we use the post URI's record key segment.
  postId: string;
  authorHandle: string;
  authorDisplayName?: string;
  text: string;
  postedAt: string | null;
  // https://bsky.app/profile/<handle>/post/<rkey>
  url: string;
  // 0+ entries; only posts with at least one ref are persisted.
  references: ExtractedRef[];
}

function uriToRkey(uri: string | undefined): string | null {
  if (!uri) return null;
  // at://did:plc:.../app.bsky.feed.post/<rkey>
  const m = uri.match(/\/([a-z0-9]+)$/i);
  return m ? m[1] : null;
}

function buildPostUrl(handle: string, rkey: string): string {
  return `https://bsky.app/profile/${handle}/post/${rkey}`;
}

export interface BlueskyClientOptions {
  fetchImpl?: FetchLike;
}

// Fetch the most-recent posts by `handle` and return only those
// that reference a paper (DOI or arXiv ID). Out-of-band reposts +
// non-textual records are ignored.
export async function fetchResearcherPosts(
  handle: string,
  opts: BlueskyClientOptions = {},
): Promise<BlueskyResearcherPost[]> {
  const params = new URLSearchParams({ actor: handle, limit: "50" });
  const res = await rateLimitedFetch(
    `${BSKY_BASE}/xrpc/app.bsky.feed.getAuthorFeed?${params.toString()}`,
    {
      minIntervalMs: BSKY_MIN_INTERVAL_MS,
      fetchImpl: opts.fetchImpl,
    },
  );
  if (!res.ok) {
    throw new Error(`Bluesky getAuthorFeed returned ${res.status}`);
  }
  const data = (await res.json()) as BlueskyFeedResponse;
  const items = data.feed ?? [];
  const out: BlueskyResearcherPost[] = [];
  for (const it of items) {
    const post = it.post;
    if (!post) continue;
    const text = post.record?.text;
    if (!text || typeof text !== "string") continue;
    const refs = extractPaperRefs(text);
    if (refs.length === 0) continue;
    const rkey = uriToRkey(post.uri);
    if (!rkey) continue;
    out.push({
      postId: rkey,
      authorHandle: post.author?.handle ?? handle,
      authorDisplayName: post.author?.displayName,
      text: text.slice(0, 1500),
      postedAt: post.record?.createdAt ?? post.indexedAt ?? null,
      url: buildPostUrl(post.author?.handle ?? handle, rkey),
      references: refs,
    });
  }
  return out;
}
